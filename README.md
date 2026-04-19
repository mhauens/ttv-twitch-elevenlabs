# ttv-twitch-elevenlabs

Lokaler Windows-First-Service fuer burst-sichere Alert-Verarbeitung mit HTTP-Intake, waehlbarer Text-to-Speech-Ausgabe ueber ElevenLabs, Windows-Sprachsynthese oder Stub-Modus, lokaler Audiowiedergabe, SQLite-gestuetztem Overflow und deterministischer Restart-Recovery.

Das Projekt ist fuer Twitch-nahe Events und lokale Alert-Pipelines gedacht: Alerts werden angenommen, in einer Single-Consumer-Queue verarbeitet, bei Lastspitzen nicht still verworfen und nach einem Neustart kontrolliert wieder aufgenommen.

Offiziell unterstuetzte Intake-Quellen fuer `POST /api/v1/alerts` sind `local`, `twitch`, `streamerbot` und `mixitup`.

## Kernfunktionen

- Burst-sichere Alert-Annahme ueber `POST /api/v1/alerts`
- Nicht-praeemptive Single-Consumer-Verarbeitung: ein aktiver Alert wird nicht durch spaetere Alerts unterbrochen
- SQLite-gestuetzter Overflow, wenn die In-Memory-Grenze erreicht ist
- Deterministische Recovery nach Neustart
- Queue- und Readiness-Sichtbarkeit ueber `GET /api/v1/queue` und `GET /api/v1/health`
- Kombinierter Realtime-Statusstrom ueber `GET /api/v1/status/stream` (SSE) und `/api/v1/status/ws` (WebSocket)
- Lokale Audioausgabe ueber VLC oder mpv
- Stub-Modus fuer lokale Entwicklung ohne echte ElevenLabs-Anbindung
- Windows-TTS-Modus fuer lokale Sprachsynthese ohne ElevenLabs-Zugang

## Queue-Garantien

- Es gibt genau einen Consumer.
- Ein aktiver Alert bleibt aktiv, bis er abgeschlossen oder fehlgeschlagen ist.
- Akzeptierte Arbeit behaelt ihre sichtbare FIFO-Reihenfolge.
- Wenn der Speicher voll ist, wird neuer Backlog nach SQLite verschoben statt verworfen.
- Wenn bereits deferierter Backlog existiert, bekommt neuer Intake keine Ausfuehrungsprioritaet davor.
- Ein waehrend eines unerwarteten Stopps aktiver Alert wird beim Start als `recovery-failed` markiert und nicht automatisch erneut abgespielt.
- Die Readiness bleibt `unavailable`, wenn Recovery oder Persistenz neuen Intake unsicher machen.

## Tech-Stack

- Node.js 22 LTS
- TypeScript 5
- Express 5
- Zod
- Pino
- better-sqlite3
- Vitest und Supertest

## Voraussetzungen

- Windows 10 oder 11
- Node.js 22 LTS
- Ein lokal installierter Player wie VLC oder mpv
- Schreibrechte fuer:
  - `QUEUE_DB_PATH` fuer SQLite-Persistenz
  - `AUDIO_OUTPUT_DIR` fuer erzeugte Audioartefakte

## Schnellstart

```powershell
pnpm install
Copy-Item .env.example .env
pnpm build
pnpm dev
```

Standardmaessig nutzt das Projekt diese lokalen Pfade:

- `.queue-data/alerts.sqlite` fuer Overflow und Recovery-Metadaten
- `.audio-output/` fuer temporaere Audioausgaben

Fuer lokale Entwicklung ohne ElevenLabs reicht meist:

```env
TTS_MODE=stub
PLAYER_KIND=vlc
PLAYER_COMMAND=vlc
```

Fuer lokale Windows-Sprachsynthese ohne externe TTS-API:

```env
TTS_MODE=windows
PLAYER_KIND=vlc
PLAYER_COMMAND=vlc
```

Der Windows-Modus ist nur auf Windows unterstuetzt, verwendet die Standardstimme des Systems und bleibt fuer die audible Ausgabe auf den konfigurierten Player angewiesen.

## Konfiguration

Die Laufzeitkonfiguration kommt aus `.env`. Wichtige Variablen:

| Variable | Bedeutung |
| --- | --- |
| `HOST` / `PORT` | Bind-Adresse des HTTP-Servers |
| `QUEUE_MEMORY_LIMIT` | Maximaler In-Memory-Backlog vor Overflow |
| `QUEUE_DEFERRED_LIMIT` | Obergrenze fuer deferierten Backlog in SQLite |
| `QUEUE_DB_PATH` | SQLite-Datei fuer Overflow und Recovery |
| `AUDIO_OUTPUT_DIR` | Verzeichnis fuer generierte Audio-Dateien |
| `PLAYER_KIND` | Player-Typ, z. B. `vlc` oder `mpv` |
| `PLAYER_COMMAND` | Ausfuehrbarer Player-Befehl auf dem Zielsystem |
| `PLAYER_TIMEOUT_MS` | Timeout fuer lokale Wiedergabe |
| `TTS_MODE` | `stub` fuer lokal, `elevenlabs` fuer externe TTS, `windows` fuer lokale Windows-Sprachsynthese |
| `ELEVENLABS_API_KEY` | API-Key fuer ElevenLabs |
| `ELEVENLABS_VOICE_ID` | Zielstimme fuer ElevenLabs |
| `ELEVENLABS_MODEL_ID` | ElevenLabs-Modell |
| `SHUTDOWN_POLICY` | Aktuell `preserve-pending` fuer kontrolliertes Persistieren beim Stop |

Die vollstaendige Beispielkonfiguration steht in [.env.example](/c:/development/ttv-twitch-elevenlabs/.env.example).

Wenn `TTS_MODE=windows` gesetzt ist, schlaegt der Start vor Readiness fehl, falls die App nicht auf Windows laeuft oder der lokale Windows-Sprachpfad beziehungsweise `AUDIO_OUTPUT_DIR` nicht fuer einen temporaeren WAV-Schreibtest nutzbar ist.

## API-Ueberblick

### `POST /api/v1/alerts`

Nimmt einen Alert an und fuehrt ihn sofort oder spaeter aus.

Beispiel:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/v1/alerts -ContentType 'application/json' -Body (@{
  source = 'local'
  alertType = 'cheer'
  payload = @{ userName = 'tester'; message = 'hello queue' }
} | ConvertTo-Json -Depth 5)
```

Typische Outcomes:

- `accepted`
- `deferred-to-disk`
- `duplicate-handled`

Moegliche Fehlercodes kommen unter anderem bei ungueltigen Requests, Backpressure oder unsicherem Recovery-Zustand zurueck.
Wenn der konfigurierte Player nicht verfuegbar ist oder der Service bereits herunterfaehrt, antwortet der Intake ebenfalls mit `503`.

Der bestehende Request bleibt fuer alle Quellen identisch:

- `source`
- `alertType`
- optional `dedupeKey`
- `payload`

Der Response-Envelope bleibt ebenfalls unveraendert. Wichtige Automationssignale sind:

- Mix It Up: `data.outcome`, `data.jobId`
- Streamer.bot: HTTP-Status, `data.outcome`, `data.jobId`

### `GET /api/v1/status/stream`

Liefert den kombinierten Queue- und Health-Status als Server-Sent Events:

- sofort ein `snapshot`-Event mit dem aktuellen Zustand
- weitere `snapshot`-Events nur bei semantischen Aenderungen
- `: keepalive`-Kommentare waehrend Idle-Phasen

Beispiel:

```powershell
node examples/status-stream-sse.mjs
```

### `GET /api/v1/status/ws`

Liefert denselben kombinierten Status als rohe JSON-Nachrichten ueber WebSocket. Client-Nachrichten werden ignoriert; bei Idle-Verbindungen sendet der Server Ping-Traffic.

Beispiel:

```powershell
node examples/status-stream-ws.mjs
```

## Offizielle Integrationen

### Mix It Up

Verwende in Mix It Up eine `Web Request`-Action mit diesen Einstellungen:

- Methode: `POST`
- URL: `http://127.0.0.1:3000/api/v1/alerts`
- Header: `Content-Type: application/json`
- Body:

```json
{
  "source": "mixitup",
  "alertType": "follow",
  "payload": {
    "userName": "$username",
    "message": "Willkommen im Stream"
  }
}
```

Fuer die weitere Automatisierung sind `data.outcome` und `data.jobId` die offiziellen Signale.

### Streamer.bot

Offiziell unterstuetzt ist nur der Script-/Program-Execution-POST-Flow. Verwende dafuer das Node.js-Beispiel in [examples/streamerbot-alert.mjs](/c:/development/ttv-twitch-elevenlabs/examples/streamerbot-alert.mjs) oder uebernimm denselben Request in ein eigenes Script.

Der relevante Request-Body bleibt:

```json
{
  "source": "streamerbot",
  "alertType": "raid",
  "payload": {
    "userName": "raid-leader",
    "message": "Raid erfolgreich uebernommen"
  }
}
```

Fuer Erfolg oder Fehler werden offiziell der HTTP-Status sowie `data.outcome` und `data.jobId` ausgewertet.

### `GET /api/v1/queue`

Liefert die operative Queue-Sicht, darunter:

- `activeJob`
- `inMemoryDepth`
- `deferredDepth`
- `oldestPendingAgeMs`
- `recentFailures`
- `recentRejections`

### `GET /api/v1/health`

Liefert Readiness und Betriebszustand, darunter:

- `ready`
- `queuePersistenceReady`
- `playerReady`
- `configurationValid`
- optional `recoveryMessage`

Wenn `playerReady=false` oder der Service sich im Shutdown befindet, nimmt `POST /api/v1/alerts` keine neue Arbeit mehr an.

Die Stream-Endpunkte bleiben trotzdem verfuegbar, damit auch degradierte Zustandsbilder live beobachtet werden koennen.

Die formale API-Beschreibung liegt in [local-alert-api.openapi.yaml](/c:/development/ttv-twitch-elevenlabs/specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml).

## Entwicklung

```powershell
pnpm dev
pnpm lint
pnpm test
pnpm build
```

Empfohlene Mindestvalidierung fuer nicht-triviale Aenderungen:

```powershell
pnpm lint
pnpm test
pnpm build
```

Beispiele fuer Requests und Burst-Tests:

- [examples/alerts.http](/c:/development/ttv-twitch-elevenlabs/examples/alerts.http)
- [examples/status-stream-sse.mjs](/c:/development/ttv-twitch-elevenlabs/examples/status-stream-sse.mjs)
- [examples/status-stream-ws.mjs](/c:/development/ttv-twitch-elevenlabs/examples/status-stream-ws.mjs)
- [examples/streamerbot-alert.mjs](/c:/development/ttv-twitch-elevenlabs/examples/streamerbot-alert.mjs)
- [examples/burst-alerts.json](/c:/development/ttv-twitch-elevenlabs/examples/burst-alerts.json)

## Projektstruktur

- [src/app](/c:/development/ttv-twitch-elevenlabs/src/app): Bootstrap und HTTP-Server
- [src/config](/c:/development/ttv-twitch-elevenlabs/src/config): Env-Validierung und Queue-Konfiguration
- [src/domain](/c:/development/ttv-twitch-elevenlabs/src/domain): Queue- und Recovery-Modelle
- [src/integrations](/c:/development/ttv-twitch-elevenlabs/src/integrations): Event-Normalisierung und ElevenLabs-Client
- [src/integrations](/c:/development/ttv-twitch-elevenlabs/src/integrations): Event-Normalisierung sowie Stub-, ElevenLabs- und Windows-TTS-Clients
- [src/playback](/c:/development/ttv-twitch-elevenlabs/src/playback): VLC/mpv-Adapter
- [src/routes](/c:/development/ttv-twitch-elevenlabs/src/routes): HTTP-Transport
- [src/services](/c:/development/ttv-twitch-elevenlabs/src/services): Admission, Orchestrierung, Overflow, Recovery, Status
- [tests](/c:/development/ttv-twitch-elevenlabs/tests): Unit-, Integrations- und Contract-Tests
- [docs/runtime.md](/c:/development/ttv-twitch-elevenlabs/docs/runtime.md): Laufzeit- und Operator-Hinweise

## Betriebs- und Recovery-Checks

Empfohlener Smoke-Test:

1. Service starten.
2. Einen einzelnen Alert senden.
3. `GET /api/v1/queue` und `GET /api/v1/health` pruefen.
4. Genug Alerts senden, um Overflow zu erzeugen.
5. Service waehrend eines aktiven Alerts neu starten.
6. Pruefen, dass deferierter Backlog fortgesetzt wird und der unterbrochene Alert als `recovery-failed` auftaucht.

## Weiterfuehrende Doku

- [docs/runtime.md](/c:/development/ttv-twitch-elevenlabs/docs/runtime.md)
- [specs/001-burst-safe-alert-queue/quickstart.md](/c:/development/ttv-twitch-elevenlabs/specs/001-burst-safe-alert-queue/quickstart.md)
- [AGENTS.md](/c:/development/ttv-twitch-elevenlabs/AGENTS.md)

# Runtime Guide

## Configuration

The service reads configuration from `.env`. Start from `.env.example` and set at least:

- `QUEUE_DB_PATH` to a writable SQLite path used for deferred overflow and recovery metadata.
- `AUDIO_OUTPUT_DIR` to a writable directory for generated audio artifacts.
- `PLAYER_KIND` and `PLAYER_COMMAND` to a locally installed player such as VLC or mpv.
- `TTS_MODE=stub` for silent local testing, `TTS_MODE=elevenlabs` with valid credentials, or `TTS_MODE=windows` for local Windows speech synthesis.

When `TTS_MODE=windows` is selected:

- the service still uses the configured player for audible playback
- generated speech is written as a temporary WAV file under `AUDIO_OUTPUT_DIR`
- startup fails before readiness if the process is not running on Windows, the local Windows speech path is unusable, or `AUDIO_OUTPUT_DIR` cannot be used for a temporary WAV write test
- the system default Windows voice is used for this feature version

The default local paths created by the service are:

- `.queue-data/alerts.sqlite` for deferred overflow and runtime recovery state.
- `.audio-output/` for generated transient audio files.

## Startup

```powershell
pnpm install
pnpm build
pnpm dev
```

The service validates configuration at startup and exposes:

- `GET /api/v1/health` for readiness and persistence state.
- `POST /api/v1/alerts` for alert admission.
- `GET /api/v1/queue` for queue visibility.

Supported intake sources for `POST /api/v1/alerts` are `local`, `twitch`, `streamerbot`, and `mixitup`.

Example requests are available in `examples/alerts.http`, the official scripted Streamer.bot example is in `examples/streamerbot-alert.mjs`, and a sample burst payload set is available in `examples/burst-alerts.json`.

If `TTS_MODE=windows` is configured on a non-Windows runtime or `powershell.exe`, the Windows speech engine, or the configured audio output directory cannot be used for a temporary WAV write, startup fails before the service can report ready.

## Official Tool Integration Paths

### Mix It Up

Use a Mix It Up `Web Request` action with:

- `POST http://127.0.0.1:3000/api/v1/alerts`
- `Content-Type: application/json`
- the canonical alert payload with `source`, `alertType`, optional `dedupeKey`, and `payload`

Official response signals for Mix It Up are `data.outcome` and `data.jobId`.

### Streamer.bot

Official support is limited to the Script-/Program-Execution POST flow. Use the Node.js example in `examples/streamerbot-alert.mjs` or an equivalent script that sends the same canonical JSON body.

Official response signals for Streamer.bot are the HTTP status plus `data.outcome` and `data.jobId`.

No alternative Streamer.bot transport path is part of the supported contract.

## Queue Behavior

- Only one alert is active at a time.
- Alerts above the in-memory threshold are deferred to SQLite-backed overflow storage.
- While deferred backlog exists, newer alerts remain deferred so previously accepted work keeps priority.
- Deferred overflow is restored automatically on restart before newly arriving alerts execute.
- An alert interrupted by an unexpected termination is marked as recovery-failed and is not replayed automatically.
- Player availability is re-checked immediately before TTS synthesis; if the player is unavailable, queued processing pauses and retries in order instead of spending ElevenLabs tokens prematurely.
- TTS or player failures are recorded as terminal failures and do not block later accepted alerts.
- Windows TTS failures follow the same terminal-failure path and do not change queue ordering or backlog behavior.

## Shutdown Policy

`SHUTDOWN_POLICY=preserve-pending` drains the active alert, persists any remaining in-memory backlog to deferred overflow, and stops intake before the process exits.

## Operator Checks

- Use `GET /api/v1/queue` to inspect active work, pending backlog, deferred backlog, and recent failure or rejection summaries.
- Use `GET /api/v1/health` to confirm queue persistence and player readiness before going live.
- `POST /api/v1/alerts` returns `503` when persistence, startup recovery, player availability, or shutdown state make new intake unsafe.
- Duplicate handling, queue admission, backlog visibility, and recovery behavior remain identical for `local`, `twitch`, `streamerbot`, and `mixitup`.
- Check structured logs for `requestId`, `jobId`, `sequenceNumber`, `inMemoryDepth`, and `deferredDepth` when diagnosing burst admission behavior.

## Validation Notes

- Startup validation in this workspace was verified with `pnpm build`, `pnpm lint`, and `pnpm test`.
- The automated integration suite covers deferred overflow promotion, queue-status visibility, duplicate handling, rejection tracking, recovery-failed startup handling, non-preemptive FIFO draining, and Windows TTS startup rejection before readiness.
- The automated unit suite covers `TTS_MODE=windows` env parsing, provider selection, Windows WAV generation, and synthesis failure propagation.
- Windows-specific player binary resolution and real audible playback still depend on the operator's installed `PLAYER_COMMAND`; that part was not exercised against a real VLC or mpv binary in this session.

# Quickstart: Burst-Safe Alert Queue

## Goal

Validate that the local service can admit alerts, persist overflow backlog, expose queue state, and recover deterministically after restart.

## Prerequisites

- Windows 10/11 machine
- Node.js 22 LTS
- Local `.env` configured for bind address, queue persistence path, output directory, player command, and the selected TTS mode:
- `TTS_MODE=stub` for silent local validation
- `TTS_MODE=windows` for local Windows speech synthesis
- `TTS_MODE=elevenlabs` only when live ElevenLabs synthesis is exercised, with valid credentials
- Writable local directory for SQLite persistence and temporary audio files
- One supported player binary available locally, such as VLC or mpv

## 1. Install and start the service

```powershell
pnpm install
pnpm build
pnpm dev
```

Expected result:

- Startup validation succeeds
- If `TTS_MODE=windows` is selected, startup also verifies that Windows speech synthesis can write a temporary WAV artifact under `AUDIO_OUTPUT_DIR`
- Health endpoint reports ready
- Queue status shows zero in-memory and deferred backlog

## 2. Submit a single alert

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/v1/alerts -ContentType 'application/json' -Body (@{
  source = 'local'
  alertType = 'cheer'
  payload = @{ userName = 'tester'; message = 'hello queue' }
} | ConvertTo-Json -Depth 5)
```

Expected result:

- Response outcome is `accepted`
- Queue status shows one active or pending alert
- Structured logs include request and correlation identifiers

## 2a. Validate Mix It Up intake

Configure a Mix It Up `Web Request` action with:

- Method: `POST`
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

Expected result:

- The response envelope is unchanged.
- Mix It Up can inspect `data.outcome` and `data.jobId`.

## 2b. Validate Streamer.bot scripted POST intake

Run the official scripted POST flow with `examples/streamerbot-alert.mjs` or the equivalent Node.js request shown in the feature quickstart.

Expected result:

- The HTTP status reflects the documented admission outcome.
- Streamer.bot can inspect HTTP status plus `data.outcome` and `data.jobId`.
- No alternative Streamer.bot transport path is required for supported operation.

## 3. Verify queue status visibility

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:3000/api/v1/queue
```

Expected result:

- Response includes `inMemoryDepth`, `deferredDepth`, `oldestPendingAgeMs`, and recent failures
- Active job summary appears when one alert is processing

## 4. Simulate burst overflow

Use `examples/burst-alerts.json` with a local script or test harness to submit 300 alerts within 60 seconds.

Expected result:

- Alerts beyond in-memory capacity return `deferred-to-disk`
- Queue status reports non-zero `deferredDepth`
- No overlapping active playback occurs
- Processing order remains FIFO across memory and restored deferred backlog
- Newer alerts do not jump ahead of older deferred backlog while overflow exists

## 5. Simulate restart recovery

1. Submit enough alerts to create deferred backlog.
2. Stop the service unexpectedly while one alert is active.
3. Start the service again.

Expected result:

- Deferred backlog is restored automatically
- Restored deferred backlog drains before new arrivals receive execution priority
- The previously active alert is surfaced as a recovery-failed outcome and is not replayed automatically

## 6. Validate health and readiness

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:3000/api/v1/health
```

Expected result:

- Response indicates whether queue persistence, configuration, and player setup are ready
- Service reports unavailable if persisted backlog cannot be restored safely
- Alert intake returns `503` while player availability or shutdown state make new work unsafe
- If the player becomes unavailable after admission, the service pauses queued processing before live TTS synthesis and resumes in order once the player is available again

## 7. Windows runtime verification

- Verify the configured player binary resolves correctly on Windows
- Verify SQLite persistence path remains writable across restart
- Verify `AUDIO_OUTPUT_DIR` is writable for startup validation and generated audio artifacts do not block queue drain because of file locks
- Verify logs are readable enough for the operator to identify rejected, deferred, failed, and recovery-failed alerts quickly

## Automated validation in this repository

```powershell
pnpm lint
pnpm test
```

Expected result:

- Contract, integration, and unit tests pass.
- Supported intake sources `local`, `twitch`, `streamerbot`, and `mixitup` remain contract-compatible.
- Burst overflow, queue visibility, and recovery-failed restart handling are covered automatically.

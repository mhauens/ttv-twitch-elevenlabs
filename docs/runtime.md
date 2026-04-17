# Runtime Guide

## Configuration

The service reads configuration from `.env`. Start from `.env.example` and set at least:

- `QUEUE_DB_PATH` to a writable SQLite path used for deferred overflow and recovery metadata.
- `AUDIO_OUTPUT_DIR` to a writable directory for generated audio artifacts.
- `PLAYER_KIND` and `PLAYER_COMMAND` to a locally installed player such as VLC or mpv.
- `TTS_MODE=stub` for local testing without ElevenLabs or `TTS_MODE=elevenlabs` with valid credentials.

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

Example requests are available in `examples/alerts.http`, and a sample burst payload set is available in `examples/burst-alerts.json`.

## Queue Behavior

- Only one alert is active at a time.
- Alerts above the in-memory threshold are deferred to SQLite-backed overflow storage.
- While deferred backlog exists, newer alerts remain deferred so previously accepted work keeps priority.
- Deferred overflow is restored automatically on restart before newly arriving alerts execute.
- An alert interrupted by an unexpected termination is marked as recovery-failed and is not replayed automatically.
- Player availability is re-checked immediately before TTS synthesis; if the player is unavailable, queued processing pauses and retries in order instead of spending ElevenLabs tokens prematurely.
- TTS or player failures are recorded as terminal failures and do not block later accepted alerts.

## Shutdown Policy

`SHUTDOWN_POLICY=preserve-pending` drains the active alert, persists any remaining in-memory backlog to deferred overflow, and stops intake before the process exits.

## Operator Checks

- Use `GET /api/v1/queue` to inspect active work, pending backlog, deferred backlog, and recent failure or rejection summaries.
- Use `GET /api/v1/health` to confirm queue persistence and player readiness before going live.
- `POST /api/v1/alerts` returns `503` when persistence, startup recovery, player availability, or shutdown state make new intake unsafe.
- Check structured logs for `requestId`, `jobId`, `sequenceNumber`, `inMemoryDepth`, and `deferredDepth` when diagnosing burst admission behavior.

## Validation Notes

- Startup validation in this workspace was verified with `pnpm build`, `pnpm lint`, and `pnpm test`.
- The automated integration suite covers deferred overflow promotion, queue-status visibility, duplicate handling, rejection tracking, recovery-failed startup handling, and non-preemptive FIFO draining.
- Windows-specific player binary resolution still depends on the operator's installed `PLAYER_COMMAND`; that part was not exercised against a real VLC or mpv binary in this session.

# Contract: Windows TTS Runtime Configuration

## Purpose

Document the operator-facing runtime contract introduced by adding `TTS_MODE=windows`.

## Configuration Surface

| Setting | Allowed Values | Required When | Contract |
| ------- | -------------- | ------------- | -------- |
| `TTS_MODE` | `stub`, `elevenlabs`, `windows` | always | Selects the active TTS provider. `windows` enables local Windows speech synthesis. |
| `AUDIO_OUTPUT_DIR` | writable directory path | always | Stores generated audio artifacts for every TTS mode. Windows mode writes `${jobId}.wav` files here before playback. |
| `PLAYER_KIND` | `vlc` or `mpv` | always | Playback path remains mandatory even when using Windows speech synthesis. |
| `PLAYER_COMMAND` | command name or executable path | always | Must resolve to a usable local player for audible output. |
| `ELEVENLABS_API_KEY` | string | `TTS_MODE=elevenlabs` | Unchanged. Not required for Windows mode. |
| `ELEVENLABS_VOICE_ID` | string | `TTS_MODE=elevenlabs` | Unchanged. Not required for Windows mode. |

## Startup Contract

- If `TTS_MODE=windows` is selected on a non-Windows runtime, startup must fail before the service reaches readiness.
- If `TTS_MODE=windows` is selected but the local Windows speech path is not usable, startup must fail before the service reaches readiness.
- Startup validation must not silently fall back from `windows` to another TTS provider.
- Readiness and health surfaces must reflect that alert intake is unsafe when Windows TTS validation fails.

## Alert Processing Contract

- The local alert HTTP API remains unchanged.
- Windows mode must generate a temporary WAV artifact and pass it to the existing player adapter path.
- The Windows mode voice source is the system default Windows voice for this feature version.
- Generated Windows TTS audio artifacts must be cleaned up using the same post-processing behavior as existing modes.
- If Windows synthesis for one alert fails, that alert must follow the existing alert-processing failure path and later queued alerts must continue in order.

## Compatibility Contract

- `POST /api/v1/alerts` request and response shapes do not change.
- `GET /api/v1/queue` queue semantics and ordering guarantees do not change.
- `GET /api/v1/health` remains the operator readiness surface, but startup validity for `TTS_MODE=windows` becomes part of the readiness decision.

## Documentation Obligations

- `.env.example` must list `windows` as a valid `TTS_MODE` value.
- `README.md` and `docs/runtime.md` must explain that Windows mode is Windows-only, uses the system default voice, and still depends on the configured player for audible playback.
# Quickstart: Windows TTS Mode

## Goal

Validate that the local service can start with `TTS_MODE=windows`, play spoken alerts through the existing player path, and fail fast when the Windows speech path is not usable.

## Prerequisites

- Windows 10 or Windows 11 machine
- Node.js 22 LTS
- A local player binary available for `PLAYER_COMMAND`, such as VLC or mpv
- Writable directories for `QUEUE_DB_PATH` and `AUDIO_OUTPUT_DIR`
- PowerShell available on the machine as part of the normal Windows runtime

## 1. Configure `.env`

Set at least the following values:

```dotenv
QUEUE_DB_PATH=.queue-data/alerts.sqlite
AUDIO_OUTPUT_DIR=.audio-output
PLAYER_KIND=vlc
PLAYER_COMMAND=vlc
TTS_MODE=windows
```

Notes:

- No additional Windows-TTS-specific environment variables are required.
- `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` may stay empty when `TTS_MODE=windows` is selected.

## 2. Install and start the service

```powershell
pnpm install
pnpm build
pnpm dev
```

Expected result:

- Startup validation succeeds on Windows.
- The service reports ready through `GET /api/v1/health`.
- The configured player remains the playback path for audible alerts.

## 3. Verify readiness

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:3000/api/v1/health
```

Expected result:

- The service reports ready.
- There is no startup error related to Windows TTS availability.

## 4. Send one alert

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/v1/alerts -ContentType 'application/json' -Body (@{
  source = 'local'
  alertType = 'cheer'
  payload = @{ userName = 'tester'; message = 'Windows TTS smoke test' }
} | ConvertTo-Json -Depth 5)
```

Expected result:

- The request is accepted with the existing alert API shape.
- Audible speech is played through the configured player.
- The generated temporary WAV file is deleted after processing completes.

## 5. Verify queue and failure isolation behavior

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:3000/api/v1/queue
```

Expected result:

- Queue status remains available and unchanged in shape.
- If one alert fails during synthesis, later alerts still continue in order.

## 6. Automated validation

```powershell
pnpm lint
pnpm test
pnpm build
```

Expected result:

- Env parsing accepts `TTS_MODE=windows`.
- TTS factory selection chooses the Windows client when configured.
- Windows client tests cover successful WAV generation, provider failure propagation, and unsupported-runtime rejection using mocked process execution.
- Startup integration tests cover non-Windows runtime rejection and unusable local speech-path rejection before readiness.
- Existing orchestrator failure-isolation behavior remains green.

## 7. Negative validation checks

- Verify on a non-Windows environment that startup fails before readiness when `TTS_MODE=windows` is set.
- Verify in an isolated test or disposable environment that an unusable local Windows speech path prevents startup instead of deferring failure to the first alert.

## Validation Notes

- `pnpm test` passed on 2026-04-18, including the new unit coverage for env parsing, TTS factory selection, Windows TTS synthesis, startup validation, and integration startup rejection scenarios.
- `pnpm lint` passed on 2026-04-18 after preserving caught error causes in the Windows TTS client.
- `pnpm build` passed on 2026-04-18.
- Real audible playback through an installed VLC or mpv binary was not exercised in this session.
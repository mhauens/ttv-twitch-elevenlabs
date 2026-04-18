# Implementation Plan: Windows TTS Mode

**Branch**: `[003-add-windows-tts]` | **Date**: 2026-04-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-add-windows-tts/spec.md`

## Summary

Add a new `TTS_MODE=windows` that uses the local Windows speech engine to generate a WAV file in the configured audio output directory, then reuses the existing player adapter path for audible playback and cleanup. The current implicit TTS selection inside `ElevenLabsClient` will be split into an explicit TTS factory with dedicated stub, ElevenLabs, and Windows client boundaries.

The operator-facing outcome is a local speech mode that works without ElevenLabs credentials, keeps the alert HTTP API unchanged, and fails fast during startup when Windows TTS cannot be used safely. The affected runtime surfaces are `.env` validation, application startup, the TTS integration boundary, local file generation, and operator documentation. The change remains safe for live local streaming because queue ordering, non-preemptive playback, failure isolation, and player-based audio routing all remain unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS  
**Primary Dependencies**: Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest, Node.js `child_process` for PowerShell invocation  
**Storage**: Local filesystem for generated audio artifacts and SQLite for existing queue persistence metadata  
**Testing**: Vitest unit and integration tests, Supertest for unchanged HTTP surfaces, mocked child-process seam for Windows TTS validation  
**Target Platform**: Windows 10/11 local machine  
**Project Type**: Local HTTP service / automation backend  
**Performance Goals**: Preserve existing single-consumer queue behavior, keep startup validation deterministic before readiness, avoid adding extra per-alert orchestration steps beyond local file synthesis, and maintain failure isolation so one TTS error never blocks later alerts  
**Constraints**: Windows-first, local-only by default, no new TTS-specific env vars, existing player path remains mandatory, startup must fail if Windows speech is unusable, `.env`-driven configuration, stable live-stream behavior  
**Scale/Scope**: Single operator, bursty local alert delivery, one active alert at a time, same queue semantics as the existing service

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- PASS: Module boundaries are explicit. Config validation stays in `src/config`, provider selection moves into a small integration factory, Windows synthesis stays behind an integration boundary, and orchestration remains in services.
- PASS: External dependency behavior is documented. Windows speech invocation, local player execution, and ElevenLabs calls keep explicit failure surfaces and bounded runtime behavior.
- PASS: API behavior remains explicit. No HTTP request or response shape changes are introduced, and the changed public contract is documented as runtime configuration and startup readiness behavior.
- PASS: Health and readiness behavior are defined. Startup must reject unsupported or unusable Windows TTS configuration before intake is considered safe.
- PASS: `.env` impact is planned. `TTS_MODE` gains the `windows` value with no new TTS-specific variables; docs and examples will be updated accordingly.
- PASS: Queue semantics remain explicit. Alert admission, FIFO ordering, non-preemptive execution, overflow handling, and failure isolation remain unchanged while the TTS provider becomes pluggable.
- PASS: Observability is planned. Startup validation failures and per-alert Windows TTS failures remain operator-visible through existing logs and status behavior.
- PASS: Automated tests are planned for env parsing, provider selection, Windows speech invocation, and unchanged orchestrator failure isolation, plus manual Windows runtime verification.
- PASS: No constitution violations require exceptions. Complexity Tracking remains empty.

## Phase 0: Research & Decisions

Research outcomes are recorded in [research.md](./research.md). Key decisions:

- Preserve the current file-generation and player-playback pipeline instead of introducing direct OS speech output.
- Split TTS mode selection into an explicit factory with one client per mode.
- Implement the Windows client through `powershell.exe` and `.NET System.Speech.Synthesis.SpeechSynthesizer` to generate WAV artifacts locally.
- Validate Windows TTS availability during startup so readiness stays honest.
- Treat runtime configuration as the changed public contract because the HTTP API does not change.

## Phase 1: Design & Contracts

Design artifacts are recorded in:

- [data-model.md](./data-model.md)
- [contracts/windows-tts-runtime-contract.md](./contracts/windows-tts-runtime-contract.md)
- [quickstart.md](./quickstart.md)

Design highlights:

- `TTS_MODE` becomes a three-way runtime selection with startup validation state and no additional TTS-specific environment variables.
- The TTS integration boundary is split so application wiring selects among stub, ElevenLabs, and Windows implementations while `AlertOrchestrator` keeps the same provider-agnostic interface.
- Windows mode always yields a temporary WAV artifact using the system default voice and the existing post-processing cleanup path.
- Health and readiness behavior remain the operator truth source for unsupported runtime or unusable local speech-path failures.
- The runtime contract documents that playback remains mandatory and the HTTP API remains unchanged.

## Post-Design Constitution Check

- PASS: Design artifacts preserve explicit integration boundaries and keep orchestration free of provider-specific branching.
- PASS: Startup validation, readiness honesty, and operator-visible failure behavior are explicitly documented.
- PASS: Queue semantics, overflow handling, and failure isolation remain unchanged and are reaffirmed in the data model and quickstart.
- PASS: The runtime contract documents the `.env` change without introducing API drift.
- PASS: No post-design constitution violations were introduced.

## Project Structure

### Documentation (this feature)

```text
specs/003-add-windows-tts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── windows-tts-runtime-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   └── server.ts
├── config/
│   └── env.ts
├── integrations/
│   ├── elevenlabs-client.ts
│   ├── stub-tts-client.ts
│   ├── text-to-speech-client.ts
│   ├── tts-client-factory.ts
│   └── windows-tts-client.ts
├── services/
│   └── alert-orchestrator.ts
└── shared/

tests/
├── support/
│   └── test-utils.ts
└── unit/
    ├── alert-orchestrator.test.ts
    ├── env.test.ts
    ├── tts-client-factory.test.ts
    └── windows-tts-client.test.ts

docs/
README.md
.env.example
```

**Structure Decision**: Keep the existing service and queue structure intact and add the new behavior entirely behind the integration boundary. The implementation should extract the shared TTS interface and synthesized-audio types from the current provider file, move stub behavior into its own client, add a Windows-specific client and a small selection factory, and update `server.ts` to request the selected client during startup. This keeps routes and orchestrators unchanged, limits provider branching to application wiring, and makes startup validation testable without disturbing queue logic.

**Operational Notes**: `GET /api/v1/health` remains the readiness surface and must stay false or unavailable when `TTS_MODE=windows` cannot be used on the current runtime. `GET /api/v1/queue` and alert admission semantics remain unchanged because the queue model is not changing. Windows runtime verification must cover PowerShell availability, writable audio output, audible playback through the configured player, and cleanup of generated WAV artifacts. `.env.example`, `README.md`, and `docs/runtime.md` must document that Windows TTS uses the system default voice, is Windows-only, and still requires a working `PLAYER_COMMAND`.

## Complexity Tracking

No constitution violations or justified exceptions are required for this plan.

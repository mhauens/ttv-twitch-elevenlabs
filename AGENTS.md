# AGENTS.md

## Purpose

This repository contains a local Windows-first TypeScript service for burst-safe alert processing with Twitch-adjacent event intake, ElevenLabs text-to-speech integration, local audio playback, durable overflow persistence, queue visibility, and deterministic restart recovery.

Use this file as the canonical high-level guide for coding and review work in this repository.

## Stack And Commands

- Runtime: Node.js 22 LTS
- Language: TypeScript 5.x
- HTTP: Express 5
- Validation: Zod
- Logging: Pino
- Persistence: better-sqlite3
- Tests: Vitest and Supertest

Primary commands:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm dev`

For most non-trivial changes, `pnpm lint`, `pnpm test`, and `pnpm build` are the minimum validation set.

## Project Structure

- `src/app/`: application bootstrap and HTTP server wiring
- `src/config/`: environment validation and derived queue configuration
- `src/domain/`: typed queue, admission, and recovery domain models
- `src/integrations/`: external input normalization and ElevenLabs boundary
- `src/playback/`: Windows player adapter boundary for VLC and mpv
- `src/routes/`: HTTP transport layer only
- `src/services/`: queue admission, orchestration, persistence, recovery, and status logic
- `src/shared/`: cross-cutting helpers such as logger, IDs, time, and API errors
- `tests/unit/`: isolated service and store behavior
- `tests/integration/`: multi-module queue and recovery behavior
- `tests/contract/`: public API contract coverage
- `docs/`: operator-facing runtime guidance
- `examples/`: sample alert requests and burst fixtures
- `specs/001-burst-safe-alert-queue/`: plan, quickstart, tasks, and OpenAPI contract for the current feature set

## Architecture Rules

- Keep routes thin. Request parsing, admission policy, recovery policy, and queue semantics belong in services.
- Keep config validation centralized in `src/config/env.ts` and queue thresholds in `src/config/queue-config.ts`.
- Keep domain models explicit. Prefer stable machine-readable outcome codes and typed queue states over ad-hoc objects.
- Keep external boundaries isolated:
  - ElevenLabs access in `src/integrations/elevenlabs-client.ts`
  - player execution in `src/playback/`
  - durable queue overflow and runtime state in `src/services/overflow-store.ts`
- When changing API behavior, keep routes, OpenAPI, and contract tests aligned.

## Queue Invariants

- The queue is single-consumer.
- Active work is non-preemptive: later alerts must not interrupt an already active alert implicitly.
- Accepted work preserves externally visible order.
- When in-memory capacity is exhausted, overflow is deferred to SQLite rather than silently dropped.
- Deferred backlog must retain order across restart.
- If deferred backlog exists, newer arrivals must not take execution priority ahead of that backlog.
- An alert active during unexpected termination must be marked `recovery-failed` on startup and must not replay automatically.
- Health and readiness must not report the service as ready when recovery or persistence state makes new intake unsafe.

Any change that weakens one of these guarantees should be treated as high risk.

## Review Anchors

- Admission and backpressure changes: inspect `src/routes/alerts-route.ts`, `src/services/queue-admission-service.ts`, `src/services/alert-orchestrator.ts`, `src/services/overflow-store.ts`, and the related unit and integration tests.
- Recovery and shutdown changes: inspect `src/services/queue-recovery-service.ts`, `src/services/overflow-store.ts`, `src/services/alert-orchestrator.ts`, and recovery tests.
- Status and readiness changes: inspect `src/routes/health-route.ts`, `src/routes/queue-status-route.ts`, `src/services/queue-status-service.ts`, OpenAPI, and contract tests.
- Playback or TTS changes: inspect `src/integrations/elevenlabs-client.ts`, `src/playback/`, `src/services/alert-orchestrator.ts`, and runtime docs.
- Config changes: inspect `.env.example`, `src/config/`, `docs/runtime.md`, and `specs/001-burst-safe-alert-queue/quickstart.md`.

## Testing Expectations

- If runtime behavior changes, add or update tests near the affected layer:
  - unit tests for isolated policy and store behavior
  - integration tests for queue flow and recovery behavior
  - contract tests for public HTTP shape and status codes
- If API responses change, update `specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml` and `tests/contract/local-alert-api.contract.test.ts` together.
- If operator behavior changes, update `docs/runtime.md`, relevant examples under `examples/`, and `specs/001-burst-safe-alert-queue/quickstart.md` when the validation flow changes.

## Manual Validation

Use automated validation first, then add manual checks when the change affects behavior that depends on the local runtime.

Recommended smoke path for queue and recovery changes:

1. Start the service with `pnpm dev`.
2. Submit a single alert from `examples/alerts.http`.
3. Verify `GET /api/v1/queue` and `GET /api/v1/health`.
4. Submit enough alerts to create deferred overflow.
5. Restart while one alert is active.
6. Verify that deferred backlog resumes and the interrupted alert is surfaced as `recovery-failed`.

For Windows playback changes, also verify:

- `PLAYER_COMMAND` resolves on the local machine.
- `QUEUE_DB_PATH` is writable.
- `AUDIO_OUTPUT_DIR` is writable.
- startup readiness reflects actual player availability.

## Documentation And Language

- Prefer German for operator-facing prose unless the task explicitly requires another language.
- Keep code identifiers, contract fields, and status codes in their established technical form.
- Do not leave examples, quickstart steps, or OpenAPI stale after changing runtime behavior.

## Review Defaults

When asked for a code review in this repository, prioritize:

1. Queue invariants and recovery correctness
2. Contract and validation drift
3. Failure isolation at external boundaries
4. Operator visibility and readiness honesty
5. Testing gaps and stale docs

Generic style concerns are secondary to reliability, ordering, and operational correctness.

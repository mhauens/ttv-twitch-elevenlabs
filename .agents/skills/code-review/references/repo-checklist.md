# Repository Review Checklist

Use this file as a quick repo-specific review summary. The canonical rules remain in `AGENTS.md`, `docs/runtime.md`, and the feature specs under `specs/001-burst-safe-alert-queue/`.

## Canonical Sources

- `AGENTS.md`
- `docs/runtime.md`
- `specs/001-burst-safe-alert-queue/plan.md`
- `specs/001-burst-safe-alert-queue/quickstart.md`
- `specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml`

## How to Use This Checklist

- Prefer citing `AGENTS.md` for repo-wide rules and validation expectations.
- Use this file for repo-specific review shortcuts and validation context.
- If this file and a canonical source disagree, follow the canonical source.

## General Review Anchors

- The repository is a TypeScript Node.js 22 service using Express 5, Zod, Pino, better-sqlite3, Vitest, and Supertest.
- Routes should stay thin. Admission, orchestration, persistence, recovery, and status policy belong in services.
- The queue is single-consumer and non-preemptive: later alerts must not interrupt active work implicitly.
- Deferred overflow persists to SQLite and must retain order across restart.
- If deferred backlog exists, newly arriving work must not take execution priority ahead of that restored backlog.
- An alert that was active during unexpected termination must become `recovery-failed` on startup and must not replay automatically.
- Health and readiness must reflect whether the service is actually safe to accept new work.
- Operator-facing prose should default to German unless the task explicitly requires another language.

## Cross-Module Review Notes

- If queue admission or backpressure changes, inspect:
  - `src/routes/alerts-route.ts`
  - `src/services/queue-admission-service.ts`
  - `src/services/alert-orchestrator.ts`
  - `src/services/overflow-store.ts`
  - `tests/unit/queue-admission-service.test.ts`
  - `tests/integration/queue-burst.integration.test.ts`
- If restart recovery or shutdown behavior changes, inspect:
  - `src/services/queue-recovery-service.ts`
  - `src/services/overflow-store.ts`
  - `src/services/alert-orchestrator.ts`
  - `tests/unit/queue-recovery-service.test.ts`
  - `tests/unit/overflow-store.test.ts`
  - `tests/integration/queue-recovery.integration.test.ts`
- If health, queue visibility, or response envelopes change, inspect:
  - `src/routes/health-route.ts`
  - `src/routes/queue-status-route.ts`
  - `src/services/queue-status-service.ts`
  - `specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml`
  - `tests/contract/local-alert-api.contract.test.ts`
  - `tests/integration/queue-status.integration.test.ts`
- If TTS or playback changes, inspect:
  - `src/integrations/elevenlabs-client.ts`
  - `src/playback/player-adapter.ts`
  - `src/playback/vlc-adapter.ts`
  - `src/playback/mpv-adapter.ts`
  - `src/services/alert-orchestrator.ts`
  - runtime guidance in `docs/runtime.md`

## TypeScript And Runtime Review Notes

- Keep configuration validation centralized in `src/config/env.ts` and derived queue settings in `src/config/queue-config.ts`.
- Prefer explicit typed domain models and machine-readable outcome codes over ad-hoc objects.
- Be skeptical of changes that move business rules into routes or duplicate queue policy across layers.
- Treat filesystem, process execution, and ElevenLabs calls as failure-prone boundaries that require bounded behavior and visible operator outcomes.
- When route output changes, verify OpenAPI and contract tests stay aligned.

## Validation Commands

- `pnpm lint` validates the TypeScript and flat ESLint configuration.
- `pnpm test` runs unit, integration, and contract tests with Vitest.
- `pnpm build` verifies that the TypeScript project compiles cleanly.
- `pnpm lint`, `pnpm test`, and `pnpm build` are the minimum recommended validation after most code changes.

## Manual Validation Context

- `pnpm dev` starts the local service.
- API and queue behavior can be smoke-tested with `examples/alerts.http` and `examples/burst-alerts.json`.
- Queue, recovery, or health changes should be checked manually with this flow when practical:
  1. start the service
  2. submit a single alert
  3. verify `GET /api/v1/queue`
  4. submit enough alerts to create deferred overflow
  5. restart during active playback
  6. verify `GET /api/v1/health` and `GET /api/v1/queue`
- Playback-related changes should also be checked on Windows with the configured `PLAYER_COMMAND`, writable queue database path, and writable audio output directory.

# Implementation Plan: Burst-Safe Alert Queue

**Branch**: `[001-burst-safe-alert-queue]` | **Date**: 2026-04-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-burst-safe-alert-queue/spec.md`

## Summary

Add a deterministic alert-queue subsystem for the local Twitch and ElevenLabs service that keeps one alert active at a time, persists overflow backlog to local durable storage, restores that backlog after restart, exposes queue state to the operator, and isolates failed alerts without replaying interrupted active work automatically.

The operator-facing outcome is predictable live-stream behavior under burst traffic: accepted alerts are processed in externally visible order, overflow is deferred durably instead of silently lost, queue state is observable through status surfaces and logs, and crash recovery avoids duplicate playback. The affected runtime surfaces are local HTTP intake, queue-status and health endpoints, local persistence, TTS and playback orchestration, and startup recovery behavior. The approach stays safe for live use because it keeps the queue single-consumer, preserves non-preemptive execution, and makes every recovery or rejection outcome explicit.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS  
**Primary Dependencies**: Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest  
**Storage**: SQLite for durable overflow and recovery metadata; local filesystem for generated audio and temporary playback artifacts  
**Testing**: Vitest for unit and integration tests, Supertest for HTTP coverage, OpenAPI-backed contract checks, adapter fakes for ElevenLabs and player processes  
**Target Platform**: Windows 10/11 local machine  
**Project Type**: Local HTTP service / automation backend  
**Performance Goals**: Admission response within 2 seconds per spec, local p95 intake handling under 250 ms before downstream TTS work, deterministic FIFO drain for bursts of 300 alerts in 60 seconds, restart recovery ready within 5 seconds for nominal persisted backlog  
**Constraints**: Windows-first, local-only bind by default, stable live-stream behavior, `.env`-driven configuration, one active playback at a time, no automatic replay of interrupted active alerts, restored deferred backlog drains before new arrivals  
**Scale/Scope**: Single operator, bursty local event delivery, hundreds of queued alerts, single active worker, durable overflow backlog across restart

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- PASS: Module boundaries are explicit. Routes handle transport only, services coordinate admission and recovery, playback adapters isolate player control, integration adapters isolate ElevenLabs and upstream event handling, and config and shared modules remain separate.
- PASS: External dependency behavior is documented. ElevenLabs and player-process calls will use bounded timeouts, explicit retries only for transient failures, and operator-visible failure logging.
- PASS: API contracts are explicit. Local alert intake and queue-status responses define stable machine-readable outcomes for accepted, deferred-to-disk, rejected, rate-limited, duplicate-handled, and recovery-failed states.
- PASS: Service operations are defined. Health and readiness behavior plus queue-status visibility are part of the design artifacts.
- PASS: `.env` impact is planned. The queue persistence path, backlog thresholds, player settings, bind address, and integration credentials remain centrally validated in startup configuration.
- PASS: Queue semantics are explicit. The design enforces single active processing, durable overflow, restart restoration ordering, failure isolation, and graceful shutdown behavior.
- PASS: Observability is planned. Correlation IDs, queue transition logs, recovery-failure visibility, and queue metrics are part of the design.
- PASS: Test coverage is planned. Unit, integration, contract, burst, restart, and Windows runtime validation are part of the design.
- PASS: No constitution violations require exceptions. Complexity Tracking remains empty.

## Phase 0: Research & Decisions

Research outcomes are recorded in [research.md](./research.md). Key decisions:

- Use TypeScript with Express because the repo constitution already targets a Node.js and Express local service and prefers stronger shape guarantees when introducing a typed codebase.
- Use SQLite for durable overflow and recovery metadata because it provides ordered local persistence, crash-tolerant transactions, and simple query support for queue-status surfaces without adding a separate service dependency.
- Use a custom single-consumer queue coordinator rather than a generic queue framework so state transitions, restart recovery, and non-preemptive guarantees remain explicit and testable.
- Use Zod for request and configuration validation and Pino for structured logs with correlation IDs.

## Phase 1: Design & Contracts

Design artifacts are recorded in:

- [data-model.md](./data-model.md)
- [contracts/local-alert-api.openapi.yaml](./contracts/local-alert-api.openapi.yaml)
- [quickstart.md](./quickstart.md)

Design highlights:

- Queue states are explicit across intake, deferred overflow, restore, active processing, terminal completion, and recovery failure.
- Durable overflow is stored locally and restored ahead of new work after restart.
- The local API exposes asynchronous intake, queue-status visibility, and health/readiness state.
- Crash recovery never replays an interrupted active alert automatically; it records a recovery failure and resumes the restored backlog.

## Post-Design Constitution Check

- PASS: The data model preserves explicit queue states and non-preemptive semantics.
- PASS: The OpenAPI contract documents admission, duplicate, deferred, and recovery-visible outcomes.
- PASS: The quickstart includes Windows validation steps for burst handling, queue visibility, and restart recovery.
- PASS: Design artifacts preserve modular boundaries and avoid hidden queue mutation.
- PASS: No post-design constitution violations were introduced.

## Project Structure

### Documentation (this feature)

```text
specs/001-burst-safe-alert-queue/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── local-alert-api.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   └── server.ts
├── config/
│   ├── env.ts
│   └── queue-config.ts
├── domain/
│   ├── alert-request.ts
│   ├── alert-queue-item.ts
│   ├── queue-admission-result.ts
│   ├── queue-snapshot.ts
│   └── recovery-failure-record.ts
├── integrations/
│   ├── elevenlabs-client.ts
│   └── event-normalizer.ts
├── playback/
│   ├── player-adapter.ts
│   ├── vlc-adapter.ts
│   └── mpv-adapter.ts
├── routes/
│   ├── alerts-route.ts
│   ├── health-route.ts
│   └── queue-status-route.ts
├── services/
│   ├── alert-orchestrator.ts
│   ├── queue-admission-service.ts
│   ├── queue-recovery-service.ts
│   ├── overflow-store.ts
│   └── queue-status-service.ts
└── shared/
    ├── errors.ts
    ├── ids.ts
    ├── logger.ts
    └── time.ts

tests/
├── contract/
│   └── local-alert-api.contract.test.ts
├── integration/
│   ├── queue-burst.integration.test.ts
│   ├── queue-recovery.integration.test.ts
│   └── queue-status.integration.test.ts
└── unit/
    ├── queue-admission-service.test.ts
    ├── queue-recovery-service.test.ts
    └── overflow-store.test.ts

docs/
examples/
```

**Structure Decision**: The repository currently contains only Spec Kit scaffolding, so this feature defines the initial service layout. The selected structure creates separate modules for HTTP transport, queue orchestration, persistence, playback, integrations, and configuration. That keeps queue state transitions explicit, avoids hidden coupling between playback and transport, and supports independent testing of persistence and recovery.

**Operational Notes**: `GET /api/v1/health` will expose startup and persistence readiness, while `GET /api/v1/queue` will expose in-memory depth, deferred persisted backlog depth, active job summary, oldest pending age, and recent recovery failures. Windows validation must cover player binary discovery, writable persistence and audio directories, burst intake, and restart recovery. Startup validation must fail fast if `.env` values, persistence paths, or player command configuration are invalid.

## Complexity Tracking

No constitution violations or justified exceptions are required for this plan.

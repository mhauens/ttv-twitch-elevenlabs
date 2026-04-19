# Implementation Plan: Combined Status Stream

**Branch**: `[004-combined-status-stream]` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-combined-status-stream/spec.md`

## Summary

Add a polling-based realtime status layer that combines the existing queue and health snapshots into one operator-facing stream. Phase 1 exposes `GET /api/v1/status/stream` as SSE with an immediate `snapshot` event, changed-snapshot broadcasts only, and idle keepalive comments. Phase 2 reuses the same internal snapshot pipeline for `/api/v1/status/ws` over WebSocket.

The operator-facing outcome is a live status feed for local dashboards and tooling without changing the existing pull endpoints, queue behavior, or recovery guarantees. The affected runtime surfaces are application startup and shutdown wiring, status-service composition, SSE transport, later WebSocket transport, public HTTP contract documentation for SSE, runtime documentation for WebSocket, and example clients. The change remains safe for live local streaming because it reads from the existing `QueueStatusService`, adds no new queue state mutations, preserves the canonical `/api/v1/queue` and `/api/v1/health` snapshots, and isolates subscriber lifecycle management behind a dedicated service.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS  
**Primary Dependencies**: Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest, existing Node.js HTTP server primitives, and `ws` for the Phase 2 WebSocket transport  
**Storage**: No new persistence; combined status is computed in memory from the existing queue and health snapshot sources while SQLite overflow metadata and local audio artifacts remain unchanged  
**Testing**: Vitest unit tests, integration tests using the existing application harness, contract tests for HTTP and SSE surfaces, and transport-specific streaming assertions for SSE and later WebSocket behavior  
**Target Platform**: Windows 10/11 local machine with local automation clients and operator dashboards  
**Project Type**: Local HTTP service / automation backend with additive realtime status delivery  
**Performance Goals**: Emit an initial snapshot immediately on subscription, poll the existing snapshot sources every 500 ms, broadcast only semantic changes, send SSE keepalives at least every 15 seconds during idle periods, send WebSocket ping traffic at least every 30 seconds during idle periods, and avoid any measurable regression in queue admission, playback timing, or shutdown behavior  
**Constraints**: Windows-first, local-only by default, no replay buffer, no new authentication model, no `.env` additions, existing queue and health endpoints remain canonical, polling is preferred over invasive event wiring, and the HTTP server continues to own long-lived connection lifecycle  
**Scale/Scope**: Single operator, a small number of local status subscribers, bursty local alert traffic, one active alert at a time, and several hundred queued alerts still governed by the existing burst-safe queue semantics

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- PASS: Module boundaries are explicit. A new status-stream service will own polling, change detection, and subscriber lifecycle; routes remain transport-only; queue orchestration and recovery services remain unchanged.
- PASS: External dependency behavior is documented. SSE depends only on the existing HTTP server, and Phase 2 WebSocket behavior will be isolated behind the `ws` adapter boundary with explicit keepalive and dead-connection cleanup rules.
- PASS: API behavior remains explicit. SSE becomes a documented HTTP endpoint with fixed event framing, while WebSocket remains a separately documented runtime transport that reuses the same payload shape.
- PASS: Health, readiness, and queue-status visibility remain defined. The realtime stream is additive and reports the existing health and queue snapshots without changing their meaning.
- PASS: `.env` impact is documented. No new environment variables or secret handling changes are introduced by this feature.
- PASS: Queue semantics remain explicit. The stream is read-only, does not change admission or sequencing, and the plan preserves burst handling, non-preemptive execution, failure isolation, and graceful shutdown guarantees.
- PASS: Observability is planned. Snapshot refresh failures, subscriber lifecycle events, and transport cleanup paths remain operator-visible through structured logs.
- PASS: Automated tests are planned for snapshot diffing, transport formatting, keepalive behavior, reconnect behavior, and shutdown cleanup without requiring changes to playback or queue semantics.
- PASS: No constitution violations require exceptions. Complexity Tracking remains empty.

## Phase 0: Research & Decisions

Research outcomes are recorded in [research.md](./research.md). Key decisions:

- Build the combined stream by polling `QueueStatusService` every 500 ms instead of wiring new event flows into admission, orchestration, or recovery internals.
- Introduce a dedicated `StatusStreamService` that owns combined snapshot creation, semantic diffing, stream sequencing, keepalive scheduling, and subscriber cleanup.
- Compare snapshots using only the semantic queue and health content so `emittedAt` and `streamSequence` do not trigger duplicate broadcasts.
- Add SSE to the public OpenAPI contract now and document the WebSocket transport separately as a runtime contract because OpenAPI remains scoped to HTTP and SSE.
- Stop the realtime stream service before disposing queue resources during shutdown so long-lived subscribers do not outlive the underlying status sources.
- Keep the feature additive with no `.env`, persistence, or intake-contract changes.

## Phase 1: Design & Contracts

Design artifacts are recorded in:

- [data-model.md](./data-model.md)
- [contracts/local-alert-api.openapi.yaml](./contracts/local-alert-api.openapi.yaml)
- [contracts/status-websocket-runtime-contract.md](./contracts/status-websocket-runtime-contract.md)
- [quickstart.md](./quickstart.md)

Design highlights:

- The combined status payload is a thin wrapper over the existing `QueueSnapshot` and `HealthSnapshot` types with transport metadata added at emission time.
- The stream service caches the latest successful snapshot, increments `streamSequence` only when semantic content changes, and immediately serves the latest snapshot to new subscribers.
- SSE remains an Express route that formats the payload as `event: snapshot`, `id: <streamSequence>`, and JSON `data:` lines while sending `: keepalive` comments during idle periods.
- WebSocket will be attached to the already created Node HTTP server in `createApplication().start()` and will reuse the same combined snapshot pipeline while ignoring client-originated messages, but release sequencing remains `SSE first`, then WebSocket after SSE behavior is validated.
- `specs/004-combined-status-stream/contracts/local-alert-api.openapi.yaml` is the feature-local source of truth for planned SSE contract changes; implementation must sync the repository-wide contract file in `specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml` in the same story rather than deferring alignment to polish.
- Contract artifacts keep `/api/v1/queue` and `/api/v1/health` unchanged, add `/api/v1/status/stream` to the HTTP contract, keep the stream reachable even when `health.ready=false`, and document WebSocket behavior outside OpenAPI.

## Post-Design Constitution Check

- PASS: The design keeps transport logic in routes and socket wiring while concentrating status comparison and subscriber lifecycle inside one service.
- PASS: The design defines keepalive, reconnect, temporary refresh failure, and shutdown behavior explicitly without weakening queue or recovery invariants.
- PASS: The design keeps readiness honesty unchanged because the stream reports existing health semantics rather than introducing a second readiness model.
- PASS: Burst handling and non-preemptive queue guarantees remain unaffected because the stream is polling-based and read-only.
- PASS: Tests and contract artifacts cover the changed runtime surfaces without introducing undocumented API drift.

## Project Structure

### Documentation (this feature)

```text
specs/004-combined-status-stream/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── local-alert-api.openapi.yaml
│   └── status-websocket-runtime-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   └── server.ts
├── domain/
│   └── combined-status-snapshot.ts
├── routes/
│   └── status-stream-route.ts
├── services/
│   ├── queue-status-service.ts
│   └── status-stream-service.ts
└── shared/
    └── time.ts

tests/
├── contract/
│   └── local-alert-api.contract.test.ts
├── integration/
│   └── status-stream.integration.test.ts
└── unit/
    └── status-stream-service.test.ts

docs/
│   └── runtime.md
examples/
│   ├── alerts.http
│   └── status-stream-sse.mjs

package.json
README.md
```

**Structure Decision**: Add one domain type file for the combined snapshot contract, one service for polling and subscriber lifecycle, and one SSE route for HTTP transport. Keep `QueueStatusService` as the only reader of queue and health sources, and have the new stream service depend on it instead of reaching into orchestrator or recovery internals directly. Wire WebSocket ownership in `src/app/server.ts` because that file already owns the Node HTTP server lifecycle. This preserves thin routes, explicit service boundaries, and a single place for long-lived connection cleanup.

**Operational Notes**: `GET /api/v1/health` and `GET /api/v1/queue` remain the canonical pull snapshots and must keep their current envelopes unchanged. The new stream endpoint must remain available even when the health snapshot reports `ready=false`, because operators still need visibility into degraded state. Shutdown ordering should stop the status stream service first, close SSE and WebSocket subscribers, then close the HTTP server and dispose queue resources. The status stream service must emit structured logs for snapshot refresh failures, subscriber connect and disconnect events, and shutdown cleanup. No new `.env` values are required. Validation must cover immediate initial snapshot delivery, degraded-health subscriptions, idle keepalives, changed-only broadcasts, reconnect without replay, and clean connection teardown on service stop.

## Complexity Tracking

No constitution violations or justified exceptions are required for this plan.

# Tasks: Burst-Safe Alert Queue

**Input**: Design documents from `/specs/001-burst-safe-alert-queue/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/local-alert-api.openapi.yaml, quickstart.md

**Tests**: Include tests for all behavior-changing work. This feature changes queueing, persistence, restart recovery, and operator-visible API behavior, so unit, integration, and contract tests are required.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently once the shared foundation is in place.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel when tasks touch different files and do not depend on incomplete work
- **[Story]**: Which user story the task belongs to (`[US1]`, `[US2]`, `[US3]`)
- Every task includes exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the TypeScript service workspace and baseline tooling

- [X] T001 Initialize the Node.js project manifest with runtime and developer scripts in package.json
- [X] T002 [P] Add TypeScript compiler and Vitest configuration in tsconfig.json and vitest.config.ts
- [X] T003 [P] Add linting and ignore rules in eslint.config.js and .gitignore
- [X] T004 [P] Add local configuration example and operator runtime doc stub in .env.example and docs/runtime.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the core service skeleton and shared queue primitives required by all user stories

**⚠️ CRITICAL**: No user story work should begin until this phase is complete

- [X] T005 Define startup configuration and queue thresholds in src/config/env.ts and src/config/queue-config.ts
- [X] T006 [P] Create shared logger, correlation ID, and time utilities in src/shared/logger.ts, src/shared/ids.ts, and src/shared/time.ts
- [X] T007 [P] Define core queue domain models in src/domain/alert-request.ts, src/domain/alert-queue-item.ts, src/domain/queue-admission-result.ts, src/domain/queue-snapshot.ts, and src/domain/recovery-failure-record.ts
- [X] T008 [P] Implement the SQLite overflow persistence service shell in src/services/overflow-store.ts
- [X] T009 [P] Add playback adapter contracts and Windows player adapters in src/playback/player-adapter.ts, src/playback/vlc-adapter.ts, and src/playback/mpv-adapter.ts
- [X] T010 [P] Add ElevenLabs and inbound event adapter shells in src/integrations/elevenlabs-client.ts and src/integrations/event-normalizer.ts
- [X] T011 Implement shared API error and response helpers in src/shared/errors.ts
- [X] T012 Implement the application bootstrap and route wiring shell in src/app/server.ts, src/routes/health-route.ts, src/routes/alerts-route.ts, and src/routes/queue-status-route.ts

**Checkpoint**: The repository has a compilable service skeleton, shared queue types, config validation, and adapter boundaries ready for story work.

---

## Phase 3: User Story 1 - Process Alerts In Order (Priority: P1) 🎯 MVP

**Goal**: Accept alerts, queue them deterministically, persist overflow to disk, restore deferred backlog on restart, and preserve non-preemptive FIFO execution.

**Independent Test**: Submit a burst of several hundred alerts through `POST /api/v1/alerts`, verify accepted or deferred-to-disk admission outcomes, and confirm the system drains accepted work in preserved order without overlapping active playback or replaying interrupted active alerts after restart.

### Tests for User Story 1

- [X] T013 [P] [US1] Add contract coverage for `POST /api/v1/alerts` admission outcomes in tests/contract/local-alert-api.contract.test.ts
- [X] T014 [P] [US1] Add burst ordering and deferred-overflow integration coverage in tests/integration/queue-burst.integration.test.ts
- [X] T015 [P] [US1] Add queue admission and sequence-number unit coverage in tests/unit/queue-admission-service.test.ts
- [X] T016 [P] [US1] Add restart restore ordering and restored-backlog priority unit coverage in tests/unit/queue-recovery-service.test.ts

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement request admission, dedupe, and sequence assignment in src/services/queue-admission-service.ts
- [X] T018 [P] [US1] Implement durable overflow persistence and restore promotion in src/services/overflow-store.ts
- [X] T019 [US1] Implement the single-consumer queue coordinator and non-preemptive FIFO drain behavior in src/services/alert-orchestrator.ts
- [X] T020 [US1] Implement restart recovery logic, restored backlog priority, and no-replay handling for interrupted active work in src/services/queue-recovery-service.ts
- [X] T021 [US1] Implement the alert intake route and admission response envelopes in src/routes/alerts-route.ts
- [X] T022 [US1] Wire startup recovery, intake flow, and orchestrator lifecycle into src/app/server.ts
- [X] T023 [US1] Update local queue settings and startup instructions for overflow persistence in .env.example and docs/runtime.md

**Checkpoint**: User Story 1 is independently functional as the MVP, including burst-safe sequential queueing and durable deferred-overflow recovery.

---

## Phase 4: User Story 2 - Inspect Queue State (Priority: P2)

**Goal**: Expose operator-visible queue depth, deferred backlog, readiness, and failure context through status surfaces and logs.

**Independent Test**: Generate accepted, deferred, duplicate, and rejected requests and verify that `GET /api/v1/queue` and `GET /api/v1/health` expose queue and readiness state clearly enough for an operator to diagnose the service without inspecting implementation internals.

### Tests for User Story 2

- [X] T024 [P] [US2] Add contract coverage for `GET /api/v1/queue` and `GET /api/v1/health` in tests/contract/local-alert-api.contract.test.ts
- [X] T025 [P] [US2] Add queue visibility integration coverage in tests/integration/queue-status.integration.test.ts
- [X] T026 [P] [US2] Add queue snapshot and recent-failure unit coverage in tests/unit/queue-status-service.test.ts

### Implementation for User Story 2

- [X] T027 [P] [US2] Implement operator-facing queue snapshot aggregation in src/services/queue-status-service.ts
- [X] T028 [US2] Implement the queue status route with active, deferred, and failure summaries in src/routes/queue-status-route.ts
- [X] T029 [US2] Complete health and readiness behavior for persistence, config, and player state in src/routes/health-route.ts
- [X] T030 [US2] Add duplicate-handling, deferred-overflow, and rejection log messages in src/services/queue-admission-service.ts and src/shared/logger.ts
- [X] T031 [US2] Wire queue status and health routes into the HTTP server in src/app/server.ts
- [X] T032 [US2] Document queue-status and health usage for operators in docs/runtime.md and examples/alerts.http

**Checkpoint**: User Stories 1 and 2 are independently verifiable, and the operator can inspect queue state and readiness from supported runtime surfaces.

---

## Phase 5: User Story 3 - Recover From Failed Alerts (Priority: P3)

**Goal**: Isolate text-generation, playback, and restart-recovery failures so one bad alert does not block later work and interrupted active alerts become visible recovery failures instead of replaying.

**Independent Test**: Force TTS, playback, and crash-recovery failures while backlog remains queued, then verify failed alerts transition to explicit terminal outcomes, later accepted alerts continue in order, and recovery-failed active work is surfaced without automatic replay.

### Tests for User Story 3

- [X] T033 [P] [US3] Add failure-isolation and crash-recovery integration coverage in tests/integration/queue-recovery.integration.test.ts
- [X] T034 [P] [US3] Add overflow-store recovery-failure unit coverage in tests/unit/overflow-store.test.ts
- [X] T035 [P] [US3] Add orchestrator failure-path unit coverage for TTS and player errors in tests/unit/alert-orchestrator.test.ts

### Implementation for User Story 3

- [X] T036 [P] [US3] Implement terminal failure and recovery-failed persistence handling in src/services/overflow-store.ts and src/domain/recovery-failure-record.ts
- [X] T037 [P] [US3] Implement bounded ElevenLabs and player failure handling in src/services/alert-orchestrator.ts and src/integrations/elevenlabs-client.ts
- [X] T038 [US3] Extend startup recovery to mark interrupted active work as recovery-failed in src/services/queue-recovery-service.ts
- [X] T039 [US3] Surface recovery-failed and terminal failure summaries in src/services/queue-status-service.ts and src/routes/queue-status-route.ts
- [X] T040 [US3] Document crash-recovery and failure-isolation behavior in docs/runtime.md and examples/alerts.http

**Checkpoint**: All three user stories are independently functional, including failure isolation and deterministic recovery behavior.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish documentation, fixtures, and end-to-end validation across stories

- [X] T041 [P] Add sample alert payloads and burst-test fixtures in examples/alerts.http and examples/burst-alerts.json
- [X] T042 [P] Align the quickstart and runtime docs with implemented commands and recovery behavior in specs/001-burst-safe-alert-queue/quickstart.md and docs/runtime.md
- [X] T043 Tighten structured log fields and queue metrics across src/shared/logger.ts, src/services/alert-orchestrator.ts, and src/services/queue-status-service.ts
- [X] T044 [P] Verify the OpenAPI contract matches implemented responses in specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml and tests/contract/local-alert-api.contract.test.ts
- [X] T045 Record Windows startup, burst, and restart validation notes in specs/001-burst-safe-alert-queue/quickstart.md and docs/runtime.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** starts immediately.
- **Phase 2: Foundational** depends on Phase 1 and blocks all user stories.
- **Phase 3: User Story 1** depends on Phase 2 and establishes the core queueing runtime.
- **Phase 4: User Story 2** depends on Phase 2 and is easiest to complete after the core queue services from User Story 1 exist.
- **Phase 5: User Story 3** depends on Phase 2 and also builds most cleanly after the User Story 1 queue runtime exists.
- **Phase 6: Polish** depends on all desired story work being complete.

### User Story Dependencies

- **US1 (P1)**: No story dependency beyond foundational work. This is the MVP.
- **US2 (P2)**: Depends on the shared foundation and uses queue services introduced by US1 for richer status reporting.
- **US3 (P3)**: Depends on the shared foundation and extends US1 runtime behavior with failure and recovery rules.

### Within Each User Story

- Write and fail tests before or alongside implementation when practical.
- Domain and persistence changes precede orchestration behavior.
- Service logic precedes routes and server wiring.
- Route work precedes documentation updates for the story.
- Story completion requires observability and failure-path handling, not just the happy path.

### Recommended Delivery Order

1. Complete Setup and Foundational work.
2. Deliver US1 as the MVP.
3. Deliver US2 for queue visibility.
4. Deliver US3 for deterministic failure recovery.
5. Finish Polish tasks.

---

## Parallel Execution Examples

### Setup

```text
T002 and T003 can run in parallel after T001.
T004 can run in parallel with T002 and T003.
```

### User Story 1

```text
Run T013, T014, T015, and T016 in parallel before implementation.
Run T017 and T018 in parallel once foundational files exist.
```

### User Story 2

```text
Run T024, T025, and T026 in parallel before implementation.
Run T027 and T030 in parallel, then complete T028, T029, and T031.
```

### User Story 3

```text
Run T033, T034, and T035 in parallel before implementation.
Run T036 and T037 in parallel, then complete T038 and T039.
```

---

## Implementation Strategy

### MVP First

1. Finish Phase 1 and Phase 2.
2. Complete Phase 3 (US1) only.
3. Validate burst-safe intake, deferred overflow persistence, restart restoration order, and non-preemptive playback.
4. Stop for review before layering visibility and failure-recovery enhancements.

### Incremental Delivery

1. Build the service scaffold and durable queue primitives.
2. Ship US1 for core queue correctness.
3. Add US2 for operator status visibility without changing queue ordering rules.
4. Add US3 for failure and crash-recovery isolation.
5. Finish examples, docs, and contract parity in Polish.

### Suggested MVP Scope

- **MVP**: Phase 1, Phase 2, and Phase 3 (US1)
- **Next increment**: Phase 4 (US2)
- **Final increment**: Phase 5 (US3) and Phase 6 (Polish)

---

## Notes

- All tasks follow the required checklist format: checkbox, sequential ID, optional `[P]`, optional `[US#]`, and exact file paths.
- Tasks are intentionally concrete so an implementation agent can execute them without additional feature decomposition.
- The task plan assumes the repository currently has no service code and that this feature creates the initial application structure.

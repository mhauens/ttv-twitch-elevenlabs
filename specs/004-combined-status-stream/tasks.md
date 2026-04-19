# Tasks: Combined Status Stream

**Input**: Design documents from `/specs/004-combined-status-stream/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/local-alert-api.openapi.yaml, contracts/status-websocket-runtime-contract.md, quickstart.md

**Tests**: Include tests for all behavior-changing work. This feature adds new SSE and WebSocket runtime surfaces, long-lived connection lifecycle management, and shutdown behavior, so unit, integration, and contract coverage are required.

**Organization**: Tasks are grouped by user story so SSE, WebSocket, and pull-contract preservation can each be implemented and validated independently after the shared stream foundation is in place.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel when tasks touch different files and do not depend on incomplete work
- **[Story]**: Which user story the task belongs to (`[US1]`, `[US2]`, `[US3]`)
- Every task includes exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare repository dependencies and reusable test support for realtime transport work

- [ ] T001 Add the Phase 2 WebSocket dependency to package.json and pnpm-lock.yaml
- [ ] T002 [P] Extend streaming test helpers for SSE parsing and socket lifecycle control in tests/support/test-utils.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared combined-snapshot and stream-lifecycle infrastructure required by every user story

**⚠️ CRITICAL**: No user story work should begin until this phase is complete

- [ ] T003 Create combined snapshot, comparable-state, and subscriber types in src/domain/combined-status-snapshot.ts
- [ ] T004 Implement polling, semantic diffing, stream sequencing, subscriber registry core, and structured logging for snapshot refresh failures plus subscriber lifecycle events in src/services/status-stream-service.ts
- [ ] T005 [P] Add foundational unit coverage for sequence generation, changed-only broadcasts, and dispose behavior in tests/unit/status-stream-service.test.ts
- [ ] T006 Wire StatusStreamService creation, startup, shutdown, and service exposure into src/app/server.ts

**Checkpoint**: The application owns one shared stream service that can build and track combined status independently of any transport.

---

## Phase 3: User Story 1 - Subscribe To Live Status Over SSE (Priority: P1) 🎯 MVP

**Goal**: Deliver an SSE endpoint that sends the current combined status immediately and then emits changed snapshots plus idle keepalives.

**Independent Test**: Open `GET /api/v1/status/stream`, verify an immediate `snapshot` event, trigger alert activity, and confirm only changed snapshots plus keepalive comments are emitted.

### Tests for User Story 1

- [ ] T007 [P] [US1] Add SSE contract coverage for GET /api/v1/status/stream in tests/contract/local-alert-api.contract.test.ts
- [ ] T008 [P] [US1] Add SSE integration coverage for initial snapshot delivery, degraded-health subscriptions, changed updates, and keepalive comments in tests/integration/status-stream.integration.test.ts
- [ ] T009 [P] [US1] Add SSE service coverage for immediate snapshot replay and subscriber disconnect cleanup in tests/unit/status-stream-service.test.ts

### Implementation for User Story 1

- [ ] T010 [US1] Implement SSE response formatting and connection lifecycle in src/routes/status-stream-route.ts
- [ ] T011 [US1] Extend SSE subscriber registration and initial snapshot delivery in src/services/status-stream-service.ts
- [ ] T012 [US1] Register GET /api/v1/status/stream in src/app/server.ts
- [ ] T013 [US1] Update the feature-local SSE contract in specs/004-combined-status-stream/contracts/local-alert-api.openapi.yaml and sync the repository-wide contract in specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml in the same change
- [ ] T014 [P] [US1] Document SSE usage and add operator samples in docs/runtime.md, README.md, examples/status-stream-sse.mjs, and examples/alerts.http

**Checkpoint**: User Story 1 is independently functional, and operators can subscribe to live combined status over SSE without changing existing pull endpoints.

---

## Phase 4: User Story 2 - Receive The Same Status Over WebSocket (Priority: P2)

**Goal**: Reuse the shared combined snapshot pipeline to deliver the same change-only status feed over WebSocket.

**Independent Test**: Connect to `/api/v1/status/ws`, verify the first message is the current combined snapshot, then trigger status changes and confirm follow-up messages arrive only when the semantic state changes.

### Tests for User Story 2

- [ ] T015 [P] [US2] Add WebSocket integration coverage for initial snapshot delivery, degraded-health subscriptions, changed-only broadcasts, and ignored client messages in tests/integration/status-stream.integration.test.ts
- [ ] T016 [P] [US2] Add WebSocket liveness and dead-client cleanup coverage in tests/unit/status-stream-service.test.ts

### Implementation for User Story 2

- [ ] T017 [US2] Implement WebSocket subscriber registration, ping scheduling, and ignored client-message handling in src/services/status-stream-service.ts
- [ ] T018 [US2] Attach /api/v1/status/ws to the existing HTTP server lifecycle in src/app/server.ts
- [ ] T019 [P] [US2] Document WebSocket runtime behavior and add an example client in docs/runtime.md, README.md, and examples/status-stream-ws.mjs

**Checkpoint**: User Stories 1 and 2 both work independently, and the same combined snapshot contract is available over SSE and WebSocket.

---

## Phase 5: User Story 3 - Keep Existing Pull Status Behavior Stable (Priority: P3)

**Goal**: Preserve the existing `/api/v1/queue` and `/api/v1/health` pull contracts and ensure shutdown cleanup does not interfere with them.

**Independent Test**: Compare `/api/v1/queue` and `/api/v1/health` before and after the realtime feature, then stop the app with active stream subscribers and verify pull behavior stays unchanged while stream clients close cleanly.

### Tests for User Story 3

- [ ] T020 [P] [US3] Add contract regression coverage for unchanged /api/v1/queue and /api/v1/health envelopes alongside streaming in tests/contract/local-alert-api.contract.test.ts
- [ ] T021 [P] [US3] Add integration coverage for unchanged pull endpoints, degraded-health visibility, and shutdown cleanup of open stream clients in tests/integration/status-stream.integration.test.ts

### Implementation for User Story 3

- [ ] T022 [US3] Keep combined snapshot assembly read-only from existing QueueStatusService methods in src/services/status-stream-service.ts
- [ ] T023 [US3] Finalize shutdown ordering so stream cleanup precedes HTTP server and queue-resource disposal in src/app/server.ts
- [ ] T024 [P] [US3] Update validation guidance for unchanged pull endpoints and shutdown behavior in docs/runtime.md and specs/004-combined-status-stream/quickstart.md

**Checkpoint**: All three user stories are independently functional, and the realtime layer remains additive to the existing pull-based status API.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish documentation alignment, observability checks, and final validation across all stories

- [ ] T025 [P] Align implemented transport details with feature artifacts in specs/004-combined-status-stream/contracts/local-alert-api.openapi.yaml and specs/004-combined-status-stream/contracts/status-websocket-runtime-contract.md
- [ ] T026 [P] Verify documented structured logging behavior for snapshot refresh failures and subscriber lifecycle events in src/services/status-stream-service.ts and docs/runtime.md
- [ ] T027 Run pnpm lint, pnpm test, and pnpm build and record validation notes in specs/004-combined-status-stream/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** starts immediately.
- **Phase 2: Foundational** depends on Phase 1 and blocks all user stories.
- **Phase 3: User Story 1** depends on Phase 2 and delivers the MVP SSE stream.
- **Phase 4: User Story 2** depends on Phase 3 so WebSocket delivery follows the SSE-first rollout defined by the spec and plan.
- **Phase 5: User Story 3** depends on Phase 2 and validates additive safety for the existing pull endpoints.
- **Phase 6: Polish** depends on all desired story work being complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on the shared stream foundation and is the MVP.
- **US2 (P2)**: Depends on US1 delivery sequencing and reuses the same combined snapshot service after SSE behavior is in place.
- **US3 (P3)**: Depends only on the shared stream foundation and the existing queue and health routes.

### Within Each User Story

- Write and fail tests before or alongside implementation when practical.
- Shared domain types and stream-service behavior precede transport-specific wiring.
- Service implementation precedes route or HTTP-server integration.
- Docs and operator samples must be updated before the story is complete.
- Story completion must include shutdown behavior, logging expectations, and regressions against existing pull surfaces where applicable.

### Recommended Delivery Order

1. Complete Setup and Foundational work.
2. Deliver US1 as the SSE MVP.
3. Deliver US2 for the matching WebSocket transport only after US1 is implemented and validated.
4. Deliver US3 to confirm additive safety for the pull endpoints and shutdown path.
5. Finish Polish tasks.

---

## Parallel Execution Examples

### Setup

```text
T001 and T002 can run in parallel if one developer updates dependencies while another extends test helpers.
```

### User Story 1

```text
Run T007, T008, and T009 in parallel before implementation.
After the tests are in place, T013 and T014 can proceed in parallel while T010 through T012 implement the SSE runtime path.
```

### User Story 2

```text
Run T015 and T016 in parallel before implementation.
After T017 is underway, T019 can proceed in parallel with T018 because the docs and sample client do not change the server wiring.
```

### User Story 3

```text
Run T020 and T021 in parallel before implementation.
After T023 is in place, T024 can proceed in parallel with final regression verification.
```

---

## Implementation Strategy

### MVP First

1. Finish Phase 1 and Phase 2.
2. Complete Phase 3 (US1) only.
3. Validate the SSE stream independently with an active alert and an idle keepalive period.
4. Stop for review before adding WebSocket transport and regression hardening.

### Incremental Delivery

1. Build the shared combined snapshot types, diffing logic, and lifecycle management.
2. Ship US1 for SSE delivery.
3. Add US2 for the matching WebSocket transport.
4. Add US3 for unchanged pull contracts and shutdown cleanup.
5. Finish docs, logging checks, and final validation in Polish.

### Suggested MVP Scope

- **MVP**: Phase 1, Phase 2, and Phase 3 (US1)
- **Next increment**: Phase 4 (US2)
- **Final increment**: Phase 5 (US3) and Phase 6 (Polish)

---

## Notes

- All tasks follow the required checklist format: checkbox, sequential ID, optional `[P]`, optional `[US#]`, and exact file paths.
- The task list keeps the existing `/api/v1/queue` and `/api/v1/health` contracts as additive constraints rather than rewriting them.
- SSE is treated as the first externally documented transport, while WebSocket remains a runtime contract and integration-tested transport.
- No `.env` changes are planned for this feature.
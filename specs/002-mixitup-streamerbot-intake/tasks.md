# Tasks: Mix It Up And Streamer.bot Intake Support

**Input**: Design documents from `/specs/002-mixitup-streamerbot-intake/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Include the requested contract and schema coverage for `mixitup`, keep unsupported-source rejection explicit, and finish with the repository regression commands from `package.json`.

**Organization**: Tasks are grouped by user story to keep the runtime change, operator documentation, and compatibility validation independently deliverable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`[US1]`, `[US2]`, `[US3]`)
- Every task includes the exact file path that should be changed or used

## Phase 1: Setup (Shared Context)

**Purpose**: Audit the existing intake, documentation, and test surfaces before editing implementation files.

- [X] T001 Audit current source-related surfaces in src/domain/alert-request.ts, src/integrations/event-normalizer.ts, tests/contract/local-alert-api.contract.test.ts, README.md, docs/runtime.md, and examples/alerts.http

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lock the authoritative 002 feature artifacts and define the repository-facing synchronization targets before story work begins.

**⚠️ CRITICAL**: No user story work should start until this phase is complete.

- [X] T002 Synchronize the repository-facing intake contract in specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml from the authoritative feature contract in specs/002-mixitup-streamerbot-intake/contracts/local-alert-api.openapi.yaml
- [X] T003 [P] Confirm that no queue-semantic or configuration changes are required by reviewing specs/002-mixitup-streamerbot-intake/plan.md against src/routes/alerts-route.ts and src/services/queue-admission-service.ts

**Checkpoint**: The 002 feature artifacts are authoritative, and the repository-facing synchronization targets are fixed for implementation.

---

## Phase 3: User Story 1 - Accept Supported Tool Requests (Priority: P1) 🎯 MVP

**Goal**: Accept `mixitup` through the existing intake endpoint with the same admission and validation behavior as current supported sources.

**Independent Test**: Submit a valid `mixitup` alert to `POST /api/v1/alerts` and verify the documented accepted envelope; submit an unsupported source and verify `400 INVALID_ALERT_REQUEST` with no queue work created.

### Tests for User Story 1

- [X] T004 [P] [US1] Extend accepted-envelope and invalid-source rejection coverage in tests/contract/local-alert-api.contract.test.ts
- [X] T005 [P] [US1] Add normalizeAlertRequest coverage for `mixitup` and invalid source values in tests/unit/event-normalizer.test.ts

### Implementation for User Story 1

- [X] T006 [P] [US1] Extend the AlertSource union with `mixitup` in src/domain/alert-request.ts
- [X] T007 [P] [US1] Extend alertRequestBodySchema and normalizeAlertRequest support for `mixitup` in src/integrations/event-normalizer.ts
- [X] T008 [US1] Preserve source-agnostic intake behavior while applying the new source support in src/routes/alerts-route.ts and src/services/queue-admission-service.ts

**Checkpoint**: `mixitup` is accepted through the existing contract and unsupported sources still fail validation.

---

## Phase 4: User Story 2 - Follow Clear Operator Integration Steps (Priority: P2)

**Goal**: Ship copy-ready operator guidance and examples for Mix It Up and the official Streamer.bot scripted POST flow.

**Independent Test**: Follow the shipped docs and examples to configure one Mix It Up request and one Streamer.bot scripted POST request, then identify the official response signals for each tool.

### Implementation for User Story 2

- [X] T009 [P] [US2] Add Mix It Up request samples and a reference to the scripted Streamer.bot flow in examples/alerts.http
- [X] T010 [P] [US2] Add a ready-to-run Streamer.bot POST example with HTTP status plus `data.outcome` and `data.jobId` handling in examples/streamerbot-alert.mjs
- [X] T011 [P] [US2] Document Mix It Up Web Request setup and official response fields in README.md
- [X] T012 [P] [US2] Document Mix It Up support and the official Streamer.bot Script-/Program-Execution POST flow in docs/runtime.md
- [X] T013 [US2] Synchronize repository-facing operator validation and response-handling guidance in specs/001-burst-safe-alert-queue/quickstart.md from specs/002-mixitup-streamerbot-intake/quickstart.md

**Checkpoint**: Operators can configure both supported tools from the repository docs without inventing a new payload shape or route.

---

## Phase 5: User Story 3 - Preserve Existing Client Compatibility (Priority: P3)

**Goal**: Keep existing `local`, `twitch`, and `streamerbot` clients compatible while proving queue, recovery, and admission semantics remain unchanged.

**Independent Test**: Re-run the existing contract and queue regression suite and verify that current supported sources still receive the same response envelope and queue behavior after `mixitup` support is added.

### Tests for User Story 3

- [X] T014 [US3] Extend previous-source compatibility assertions for `local`, `twitch`, and `streamerbot` in tests/contract/local-alert-api.contract.test.ts

### Implementation for User Story 3

- [X] T015 [P] [US3] Synchronize repository-facing supported-source and tool-profile references in specs/001-burst-safe-alert-queue/data-model.md from specs/002-mixitup-streamerbot-intake/data-model.md
- [X] T016 [P] [US3] Re-run source-agnostic queue regression coverage in tests/integration/queue-burst.integration.test.ts and tests/integration/queue-recovery.integration.test.ts without introducing tool-specific branches
- [X] T017 [US3] Run regression validation through package.json scripts `lint`, `test`, and `build`

**Checkpoint**: Existing clients remain compatible and the full regression suite confirms unchanged queue and recovery semantics.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close the loop between the implementation, feature artifacts, and operator validation.

- [X] T018 Reconcile implemented changes against the authoritative 002 feature artifacts, the synchronized 001 repository-facing artifacts, and specs/002-mixitup-streamerbot-intake/checklists/api.md
- [X] T019 Verify the Windows operator smoke path with examples/alerts.http, examples/streamerbot-alert.mjs, README.md, and docs/runtime.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: Starts after Foundational and delivers the MVP runtime change.
- **User Story 2 (Phase 4)**: Starts after Foundational and can proceed after the authoritative feature artifacts and synchronization targets are fixed.
- **User Story 3 (Phase 5)**: Starts after User Story 1 and User Story 2 because it validates compatibility across the implemented runtime and documentation changes.
- **Polish (Phase 6)**: Starts after all desired user stories are complete.

### User Story Dependency Graph

- **US1 (P1)**: Depends on Phase 2 only.
- **US2 (P2)**: Depends on Phase 2 only.
- **US3 (P3)**: Depends on US1 and US2.

### Within Each User Story

- Write or extend the listed tests before changing behavior where feasible.
- Update domain and validation code before relying on docs that reference the new source.
- Keep queue and recovery paths source-agnostic; reject any tool-specific branching in runtime services.
- Finish each story with the files and checks required by its independent test.

### Parallel Opportunities

- T002 and T003 can proceed in parallel once T001 is complete.
- In US1, T004/T005 and T006/T007 can each run in parallel because they touch separate files.
- In US2, T009, T010, T011, and T012 can run in parallel; T013 follows once operator-facing wording is stable.
- In US3, T015 and T016 can run in parallel before T017 executes the full regression suite.

---

## Parallel Example: User Story 1

```bash
# Run the US1 test work in parallel:
Task: "Extend accepted-envelope and invalid-source rejection coverage in tests/contract/local-alert-api.contract.test.ts"
Task: "Add normalizeAlertRequest coverage for mixitup and invalid source values in tests/unit/event-normalizer.test.ts"

# Run the US1 implementation work in parallel:
Task: "Extend the AlertSource union with mixitup in src/domain/alert-request.ts"
Task: "Extend alertRequestBodySchema and normalizeAlertRequest support for mixitup in src/integrations/event-normalizer.ts"
```

## Parallel Example: User Story 2

```bash
# Run the operator-doc updates in parallel:
Task: "Add Mix It Up and Streamer.bot request samples to examples/alerts.http"
Task: "Add a ready-to-run Streamer.bot POST example with HTTP status plus data.outcome and data.jobId handling in examples/streamerbot-alert.mjs"
Task: "Document Mix It Up Web Request setup and official response fields in README.md"
Task: "Document Mix It Up support and the official Streamer.bot Script-/Program-Execution POST flow in docs/runtime.md"
```

## Parallel Example: User Story 3

```bash
# Run the compatibility prep work in parallel:
Task: "Synchronize repository-facing supported-source and tool-profile references in specs/001-burst-safe-alert-queue/data-model.md from specs/002-mixitup-streamerbot-intake/data-model.md"
Task: "Re-run source-agnostic queue regression coverage in tests/integration/queue-burst.integration.test.ts and tests/integration/queue-recovery.integration.test.ts without introducing tool-specific branches"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Validate `mixitup` acceptance and unsupported-source rejection independently.

### Incremental Delivery

1. Finish Setup + Foundational to lock the public contract baseline.
2. Deliver US1 and validate the runtime change.
3. Deliver US2 and validate operator setup from shipped docs.
4. Deliver US3 and run the full regression suite.
5. Finish with Polish to reconcile authoritative 002 artifacts, synchronized 001 repository artifacts, and smoke validation.

### Parallel Team Strategy

1. One developer handles Foundational contract alignment.
2. After Phase 2, one developer can execute US1 while another prepares US2 docs.
3. US3 begins after US1 and US2 land, then one developer closes Phase 6.

---

## Notes

- `T004`, `T005`, `T014`, and `T016` satisfy the explicit test expectations from the feature brief.
- `T017` covers the required regression commands: `pnpm lint`, `pnpm test`, and `pnpm build`.
- No task should add a new route, new payload shape, or source-specific queue logic.
- The suggested MVP scope is User Story 1 only.

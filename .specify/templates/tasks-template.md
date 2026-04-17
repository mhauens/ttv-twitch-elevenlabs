---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Include tests for all behavior-changing work unless the change is docs-only,
configuration-only with no behavior shift, or an exception is explicitly justified.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Source paths SHOULD use `src/app/`, `src/routes/`, `src/services/`,
  `src/integrations/`, `src/playback/`, `src/config/`, and `src/shared/`.
- Test paths SHOULD use `tests/unit/`, `tests/integration/`, and `tests/contract/`.
- Runtime or operator docs SHOULD live in `docs/` and sample payloads in `examples/`.
- Paths shown below assume this repository's local Node.js service structure.

<!-- 
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.
  
  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  
  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create or update project structure per implementation plan
- [ ] T002 Initialize or update Node.js service dependencies in package.json
- [ ] T003 [P] Configure linting, formatting, and test scripts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Define or update environment schema in src/config/
- [ ] T005 [P] Implement API routing, validation, and error middleware in src/routes/
- [ ] T006 [P] Establish adapter interfaces for touched integrations in src/integrations/
- [ ] T007 Create shared domain types plus queue admission, backlog, and non-preemption rules needed across stories
- [ ] T008 Configure structured logging and correlation fields
- [ ] T009 Add or update health/readiness and queue-status surfaces where required
- [ ] T010 Document operator startup or recovery impact in docs/

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T011 [P] [US1] Contract test for [endpoint] in tests/contract/[name].test.ts
- [ ] T012 [P] [US1] Integration test for [user journey] in tests/integration/[name].test.ts
- [ ] T013 [P] [US1] Unit test for changed domain logic in tests/unit/[name].test.ts
- [ ] T014 [P] [US1] Queue-order, burst-drain, or failure-isolation test in tests/unit/[name].test.ts when queue or playback behavior changes

### Implementation for User Story 1

- [ ] T015 [P] [US1] Create or update domain types in src/domain/[name].ts
- [ ] T016 [P] [US1] Implement adapter changes in src/integrations/[name].ts
- [ ] T017 [US1] Implement service workflow in src/services/[name].ts
- [ ] T018 [US1] Implement route or runtime entrypoint in src/routes/[name].ts or src/app/[name].ts
- [ ] T019 [US1] Add validation, timeout, retry, queue-admission, and failure handling
- [ ] T020 [US1] Add structured logs, job IDs, and operator-visible error messages
- [ ] T021 [US1] Update `.env` schema, examples, and docs if runtime config changes

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [ ] T022 [P] [US2] Contract test for [endpoint] in tests/contract/[name].test.ts
- [ ] T023 [P] [US2] Integration test for [user journey] in tests/integration/[name].test.ts
- [ ] T024 [P] [US2] Unit test for changed logic in tests/unit/[name].test.ts
- [ ] T025 [P] [US2] Queue-order, burst-drain, or failure-isolation test in tests/unit/[name].test.ts when queue or playback behavior changes

### Implementation for User Story 2

- [ ] T026 [P] [US2] Create or update domain types in src/domain/[name].ts
- [ ] T027 [US2] Implement service workflow in src/services/[name].ts
- [ ] T028 [US2] Implement route, adapter, or playback integration in src/[location]/[file].ts
- [ ] T029 [US2] Integrate with prior stories without breaking independent testability
- [ ] T030 [US2] Update `.env` schema, examples, and docs if runtime config changes

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 (OPTIONAL - only if tests requested) ⚠️

- [ ] T031 [P] [US3] Contract test for [endpoint] in tests/contract/[name].test.ts
- [ ] T032 [P] [US3] Integration test for [user journey] in tests/integration/[name].test.ts
- [ ] T033 [P] [US3] Unit test for changed logic in tests/unit/[name].test.ts
- [ ] T034 [P] [US3] Queue-order, burst-drain, or failure-isolation test in tests/unit/[name].test.ts when queue or playback behavior changes

### Implementation for User Story 3

- [ ] T035 [P] [US3] Create or update domain types in src/domain/[name].ts
- [ ] T036 [US3] Implement service workflow in src/services/[name].ts
- [ ] T037 [US3] Implement route, adapter, or playback integration in src/[location]/[file].ts
- [ ] T038 [US3] Update `.env` schema, examples, and docs if runtime config changes

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/ and `.env` examples
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Verify structured logging and observability coverage across stories
- [ ] TXXX [P] Add remaining unit or integration tests needed for changed behavior
- [ ] TXXX Security and secret-handling review
- [ ] TXXX Confirm health/readiness and queue-status behavior for the final system
- [ ] TXXX Run Windows runtime validation and quickstart.md verification

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Required tests MUST be written and FAIL before implementation where feasible
- Domain types before services
- Services before routes, adapters, or playback orchestration
- Core implementation before live runtime validation
- `.env`, docs, and operational surfaces MUST be updated before story completion
- Story completion MUST include observability and failure-path handling
- Story completion MUST include any required burst-queue and non-preemptive-alert
  validation when queue or playback behavior changed

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for [endpoint] in tests/contract/[name].test.ts"
Task: "Integration test for [user journey] in tests/integration/[name].test.ts"
Task: "Unit test for changed logic in tests/unit/[name].test.ts"

# Launch independent implementation work for User Story 1 together:
Task: "Create or update domain types in src/domain/[name].ts"
Task: "Implement adapter changes in src/integrations/[name].ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Include operator-facing runtime validation when playback or live orchestration changes
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

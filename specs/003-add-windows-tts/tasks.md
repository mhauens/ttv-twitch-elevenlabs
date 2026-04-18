# Tasks: Windows TTS Mode

**Input**: Design documents from `/specs/003-add-windows-tts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/windows-tts-runtime-contract.md, quickstart.md

**Tests**: Include tests for all behavior-changing work. This feature changes runtime configuration, startup validation, provider selection, and alert synthesis behavior, so unit tests and targeted startup-validation coverage are required.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently once the shared TTS foundation is in place.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel when tasks touch different files and do not depend on incomplete work
- **[Story]**: Which user story the task belongs to (`[US1]`, `[US2]`, `[US3]`)
- Every task includes exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared seams and test helpers for the Windows TTS provider work

- [X] T001 [P] Create the shared TTS provider contract and synthesized-audio types in src/integrations/text-to-speech-client.ts
- [X] T002 [P] Extend reusable test helpers for TTS mode overrides and temporary audio directories in tests/support/test-utils.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish provider selection, startup wiring, and shared runtime validation needed before any user story can be delivered

**⚠️ CRITICAL**: No user story work should begin until this phase is complete

- [X] T003 Update runtime environment parsing for `TTS_MODE=windows` in src/config/env.ts
- [X] T004 [P] Extract stub-only synthesis into src/integrations/stub-tts-client.ts and keep ElevenLabs-specific logic in src/integrations/elevenlabs-client.ts
- [X] T005 [P] Implement provider selection and startup-validation wiring in src/integrations/tts-client-factory.ts
- [X] T006 Wire the shared TTS factory into application bootstrap in src/app/server.ts

**Checkpoint**: The application can select a provider through one shared interface, and startup has a single place to validate provider readiness.

---

## Phase 3: User Story 1 - Play Alerts With Local Windows Voice (Priority: P1) 🎯 MVP

**Goal**: Generate local Windows speech as a WAV artifact and play it through the existing player path without changing the alert HTTP API or queue behavior.

**Independent Test**: Configure `TTS_MODE=windows` on a supported Windows machine, send one alert, and verify audible playback through the configured player with the existing API shape.

### Tests for User Story 1

- [X] T007 [P] [US1] Add env parsing coverage for `TTS_MODE=windows` in tests/unit/env.test.ts
- [X] T008 [P] [US1] Add TTS factory selection coverage for stub, ElevenLabs, and Windows modes in tests/unit/tts-client-factory.test.ts
- [X] T009 [P] [US1] Add Windows synthesis success-path coverage for WAV output creation in tests/unit/windows-tts-client.test.ts

### Implementation for User Story 1

- [X] T010 [US1] Extract shared alert-text rendering into src/shared/alert-text-renderer.ts and update src/integrations/elevenlabs-client.ts and src/integrations/windows-tts-client.ts to consume it
- [X] T011 [US1] Implement the Windows speech synthesis client with WAV output generation in src/integrations/windows-tts-client.ts
- [X] T012 [US1] Register the Windows client in src/integrations/tts-client-factory.ts and src/app/server.ts
- [X] T013 [US1] Document Windows mode configuration for normal alert playback in .env.example and docs/runtime.md

**Checkpoint**: User Story 1 is independently functional, and a Windows machine can play alerts through the existing queue and player workflow using local speech synthesis.

---

## Phase 4: User Story 2 - Fail Fast On Unsupported Runtime (Priority: P2)

**Goal**: Reject unsupported or unusable Windows TTS configuration during startup so the service never appears ready when alert synthesis cannot work.

**Independent Test**: Start the service with `TTS_MODE=windows` on a non-Windows runtime or with no usable Windows speech path and verify startup fails before readiness.

### Tests for User Story 2

- [X] T014 [P] [US2] Add startup validation coverage for unsupported runtime and unusable speech path in tests/unit/server.test.ts
- [X] T015 [P] [US2] Add Windows client validation failure coverage in tests/unit/windows-tts-client.test.ts
- [X] T027 [P] [US2] Add startup readiness integration coverage for invalid `TTS_MODE=windows` configuration in tests/integration/windows-tts-startup.integration.test.ts
- [X] T028 [US2] Add startup configuration smoke-test coverage for unsupported runtime and unusable speech path in tests/integration/windows-tts-startup.integration.test.ts

### Implementation for User Story 2

- [X] T016 [US2] Implement Windows platform and speech-path startup validation in src/integrations/windows-tts-client.ts
- [X] T017 [US2] Enforce startup failure on invalid Windows TTS configuration in src/app/server.ts
- [X] T018 [US2] Document Windows-only startup requirements and failure expectations in README.md and docs/runtime.md

**Checkpoint**: User Stories 1 and 2 now work independently, and the service fails before readiness when Windows TTS cannot be used safely.

---

## Phase 5: User Story 3 - Preserve Queue Reliability During TTS Failures (Priority: P3)

**Goal**: Ensure one Windows TTS failure records a normal alert-processing failure and does not block later queued alerts.

**Independent Test**: Force one Windows TTS synthesis error while later alerts remain queued, then verify failure recording and continued queue drain in order.

### Tests for User Story 3

- [X] T019 [P] [US3] Add Windows synthesis error propagation coverage in tests/unit/windows-tts-client.test.ts
- [X] T020 [P] [US3] Reconfirm queue continuation after TTS failures in tests/unit/alert-orchestrator.test.ts

### Implementation for User Story 3

- [X] T021 [US3] Normalize Windows synthesis failures into standard provider errors in src/integrations/windows-tts-client.ts
- [X] T022 [US3] Preserve generated-file cleanup and later-alert continuation in src/services/alert-orchestrator.ts
- [X] T023 [US3] Add operator-visible Windows TTS failure logging in src/integrations/windows-tts-client.ts and src/services/alert-orchestrator.ts

**Checkpoint**: All three user stories are independently functional, including startup protection and failure isolation for Windows TTS alerts.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish operator docs, manual validation guidance, and final verification coverage across stories

- [X] T024 [P] Update the Windows smoke-test and negative validation steps in specs/003-add-windows-tts/quickstart.md and docs/runtime.md
- [X] T025 [P] Align operator-facing configuration guidance for Windows mode in README.md and .env.example
- [X] T026 Record final lint, test, and build validation notes in specs/003-add-windows-tts/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** starts immediately.
- **Phase 2: Foundational** depends on Phase 1 and blocks all user stories.
- **Phase 3: User Story 1** depends on Phase 2 and delivers the MVP local Windows speech path.
- **Phase 4: User Story 2** depends on Phase 2 and builds cleanly after the Windows client exists from US1.
- **Phase 5: User Story 3** depends on Phase 2 and extends the Windows client plus orchestrator failure behavior after US1.
- **Phase 6: Polish** depends on all desired story work being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency beyond foundational work. This is the MVP.
- **US2 (P2)**: Depends on the shared TTS foundation and the Windows provider introduced by US1.
- **US3 (P3)**: Depends on the shared TTS foundation and the Windows provider introduced by US1.

### Within Each User Story

- Write and fail tests before or alongside implementation when practical.
- Shared provider contracts and factory wiring precede provider-specific startup rules.
- Provider implementation precedes server wiring and documentation updates.
- Story completion requires operator-visible error handling, not just the happy path.
- Final story completion requires preserving queue semantics and cleanup behavior, not changing them.

### Recommended Delivery Order

1. Complete Setup and Foundational work.
2. Deliver US1 as the MVP local speech path.
3. Deliver US2 for startup safety and readiness honesty.
4. Deliver US3 for deterministic failure isolation.
5. Finish Polish tasks.

---

## Parallel Execution Examples

### Setup

```text
T001 and T002 can run in parallel if one developer handles the provider contract while another updates shared test helpers.
```

### User Story 1

```text
Run T007, T008, and T009 in parallel before implementation.
After foundation work, T011 and T013 can proceed in parallel while T010 is in progress.
```

### User Story 2

```text
Run T014, T015, and T027 in parallel before implementation.
After T016 is in place, T017 and T018 can proceed in parallel.
```

### User Story 3

```text
Run T019 and T020 in parallel before implementation.
After T021 is complete, T022 and T023 can proceed in parallel.
```

---

## Implementation Strategy

### MVP First

1. Finish Phase 1 and Phase 2.
2. Complete Phase 3 (US1) only.
3. Validate one-alert audible playback on Windows with the existing API and queue flow.
4. Stop for review before adding startup-hardening and failure-specific refinements.

### Incremental Delivery

1. Build the shared TTS interface, factory, and bootstrap wiring.
2. Ship US1 for local Windows speech playback.
3. Add US2 for startup validation and readiness honesty.
4. Add US3 for provider-specific failure isolation and logging.
5. Finish docs and validation notes in Polish.

### Suggested MVP Scope

- **MVP**: Phase 1, Phase 2, and Phase 3 (US1)
- **Next increment**: Phase 4 (US2)
- **Final increment**: Phase 5 (US3) and Phase 6 (Polish)

---

## Notes

- All tasks follow the required checklist format: checkbox, sequential ID, optional `[P]`, optional `[US#]`, and exact file paths.
- No HTTP contract tasks are included because the feature does not change request or response shapes.
- The tasks assume the repository already contains the queue, player, and startup surfaces planned in `003-add-windows-tts` and only extends the TTS boundary and operator runtime configuration.
- Startup validation still includes integration and smoke-test coverage even though no HTTP request or response schema changes are planned.
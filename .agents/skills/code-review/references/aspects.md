# Review Aspects

Use this reference to decide which aspect-specific review passes should run for the current diff.

## General Rules

- Only report issues that are credibly supported by the changed hunks plus the minimum surrounding code needed for confirmation.
- Skip an aspect when the changed files do not provide a realistic evidence path for that kind of issue.
- Do not duplicate the same finding across multiple aspects. Keep it under the most specific aspect or the highest applicable severity.

## Queue Semantics & Recovery

- Look for: ordering regressions, more than one active alert, newer work jumping ahead of deferred backlog, replay of interrupted active work, unsafe shutdown handling, restore-path gaps, or queue-state transitions that break the documented invariants.
- Relevant when: the diff touches `src/services/queue-admission-service.ts`, `src/services/alert-orchestrator.ts`, `src/services/overflow-store.ts`, `src/services/queue-recovery-service.ts`, queue domain models, or related integration tests.
- Skip when: the diff is clearly isolated to presentation, docs-only changes, or unrelated tooling.
- Review goal: confirm that accepted alerts remain externally ordered, active work stays non-preemptive, deferred overflow is restored safely, and startup recovery matches the documented failure semantics.

## HTTP Contract & Validation

- Look for: request/response drift, missing validation, inconsistent status codes, stale OpenAPI, broken response envelopes, mismatches between routes and contract tests, or readiness semantics that do not reflect actual intake safety.
- Relevant when: the diff touches `src/routes/`, `src/integrations/event-normalizer.ts`, `src/shared/errors.ts`, OpenAPI files, or contract tests.
- Skip when: the diff does not affect input validation, output shape, status codes, or public runtime surfaces.
- Review goal: confirm that the documented local API remains stable, explicit, and test-backed.

## External Boundaries & Failure Isolation

- Look for: unbounded or unsafe calls to ElevenLabs, player process invocation risks, filesystem assumptions, missing cleanup, failures that block later alerts, or error handling that hides a terminal outcome from operators.
- Relevant when: the diff touches `src/integrations/elevenlabs-client.ts`, `src/playback/`, `src/services/alert-orchestrator.ts`, or related tests and docs.
- Skip when: the diff has no interaction with external processes, filesystem, or network boundaries.
- Review goal: confirm that external failures stay bounded, visible, and isolated from the rest of the queue.

## Config & Startup Safety

- Look for: configuration drift, invalid defaults, missing env validation, startup success when the service is not actually safe to accept work, or health/readiness logic that overstates availability.
- Relevant when: the diff touches `src/config/`, `src/app/server.ts`, `src/routes/health-route.ts`, `.env.example`, runtime docs, or startup tests.
- Skip when: the diff does not affect startup, configuration, or readiness behavior.
- Review goal: confirm that the process fails fast when necessary and reports readiness honestly.

## Observability & Operations

- Look for: missing correlation fields, queue transitions that are not logged, operator-visible states that disappear from `/api/v1/queue`, stale docs, or Windows-specific operational notes that no longer match the implementation.
- Relevant when: the diff touches logging, status routes, queue snapshot logic, docs, examples, or recovery behavior.
- Skip when: the change has no meaningful effect on operator diagnosis or runtime operations.
- Review goal: confirm that an operator can understand acceptance, deferral, failure, and recovery without reverse-engineering the code.

## Clean Code & Simplification

- Look for: unnecessary nesting, redundant abstractions, duplicate branches, overly dense expressions, misleading names, dead comments, magic values introduced without context, or local structure that is harder to follow than necessary.
- Relevant when: the diff changes logic, module boundaries, naming, control flow, helper usage, or non-trivial tests.
- Skip when: the diff is purely generated, comment-only, or too mechanical to support a meaningful clean-code judgment.
- Review goal: find behavior-preserving simplifications that improve clarity, consistency, and maintainability without expanding scope beyond the touched code.

## Security

- Look for: unsafe handling of external input, untrusted payloads flowing into logs or process execution, secrets being exposed, path or command injection risk, or health/readiness behavior that masks a degraded unsafe state.
- Relevant when: JS/TS, config, env handling, request parsing, filesystem paths, process execution, or external network calls change.
- Skip when: the diff is purely cosmetic and does not alter data handling, execution, or external communication.

## Code Quality

- Look for: weak boundaries between routes and services, duplicated policy logic, structural choices that make future queue or recovery changes error-prone, or abstractions that hide critical invariants.
- Relevant when: the diff introduces new logic, abstractions, or structural changes.
- Skip when: the change is purely mechanical and leaves the code shape effectively unchanged.

## Bugs

- Look for: incorrect conditions, missing null handling, queue-depth miscounts, stale recovery state, response mismatches, file cleanup bugs, or behavior that clearly differs from the documented queue flow.
- Relevant when: logic, rendering, data flow, or tests change.
- Skip when: there is no behavioral change and the diff is purely formatting or comment-only.

## Race Conditions

- Look for: order-dependent async flows, duplicate processing, timing assumptions around drain scheduling, startup/shutdown races, or tests that mask order-sensitive failures.
- Relevant when: JS/TS changes affect async flows, initialization, recovery, shared mutable state, or external process coordination.
- Skip when: the diff touches only static content or formatting with no behavioral surface.

## Test Flakiness

- Look for: timing-sensitive assertions, brittle filesystem assumptions, unstable ordering checks, or tests that rely on incidental implementation details instead of documented behavior.
- Relevant when: the diff changes tests, async queue behavior, external-boundary fakes, or order-sensitive logic.
- Skip when: no test surface or timing-sensitive behavior is touched.

## Maintainability

- Look for: hidden coupling across routes, services, persistence, adapters, docs, and contracts; also watch for brittle assumptions that will break the next queue feature or operational change.
- Relevant when: the diff introduces new conventions, wrappers, helper usage, or cross-file dependencies.
- Skip when: the change is trivial and does not increase long-term complexity.

## Performance

- Look for: avoidable queue scans, repeated expensive work on hot paths, unnecessary disk churn, redundant serialization, or logic that scales poorly under burst load.
- Relevant when: JS/TS changes affect runtime work, I/O, or burst handling.
- Skip when: the diff has no realistic performance impact.

## Accessibility

- Look for: weak semantics or unclear interaction affordances in any operator-facing HTTP example, docs, or future UI-related changes.
- Relevant when: the diff affects human-facing documentation, examples, or any interactive surface that may later be rendered to users.
- Skip when: the change cannot plausibly affect interaction, semantics, or perceivability.

## Testing & Documentation

- Look for: missing validation notes for changed behavior, missing Vitest coverage where a realistic test path exists, stale runtime docs, outdated examples, or contract changes without synchronized tests.
- Relevant when: behavior, public interfaces, startup flow, queue semantics, contracts, docs, or tests are introduced or changed.
- Skip when: the changed area has no real automated test path and the diff is too small to justify additional manual validation or documentation notes.
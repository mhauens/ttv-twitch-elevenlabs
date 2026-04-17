<!--
Sync Impact Report
Version change: 1.0.0 -> 1.1.0
Modified principles:
- 3. Engineering Principles -> 3. Engineering Principles (queue state and non-preemptive execution expanded)
- 4. API Design Rules -> 4. API Design Rules (queue admission and backpressure visibility expanded)
- 5. Reliability and Runtime Rules -> 5. Reliability and Runtime Rules (burst handling and no-interruption guarantees expanded)
- 8. Testing Standards -> 8. Testing Standards (burst-drain and non-interruption coverage expanded)
- 9. Observability and Logging -> 9. Observability and Logging (queue backlog visibility expanded)
- Practical Checklist -> Practical Checklist (burst-load validation added)
Added sections:
- None
Removed sections:
- None
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ⚠ pending .specify/templates/constitution-template.md (left generic by design)
Follow-up TODOs:
- None
-->

# TTV Twitch ElevenLabs Constitution

## 1. Purpose

This repository defines a Windows-first local Node.js and Express application that
receives Twitch-related events, coordinates ElevenLabs text-to-speech generation,
accepts Streamer.bot input, drives OBS-facing outcomes, and plays audio through a
dedicated local player such as VLC or mpv. The project MUST optimize for stable
live-stream behavior, maintainable code ownership, and clear operational recovery.
Work that improves novelty at the expense of predictable runtime behavior MUST NOT
be prioritized. Rationale: this software runs in a live environment where failure
is visible immediately and recovery time matters more than feature breadth.

The system MUST accept supported Twitch or adjacent stream events, render alert
text from deterministic templates, generate audio through ElevenLabs, persist the
audio locally, enqueue playback jobs, and play them through a dedicated process so
OBS can capture the application audio separately. The project MUST remain usable as
an operator-controlled local HTTP service with configuration provided through `.env`.

The following items are explicitly out of scope unless a later feature spec says
otherwise: a hosted SaaS control plane, multi-tenant account management, remote
administration by default, generic chatbot functionality unrelated to alerts,
browser-based audio playback as the primary runtime path, and any architecture that
depends on OBS plugins when a local player process can satisfy the requirement.

## 2. Product Principles

- The application MUST remain local-first. Core functionality MUST continue to work
  without any cloud control plane other than explicitly configured third-party APIs
  such as ElevenLabs or Twitch.
- The primary operator is a streamer on Windows. User flows MUST favor direct local
  execution, readable logs, recoverable failures, and minimal setup friction.
- Stability MUST take precedence over feature count. A smaller feature set with
  predictable live behavior is preferable to a broader feature set with unstable
  timing, hidden retries, or unclear failure modes.
- Runtime behavior MUST be predictable. The same validated input and configuration
  SHOULD produce the same text rendering, queue behavior, and playback decision.
- Low end-to-end alert latency SHOULD be preserved. New work MUST NOT introduce
  avoidable queue delay, blocking I/O on the hot path, or heavy startup overhead
  without a documented reason.
- The product MUST treat Twitch alerts, Streamer.bot events, TTS generation, audio
  playback, and OBS-facing outputs as composable capabilities rather than one large
  opaque workflow.
- Features SHOULD reduce operator burden during live use. If a feature adds runtime
  choices, it MUST also define safe defaults and a fallback path.
- Local operator control MUST be favored over opaque automation. The operator MUST
  be able to understand what the service is doing, what is queued, what failed, and
  how to recover without reverse-engineering the implementation.
- New integrations MUST preserve the existing operator mental model instead of
  introducing hidden state transitions or undiscoverable automation.

## 3. Engineering Principles

- The codebase MUST use modular boundaries with explicit roles for HTTP transport,
  domain logic, integration adapters, runtime orchestration, and configuration.
- Single Responsibility is mandatory. Routes, template rendering, TTS generation,
  queue orchestration, playback execution, logging, and configuration parsing MUST
  remain separate concerns with explicit interfaces.
- Each external integration MUST be isolated behind a narrow interface so Twitch,
  ElevenLabs, OBS, Streamer.bot, VLC, or mpv can be tested and replaced without
  rewriting unrelated logic.
- The alert-text rendering layer MUST be independent from TTS and playback so text
  changes can be validated without requiring live API calls or player execution.
- Queue management MUST be implemented as a dedicated component with explicit state,
  ordering rules, and failure handling rather than implicit shared arrays spread
  across handlers or services.
- The queue component MUST model admission, pending, active, completed, failed,
  and discarded states explicitly, and it MUST prevent a later alert from
  interrupting an already active alert unless a future spec defines an operator-
  initiated cancellation path.
- Logging MUST be injected or centrally exposed through a consistent interface. Code
  MUST NOT write ad hoc console output across unrelated modules.
- Shared workflows MUST be modeled as deterministic services with explicit inputs,
  outputs, and failure handling. Hidden cross-module mutation MUST NOT be used.
- Simplicity is mandatory. New abstractions MUST solve a current problem in this
  repository and MUST NOT be introduced for speculative reuse.
- Changes touching live runtime paths SHOULD prefer additive evolution over broad
  rewrites unless the rewrite removes a proven source of instability.
- Configurability MUST be preferred over hardcoding for voice IDs, player commands,
  output paths, queue limits, retry counts, and local service settings.
- Error behavior MUST be deterministic. Equivalent failure conditions SHOULD lead to
  the same error category, log record, and recovery path.

## 4. API Design Rules

- The local HTTP service MUST expose explicit, versionable routes with request and
  response shapes documented in the feature spec or contract artifacts.
- JSON request and response bodies MUST use consistent envelopes for success and
  failure states, including stable keys for status, data, error code, and message.
- Every endpoint MUST validate inputs at the boundary and return predictable error
  bodies for operator-facing and integration-facing failures.
- Error responses MUST use documented machine-readable codes. Human-readable text
  alone is insufficient for automation and supportability.
- API handlers MUST stay thin. Transport code MUST delegate orchestration and domain
  decisions to services instead of embedding workflow logic inside Express routes.
- Incoming requests from local automation tools MUST be treated as untrusted input.
  Validation, coercion, and rejection paths MUST be explicit.
- Validation failures MUST be reported explicitly. The service MUST NOT coerce bad
  payloads silently into partial or guessed behavior.
- Endpoint behavior MUST be idempotent when duplicate events are realistically
  expected from upstream systems or local retry flows.
- The service MUST expose a health endpoint suitable for startup and readiness
  checks, and SHOULD expose a queue-status endpoint that reveals queue depth,
  playback state, and the oldest pending job age without leaking secrets.
- If a route admits work into the alert queue, it MUST define whether the request
  was accepted, rejected, deferred, or rate-limited, and it MUST document any
  queue-capacity or backpressure behavior visible to callers.
- API versioning MUST be possible without route churn across the entire service.
  If the public contract changes incompatibly, a version boundary MUST be defined.
- No API path may fail silently. If work is rejected, deferred, retried, or dropped,
  the response and log trail MUST state which outcome occurred.

## 5. Reliability and Runtime Rules

- Runtime-critical paths MUST define timeout, retry, and failure behavior for each
  external dependency they invoke.
- Alert queue execution MUST preserve externally visible order. Once an alert job
  becomes active, later alerts MUST wait until that job completes, fails, or hits
  its own documented timeout; they MUST NOT preempt or cancel it implicitly.
- Queue-backed features MUST define how the system behaves when several hundred
  alert requests arrive in a short interval, including admission policy, memory or
  storage expectations, backlog visibility, and any bounded backpressure behavior.
- The playback queue MUST NOT block on a single failed TTS request, file-system
  error, or player invocation. Failed jobs MUST transition to a terminal state and
  allow subsequent jobs to continue unless a documented global safety stop applies.
- ElevenLabs errors MUST NOT crash the process. They MUST be isolated to the
  affected request or job, logged with context, and surfaced through a defined
  failure response or queue state.
- Playback failures MUST be isolated from HTTP availability. A player crash or bad
  audio file MUST NOT take down the local API service.
- The system MUST fail visibly and recover predictably. Silent drops, swallowed
  promise rejections, and background failures without logs MUST NOT be merged.
- Long-running processes MUST support clean startup, shutdown, and restart without
  requiring manual cleanup of hidden temp state when avoidable.
- External requests MUST use explicit timeouts. Infinite waits for ElevenLabs,
  Twitch-adjacent services, or child-process completion MUST NOT exist.
- Retry rules MUST be explicit and bounded. Retries SHOULD apply only to transient
  failures, MUST record each attempt, and MUST NOT duplicate playback side effects.
- Startup MUST validate configuration before accepting traffic. Missing or invalid
  `.env` values, inaccessible output directories, and missing player binaries MUST
  fail fast with actionable diagnostics.
- Graceful shutdown MUST stop new intake, preserve or explicitly discard queue state
  according to documented policy, and clean up child processes and open handles.
- Audio playback orchestration MUST account for missing binaries, locked files,
  stale child processes, and concurrent playback conflicts.
- Features that change alert sequencing or playback timing MUST document expected
  behavior under burst traffic, duplicate events, and partial dependency outages.

## 6. Security and Privacy Rules

- Secrets MUST be sourced from environment configuration and MUST NOT be committed,
  logged, echoed in error messages, or copied into example config with real values.
- The service MUST bind locally by default unless a change explicitly justifies a
  broader network surface and adds compensating controls.
- Local endpoints SHOULD implement request-size and request-rate limits suitable for
  the expected local automation traffic so accidental loops or local abuse do not
  destabilize the process.
- Only the minimum data required to process an event MAY be stored or logged.
  Sensitive payload content SHOULD be redacted when full fidelity is not required.
- Any feature that accepts local HTTP input MUST document its trust boundary,
  authentication assumptions, and abuse considerations.
- Temporary audio files and cached TTS outputs MUST have a defined lifecycle.
  Persistent retention MUST be an explicit decision, not an accident.
- Audio outputs SHOULD support optional automatic deletion once playback and any
  required debugging window are complete.
- Personally identifying event data MUST be minimized in storage and logs. Usernames
  SHOULD be retained only when required for rendering, debugging, or auditing.
- The project MUST use only voices and voice IDs for which the operator has verified
  authorization. Unverified or scraped voice assets MUST NOT be supported.

## 7. Coding Standards

- Production code MUST be written in a consistent Node.js style aligned with the
  repository toolchain and linter configuration.
- TypeScript SHOULD be preferred when introduced, or structured runtime validation
  MUST provide equivalent shape guarantees if the repository remains JavaScript.
- Functions and modules MUST have names that reflect domain intent. Ambiguous names
  such as helper, util, misc, temp, or manager SHOULD NOT be introduced without a
  precise domain qualifier.
- Files MUST stay focused on one primary responsibility. If a file coordinates HTTP,
  playback, ElevenLabs, and config at once, it MUST be split.
- Error handling MUST preserve actionable context while avoiding secret leakage.
- Constants MUST replace magic numbers for retry counts, timeout values, queue
  limits, polling intervals, and default filesystem behavior.
- Naming conventions for files, functions, event types, and env variables MUST stay
  consistent across the repository.
- Comments SHOULD explain non-obvious operational reasoning, not restate code.

## 8. Testing Standards

- Behavior-changing code MUST include automated tests unless the change is purely
  documentation, wiring with no behavior shift, or the repository owner approves a
  narrowly scoped exception.
- Unit tests MUST cover template rendering, payload validation, queue logic, config
  parsing, and failure-path branching that can be exercised without real external
  services.
- Integration tests MUST cover local HTTP endpoints and orchestration boundaries for
  Twitch-facing input, Streamer.bot input, ElevenLabs interaction seams, and audio
  player invocation seams whenever the change affects them.
- External ElevenLabs requests MUST be mocked in automated tests unless a test is
  explicitly marked as manual or live-integration verification.
- Queue tests MUST verify ordering, duplicate-event handling when applicable, and
  non-blocking behavior after job failure.
- Queue tests MUST verify burst handling for several hundred queued requests,
  including sustained FIFO drain behavior and proof that one alert cannot interrupt
  or cancel another during active processing.
- Startup behavior MUST include a smoke test for configuration validation so bad
  runtime configuration is caught before live use.
- Manual runtime verification on Windows MUST be documented for changes that affect
  playback, process management, OBS coordination, or live alert flow timing.
- Tests MUST assert observable outcomes, not internal implementation trivia.

## 9. Observability and Logging

- Structured logs MUST exist for application startup, configuration validation,
  inbound events, outbound integration calls, playback execution, retries, and
  terminal failure states.
- Each inbound request or queued alert job MUST receive a correlation identifier or
  job ID that remains traceable across HTTP receipt, rendering, TTS generation,
  file handling, queueing, and playback.
- Log levels MUST be meaningful. Expected operator noise belongs at debug or info;
  actionable failures belong at warn or error.
- Metrics or counters SHOULD be added for repeated or stateful workflows when they
  improve diagnosis of queue depth, failure rates, or latency regressions.
- Queue state MUST be observable. Operators SHOULD be able to inspect queue length,
  active job, wait time, and recent failures from logs or status endpoints.
- Observability for queued workflows MUST include queue admissions, backlog growth,
  active-job duration, and any rejected or discarded alerts so burst behavior can
  be diagnosed without replaying a live stream.
- Important metrics SHOULD include TTS duration, queue wait time, playback duration,
  end-to-end alert latency, retry count, and failure rate by dependency.
- Logging MUST NOT expose secrets, full tokens, or unnecessary personal data.

## 10. Dependency Rules

- New dependencies MUST provide clear value that outweighs operational and security
  cost. Existing platform or ecosystem capabilities SHOULD be preferred first.
- Dependencies that wrap critical runtime behavior such as process control, HTTP,
  schema validation, or logging MUST be maintained, well understood, and actively
  supported.
- More than one library for the same core concern MUST NOT be introduced without a
  concrete migration or coexistence rationale.
- Player-specific integrations for VLC or mpv MUST be encapsulated so the rest of
  the system does not depend on binary-specific command syntax.
- Dependency upgrades MUST note breaking changes and MUST be validated against the
  repository’s local runtime flows.

## 11. File and Project Structure

- Source files MUST live under a predictable structure that separates config,
  transport, services, integrations, playback, and shared domain types.
- The repository SHOULD separate `routes`, `services`, `adapters`, `utils`, and
  `config` explicitly. Queue and playback components SHOULD have dedicated folders
  or modules rather than being buried inside generic utilities.
- Tests MUST mirror production structure closely enough that owners can discover
  related coverage without guesswork.
- Configuration schema, environment parsing, and defaults MUST be centralized.
  Ad hoc `process.env` reads scattered through runtime code MUST NOT be introduced.
- Scripts, fixtures, and sample payloads MUST be named for their operational role.
  Throwaway filenames MUST NOT remain in the repository.
- Feature work MUST update repository structure documentation when it introduces a
  new top-level module or runtime directory.
- Output and log directories MUST be clearly defined and MUST distinguish durable
  artifacts from temporary audio cache or transient playback files.

## 12. Operational Rules

- Every runtime-affecting change MUST document how to start, stop, validate, and
  recover the affected workflow locally on Windows.
- Local development MUST be simple to start with a documented install, `.env`
  setup, and one primary command for running the service.
- `.env` changes MUST include schema updates, safe defaults where appropriate, and
  operator-facing documentation for new required variables.
- Sensible defaults SHOULD exist for optional features so the operator can start the
  service without configuring every integration on day one.
- Child-process execution for VLC, mpv, or adjacent tooling MUST define invocation,
  timeout, exit-code handling, and cleanup behavior.
- The local HTTP service MUST provide a practical way to verify readiness and MUST
  surface startup failures before the operator goes live.
- Emergency fallback behavior MUST be documented for critical integrations so the
  operator can degrade gracefully during a live session.
- README documentation MUST cover setup, required and optional `.env` variables,
  supported event flow, player prerequisites, start procedure, and basic failure
  diagnosis steps.
- Common failure pictures SHOULD be documented, including missing player binary,
  invalid ElevenLabs key, unwritable output directory, malformed local payload, and
  stalled playback process.

## 13. Change Management

- All feature specs, plans, and tasks MUST be checked against this constitution
  before implementation begins and again before completion is declared.
- Changes that alter public routes, event payload expectations, environment schema,
  player behavior, or external adapter contracts MUST call out compatibility impact.
- Breaking governance or architecture changes MUST increment this constitution using
  semantic versioning: MAJOR for incompatible rule changes, MINOR for new sections
  or materially expanded obligations, PATCH for clarifications only.
- Amendments MUST update dependent templates in `.specify/templates/` when those
  templates would otherwise steer future work out of compliance.
- Breaking changes MUST be documented wherever they affect API contracts, queue
  behavior, playback behavior, configuration schema, or operator workflow.
- Changes to API design, queue semantics, or playback orchestration MUST include a
  short rationale in the feature plan or architecture notes.
- Architecture decisions SHOULD be captured briefly when they alter module
  boundaries, dependency choices, or runtime guarantees.

### Governance

- This constitution is authoritative over ad hoc local practices and older planning
  notes.
- Compliance review MUST happen in spec review, plan review, and code review.
- Any exception MUST be documented with scope, rationale, risk, and rollback plan.
- Undocumented exceptions MUST NOT become precedent.

## 14. Definition of Done

- A change is done only when code, configuration, tests, and docs are consistent.
- Required automated tests MUST pass, and required Windows runtime validation MUST
  be performed or explicitly deferred with owner approval.
- New or changed configuration MUST be reflected in examples, schema validation,
  and operational instructions.
- Logs and error paths for the new behavior MUST be verified as useful.
- Error handling, queue effects, and playback consequences MUST be accounted for in
  code review and validation, not treated as follow-up cleanups.
- No known critical regression in alert flow, playback flow, or local startup may
  remain open at merge time.

## 15. Anti-Patterns

- Business logic MUST NOT live in Express routes.
- The project MUST NOT accumulate god services that mix Express handlers, adapter
  calls, process spawning, and business rules in one file.
- Direct external API calls across the codebase MUST NOT bypass the relevant
  integration adapter.
- Uncontrolled parallel playback MUST NOT be allowed.
- The project MUST NOT rely on best-effort timing hacks where explicit queueing,
  acknowledgement, or process-state checks are required.
- The project MUST NOT introduce direct, repeated `process.env` lookups inside deep
  runtime logic.
- Voice IDs, API keys, output paths, and player command paths MUST NOT be hardcoded
  in runtime logic.
- The project MUST NOT log secrets, swallow errors, or continue after critical
  startup validation fails.
- Silent `catch` blocks and unstructured logging MUST NOT be merged.
- The project MUST NOT couple feature behavior to a specific media player binary in
  modules that are not responsible for playback.
- The project MUST NOT merge integration changes without at least one realistic
  failure-path test or documented runtime verification step.

## Practical Checklist

- Define the module boundary and identify which adapter or service owns the change.
- Validate request payloads, environment variables, and external process inputs at
  the boundary.
- Add or update structured logs and correlation fields for the new workflow.
- Confirm health and queue visibility still exist and match the changed behavior.
- Add automated tests for changed behavior and document Windows runtime checks when
  playback or live orchestration is affected.
- Validate burst-load queue behavior, including several-hundred-request backlogs
  and non-preemptive alert execution, whenever queue admission or playback timing
  logic changes.
- Update `.env` documentation, route contracts, and operator run instructions when
  configuration or runtime behavior changes.
- Verify retry, timeout, graceful shutdown, and queue-failure behavior for any
  touched external dependency or playback path.
- Confirm failure handling for Twitch, ElevenLabs, Streamer.bot, OBS, VLC, and mpv
  touchpoints that the change can affect.
- Check that no hardcoded voice IDs, API keys, player paths, or magic runtime
  numbers were introduced.
- Verify the change keeps the service local-first, operator-friendly, and modular.

**Version**: 1.1.0 | **Ratified**: 2026-04-17 | **Last Amended**: 2026-04-17

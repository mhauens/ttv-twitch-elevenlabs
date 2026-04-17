# Research: Burst-Safe Alert Queue

## Decision: Use TypeScript 5.x on Node.js 22 LTS with Express 5

**Rationale**: The constitution already defines the product as a Windows-first local Node.js and Express service. TypeScript adds stronger interface and state guarantees for queue state transitions, restart recovery, and contract alignment without changing the local-service architecture.

**Alternatives considered**:

- Plain JavaScript on Node.js: rejected because queue-state and recovery logic benefit from stronger compile-time shape checks.
- Fastify: rejected because the constitution and existing product framing already center Express and there is no existing runtime pressure requiring a framework shift.

## Decision: Persist deferred overflow and recovery metadata in SQLite

**Rationale**: SQLite provides ordered durable storage, atomic writes, indexed reads for queue-status queries, and no additional service dependency. That fits a single-operator Windows deployment better than introducing Redis or a hosted queue.

**Alternatives considered**:

- JSONL or flat-file append logs: rejected because ordering, cleanup, and crash-safe updates become harder to reason about once deferred overflow and recovery-failure records must be queried reliably.
- Redis or another external queue: rejected because the product is local-first and should not depend on a second runtime process for durable backlog.

## Decision: Implement a custom single-consumer queue coordinator

**Rationale**: The feature requires explicit state transitions, restored backlog priority rules, non-preemptive execution, and a specific recovery contract for interrupted active alerts. A small dedicated coordinator service keeps those rules visible and testable.

**Alternatives considered**:

- Generic queue libraries: rejected because they hide recovery and promotion behavior behind abstractions that do not map cleanly to the spec’s restart and deferred-overflow rules.
- Multiple worker consumers: rejected because the constitution requires one alert at a time and forbids overlapping playback.

## Decision: Use Zod for boundary validation and Pino for structured logs

**Rationale**: The queue feature depends on strict intake validation, deterministic `.env` validation, and machine-readable logs with correlation IDs. Zod and Pino are small, established libraries that fit that need without excessive framework coupling.

**Alternatives considered**:

- Manual validation: rejected because it spreads schema logic and increases the chance of inconsistent rejection behavior.
- Winston or console-based logging: rejected because correlation-friendly structured logging matters more than broad transport flexibility here.

## Decision: Mark interrupted active alerts as recovery failures instead of replaying them

**Rationale**: After an unexpected termination, the system cannot know whether playback or generation side effects were partially visible. Marking the active alert as failed avoids duplicate replay and gives the operator a deterministic recovery story.

**Alternatives considered**:

- Replay the interrupted alert automatically: rejected because it risks duplicate stream-visible playback.
- Require manual operator action before backlog recovery: rejected because the clarified spec requires automatic restoration of deferred overflow.

## Decision: Drain restored deferred backlog ahead of new post-restart arrivals

**Rationale**: The system already accepted the deferred work earlier. Prioritizing restored backlog preserves the strongest possible end-to-end order guarantee across restart boundaries.

**Alternatives considered**:

- Let new arrivals jump the queue: rejected because it breaks preserved ordering for previously accepted alerts.
- Interleave restored and new arrivals: rejected because it adds fairness complexity without improving operator predictability.

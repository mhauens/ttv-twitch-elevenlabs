# Research: Combined Status Stream

## Decision: Build the realtime stream by polling `QueueStatusService`

**Rationale**: The repository already has one service that aggregates the operator-visible queue and health snapshots. Polling that service every 500 ms keeps the realtime feature read-only, avoids introducing a second internal state flow, and does not require invasive changes to queue admission, orchestration, recovery, or playback code.

**Alternatives considered**:

- Event wiring from `AlertOrchestrator`, `QueueAdmissionService`, and `QueueRecoveryService`: rejected because it would scatter status responsibilities across multiple modules and increase the risk of queue-invariant regressions.
- Per-route snapshot generation on every transport connection without a shared polling service: rejected because it would duplicate comparison logic and make transport behavior inconsistent.

## Decision: Introduce one dedicated `StatusStreamService` as the shared internal source for SSE and WebSocket

**Rationale**: Both transports need the same combined payload, the same change-detection rules, and the same shutdown behavior. One dedicated service can own subscriber registration, snapshot caching, change detection, stream sequencing, and keepalive scheduling while keeping routes and socket handlers thin.

**Alternatives considered**:

- Put SSE logic directly into a route and duplicate similar logic later for WebSocket: rejected because it would create two transport-specific implementations of the same business rules.
- Extend `QueueStatusService` with subscriber and timer management: rejected because that service currently models pull snapshots only and should stay focused on aggregation rather than transport lifecycle.

## Decision: Compare only semantic queue and health content when deciding whether to broadcast

**Rationale**: The feature requires `emittedAt` and `streamSequence` to change on send, but those transport fields must not themselves trigger a new broadcast. Comparing only the existing queue and health snapshot content ensures the service emits updates only when the operator-visible status has actually changed.

`queue.lastUpdatedAt` is treated as refresh metadata rather than a standalone broadcast trigger, so timestamp-only churn does not create duplicate stream traffic when the rest of the queue and health content is unchanged.

**Alternatives considered**:

- Compare the full serialized combined snapshot: rejected because `emittedAt` would differ on every poll and force duplicate broadcasts.
- Broadcast on every poll interval: rejected because it would generate avoidable network noise and provide no additional operator value.

## Decision: Keep the public HTTP contract scoped to SSE and document WebSocket separately

**Rationale**: SSE is an HTTP endpoint and belongs in the OpenAPI contract alongside `/api/v1/alerts`, `/api/v1/queue`, and `/api/v1/health`. The WebSocket transport is still part of the public runtime contract, but documenting it separately avoids overloading the HTTP-only contract and matches the feature requirement that OpenAPI remain scoped to HTTP and SSE.

**Alternatives considered**:

- Model WebSocket in the same OpenAPI file: rejected because the repository currently uses OpenAPI for HTTP routes, not socket lifecycle semantics.
- Skip a written WebSocket contract until implementation starts: rejected because the transport semantics are part of the feature scope and need design-time documentation.

## Decision: Reuse the existing Node HTTP server as the WebSocket carrier

**Rationale**: `createApplication().start()` already creates and owns the Node HTTP server. Attaching the Phase 2 WebSocket server there keeps startup and shutdown ordering explicit, avoids a second listening port, and makes it straightforward to stop accepting new socket clients during application shutdown.

**Alternatives considered**:

- Start a separate WebSocket server on another port: rejected because it would add configuration and operational surface without improving the operator workflow.
- Hide WebSocket ownership inside a route module: rejected because Express routes do not own the underlying HTTP upgrade lifecycle.

## Decision: Stop the stream service before disposing queue resources

**Rationale**: Long-lived SSE and WebSocket subscribers can outlast ordinary request lifecycles. Stopping the stream service first prevents polling against resources that are already shutting down and lets the application close subscribers cleanly before `OverflowStore` and orchestrator shutdown begin.

**Alternatives considered**:

- Let `server.close()` implicitly end the stream after queue resources start shutting down: rejected because existing long-lived connections may stay open long enough to observe partially disposed state.
- Dispose queue resources first and rely on subscriber errors: rejected because it would create noisy shutdown behavior and weaker operator visibility.

## Decision: Add focused unit, integration, and contract coverage around streaming behavior

**Rationale**: The highest-risk logic is the combined snapshot diffing, connection lifecycle, and transport framing rather than the queue internals themselves. Unit tests can verify sequence and change detection, integration tests can verify end-to-end streaming against the application harness, and contract tests can keep OpenAPI and route behavior aligned.

**Alternatives considered**:

- Rely only on manual streaming checks: rejected because keepalive, reconnect, and changed-only broadcast behavior are deterministic enough to automate.
- Test only the route formatting and skip service-level tests: rejected because the change-detection rules are the core business behavior of the feature.

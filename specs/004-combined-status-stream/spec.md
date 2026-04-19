# Feature Specification: Combined Status Stream

**Feature Branch**: `[004-combined-status-stream]`  
**Created**: 2026-04-19  
**Status**: Draft  
**Input**: User description: "Plan: Kombinierter Statusstream mit SSE zuerst, WebSocket danach"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Subscribe To Live Status Over SSE (Priority: P1)

As an operator, I want a live combined status stream over SSE so that I can see queue and health changes without repeatedly polling the service.

**Why this priority**: SSE is the first deliverable in the plan and provides immediate operator value by exposing a realtime combined view while preserving the existing pull endpoints.

**Independent Test**: Open the SSE status stream, verify that an initial combined snapshot arrives immediately, then change queue or health state and verify that only changed snapshots are emitted.

**Acceptance Scenarios**:

1. **Given** the service is running and the combined status stream is available, **When** an operator subscribes to the SSE endpoint, **Then** the operator receives an immediate snapshot containing the current queue and health state.
2. **Given** the operator remains connected and the combined status does not change, **When** time passes, **Then** the stream stays open and sends only periodic keepalive traffic without repeating the same snapshot.
3. **Given** queue or health state changes while the operator is connected, **When** the next status update is emitted, **Then** the operator receives a new combined snapshot that reflects the updated state.

---

### User Story 2 - Receive The Same Status Over WebSocket (Priority: P2)

As an operator, I want the same combined status view over WebSocket so that I can consume realtime status in clients that are better suited to a socket connection.

**Why this priority**: WebSocket is the second phase of the plan and must reuse the same combined snapshot behavior so the two transports stay consistent.

**Independent Test**: Connect to the WebSocket status endpoint, verify that the first message is the current combined snapshot, then change queue or health state and verify that follow-up messages arrive only when the status changes.

**Acceptance Scenarios**:

1. **Given** the WebSocket status endpoint is available, **When** a client connects, **Then** the client receives the current combined snapshot as the first message.
2. **Given** the client remains connected and the combined status changes, **When** the service emits an update, **Then** the client receives the same combined snapshot structure through the socket.
3. **Given** the client sends messages to the WebSocket endpoint, **When** the service processes the connection, **Then** the client messages do not alter the server contract or change the combined status payload.

---

### User Story 3 - Keep Existing Pull Status Behavior Stable (Priority: P3)

As an operator, I want the existing queue and health pull endpoints to stay unchanged so that realtime status can be added without breaking current dashboards, scripts, or monitoring checks.

**Why this priority**: The new stream must be additive. Existing pull-based workflows remain the canonical source of queue and health data and must not regress.

**Independent Test**: Compare the existing queue and health endpoints before and after enabling the realtime status feature and verify that their responses and readiness meaning remain unchanged.

**Acceptance Scenarios**:

1. **Given** an operator continues to call the existing queue endpoint, **When** the feature is enabled, **Then** the response remains the documented queue snapshot and is not wrapped by the realtime stream format.
2. **Given** an operator continues to call the existing health endpoint, **When** the feature is enabled, **Then** the response remains the documented health snapshot and is not changed by the new realtime transports.
3. **Given** the service shuts down while status subscribers are connected, **When** the application stops, **Then** open realtime connections are closed cleanly and the existing pull endpoints remain unaffected for the next start.

**Operational Context**: The operator runs the service locally and uses the status stream to observe queue depth, active work, readiness, and recovery state during live operation. A visible success is a current snapshot arriving right after subscription and subsequent updates appearing only when the combined status changes. A visible failure is stale status that never updates, duplicate updates when nothing changed, connections that remain open after shutdown, or any change to the existing queue and health pull responses.

### Edge Cases

- A client connects while no alert is active and the service is ready or not ready.
- Queue state changes while the subscriber is already connected.
- Health changes because recovery or persistence status changes while the subscriber is already connected.
- A snapshot refresh fails temporarily while the connection is still open.
- A client reconnects after disconnecting and should receive the current status again instead of historical status replay.
- Several subscribers connect at the same time and must all see the same current combined snapshot behavior.
- The service shuts down while SSE or WebSocket subscribers are still connected.
- A WebSocket client sends data to the server even though the contract is server-push only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single combined status snapshot that includes the existing queue snapshot, the existing health snapshot, a monotonic stream sequence for the current process run, and the snapshot emission timestamp.
- **FR-002**: System MUST expose `GET /api/v1/status/stream` as a Server-Sent Events endpoint that immediately delivers the current combined status snapshot when a client subscribes.
- **FR-003**: System MUST emit additional SSE `snapshot` events only when the combined status changes in user-visible content.
- **FR-004**: System MUST send periodic SSE keepalive comments at least every 15 seconds while a client remains connected and no new snapshot is emitted.
- **FR-005**: System MUST set each SSE event id to the stream sequence and MUST deliver the current combined status again on reconnect without replaying prior stream history.
- **FR-006**: System MUST expose `/api/v1/status/ws` as a WebSocket transport that sends the current combined status snapshot immediately after connection and then sends further snapshots only when the combined status changes.
- **FR-007**: System MUST ignore client-originated WebSocket messages and MUST not treat them as part of the public contract.
- **FR-008**: System MUST send periodic server-side WebSocket keepalive traffic at least every 30 seconds and clean up dead socket connections.
- **FR-009**: System MUST preserve the existing `GET /api/v1/queue` and `GET /api/v1/health` pull endpoints unchanged and continue to treat them as the canonical snapshot sources.
- **FR-010**: System MUST keep the realtime status feature additive and MUST not change alert intake behavior, queue admission behavior, recovery behavior, or playback behavior.
- **FR-011**: System MUST start the status stream service when the application starts and MUST stop it cleanly when the application shuts down, closing open subscribers.
- **FR-012**: System MUST tolerate temporary failures while building or refreshing the combined snapshot by logging the failure and resuming delivery when the next successful snapshot is available.
- **FR-013**: System MUST document the SSE status stream in the public API contract and in runtime guidance, including an example client for subscribing to updates.
- **FR-014**: System MUST document the WebSocket status transport in runtime guidance once the second phase is enabled, while keeping the public HTTP contract scoped to HTTP and SSE.
- **FR-015**: System MUST provide only one combined realtime status stream and MUST NOT introduce separate queue-only or health-only realtime stream routes in this feature.

### External Interfaces & Runtime Contracts

- The existing pull endpoints `GET /api/v1/queue` and `GET /api/v1/health` remain the authoritative snapshot sources for queue and health state.
- `GET /api/v1/status/stream` delivers the combined status as SSE, with an initial `snapshot` event followed by later `snapshot` events when the combined state changes.
- `GET /api/v1/status/ws` delivers the same combined status as raw JSON messages over a WebSocket connection.
- The combined status payload contains the existing queue snapshot and health snapshot plus `streamSequence` and `emittedAt`.
- The stream does not provide historical replay, so reconnecting clients receive the current snapshot rather than old status history.
- Keepalive traffic is transport-level only and does not change the meaning of the queue or health snapshots.
- The realtime stream must remain additive and must not alter request or response envelopes for the existing alert intake or status pull endpoints.
- Shutdown behavior must close open subscribers cleanly so that the service can restart without leaving stale status connections behind.

### Key Entities *(include if feature involves data)*

- **Combined Status Snapshot**: The shared realtime payload that bundles queue state, health state, a stream sequence, and an emission timestamp.
- **Status Stream Subscription**: A connected SSE or WebSocket client that receives the combined snapshot and later updates.
- **Snapshot Change**: A user-visible difference in queue or health state that justifies broadcasting a new combined snapshot.
- **Transport Session**: The live connection lifecycle for a subscriber, including connect, keepalive, update delivery, and shutdown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In validation testing, an operator sees the current combined queue and health state within 5 seconds of subscribing in at least 95% of successful connections.
- **SC-002**: In a 10-minute idle test, connected subscribers receive keepalive traffic but no duplicate snapshot content when queue and health state do not change.
- **SC-003**: In 100% of validation runs where queue or health state changes, the next emitted status update reflects the new combined state.
- **SC-004**: Regression validation shows that the existing queue and health pull endpoints continue to return their documented responses unchanged while the realtime stream is enabled.
- **SC-005**: In shutdown validation, all open status connections close cleanly in 100% of runs and no client remains connected after the service stops.
- **SC-006**: When the WebSocket phase is enabled, an operator can connect and receive the current combined status as the first message without sending a setup message in at least 95% of test runs.

## Assumptions

- The realtime status feature is local-only and does not add a new authentication model.
- The existing queue and health pull endpoints remain the source of truth for status data.
- The stream is combined rather than split into separate queue-only or health-only realtime feeds.
- The first phase delivers SSE before the WebSocket transport is added.
- The feature does not add a replay buffer or historical status archive.
- The feature does not change queue admission, recovery, or playback semantics.

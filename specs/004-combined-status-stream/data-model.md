# Data Model: Combined Status Stream

## Entity: Combined Status Snapshot

**Purpose**: Represents the operator-visible payload shared by the SSE and WebSocket transports.

**Fields**:

- `streamSequence`: monotonically increasing integer for the current process run
- `emittedAt`: ISO 8601 timestamp for when this combined snapshot was sent
- `queue`: the existing `QueueSnapshot`
- `health`: the existing `HealthSnapshot`

**Validation rules**:

- `queue` and `health` must preserve their existing field shapes and meanings.
- `streamSequence` must increase only when a semantic status change is actually broadcast.
- `emittedAt` is the send time of the combined snapshot and must not replace `queue.lastUpdatedAt`.
- New subscribers must receive the latest available `CombinedStatusSnapshot` immediately after connection.

## Entity: Comparable Status State

**Purpose**: Represents the semantic content used for change detection before transport metadata is added.

**Fields**:

- `queue`: the existing `QueueSnapshot`
- `health`: the existing `HealthSnapshot`

**Validation rules**:

- Equality checks for broadcast decisions must ignore `streamSequence` and `emittedAt`.
- Changes in queue depth, active work, recent failures, recent rejections, or health readiness create a new comparable state.
- A refresh that changes only `queue.lastUpdatedAt` without any other queue or health change does not create a new comparable state.
- Transport keepalives must not mutate comparable state.

## Entity: Status Stream Runtime State

**Purpose**: Represents the internal state held by the stream service for polling and broadcast coordination.

**Fields**:

- `pollIntervalMs`: fixed at `500`
- `lifecycleState`: `idle`, `running`, `stopping`, or `stopped`
- `latestSnapshot`: last successful `CombinedStatusSnapshot`, if available
- `lastComparableState`: last comparable queue and health content that was broadcast
- `nextSequenceNumber`: next sequence value to assign on a new broadcast
- `lastRefreshError`: last temporary snapshot refresh failure, if any

**Validation rules**:

- The first successful refresh seeds `latestSnapshot` so a new subscriber can receive an immediate snapshot.
- A temporary refresh failure must not clear the previous successful snapshot.
- Application startup may move the service into `running` before any subscriber exists, but polling begins only while at least one subscriber is connected.
- `lifecycleState=stopping` or `stopped` prevents further broadcasts and begins subscriber cleanup.

**State transitions**:

- `idle` → `running` when the status stream service starts
- `running` → `stopping` when application shutdown begins
- `stopping` → `stopped` after timers and open subscribers are closed

## Entity: Status Subscriber

**Purpose**: Represents one connected client receiving combined status updates over SSE or WebSocket.

**Fields**:

- `subscriberId`: unique in-process identifier
- `transport`: `sse` or `ws`
- `connectedAt`: timestamp when the subscriber became active
- `lastDeliveredSequence`: most recent `streamSequence` delivered to the subscriber, if any
- `keepaliveIntervalSeconds`: `15` for SSE or `30` for WebSocket
- `connectionState`: `active`, `closing`, or `closed`

**Validation rules**:

- Each subscriber belongs to exactly one transport.
- A new subscriber receives the latest available snapshot before change-only broadcast logic resumes.
- Client-originated WebSocket messages do not modify subscriber state beyond ordinary connection liveness.

**State transitions**:

- `active` → `closing` when disconnect or shutdown cleanup begins
- `closing` → `closed` after transport resources are released

## Relationships

- One `Status Stream Runtime State` manages many `Status Subscriber` records.
- One `Combined Status Snapshot` may be delivered to many active subscribers.
- One `Comparable Status State` corresponds to one `Combined Status Snapshot` before transport metadata is added.
- A `Status Subscriber` may receive multiple `Combined Status Snapshot` deliveries over its connection lifetime.

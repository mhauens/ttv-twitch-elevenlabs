# Data Model: Burst-Safe Alert Queue

## Entity: Alert Request

**Purpose**: Represents the validated inbound alert payload received from local automation or Twitch-adjacent integrations before queue admission.

**Fields**:

- `requestId`: unique identifier for the inbound request
- `correlationId`: stable identifier used across logs and queue transitions
- `source`: origin of the alert, such as `local`, `twitch`, `streamerbot`, or `mixitup`
- `dedupeKey`: optional upstream-derived key used for duplicate handling
- `receivedAt`: timestamp when the request reached the service
- `alertType`: normalized event category for rendering and playback behavior
- `payload`: normalized request data required for rendering and TTS generation

**Validation rules**:

- `requestId`, `correlationId`, `source`, `receivedAt`, `alertType`, and `payload` are required.
- `source` must be one of the supported inbound origin types.
- Invalid or incomplete payloads are rejected at intake and never enter queue state.

## Entity: Tool Integration Profile

**Purpose**: Captures the officially documented operator-facing expectations per supported tool integration.

### Mix It Up Profile

- Submission path: existing alert intake endpoint
- Body shape: canonical `Alert Request`
- Official response signals: `data.outcome`, `data.jobId`

### Streamer.bot Profile

- Submission path: existing alert intake endpoint through the documented Script-/Program-Execution POST flow
- Body shape: canonical `Alert Request`
- Official response signals: HTTP status, `data.outcome`, `data.jobId`

**Validation rules**:

- Tool profiles do not change queue or recovery semantics.
- Tool profiles define supported documentation and example scope, not alternative API shapes.

## Entity: Integration Example

**Purpose**: Represents operator-copyable example content used in docs and sample files.

**Fields**:

- `toolName`
- `endpoint`
- `requestBody`
- `expectedSignals`

**Validation rules**:

- Examples must use the canonical alert request shape.
- Examples must only require local endpoint values and payload content to adapt.
- Examples must stay aligned with the public contract artifact and runtime documentation.

## Entity: Alert Queue Item

**Purpose**: Represents one accepted alert as it moves through admission, waiting, active processing, completion, failure, or recovery failure.

**Fields**:

- `jobId`: unique queue job identifier
- `requestId`: reference back to the originating alert request
- `correlationId`: trace identifier used in logs and status responses
- `state`: current queue state
- `storageTier`: `memory` or `deferred-overflow`
- `sequenceNumber`: monotonic ordering value used to preserve externally visible order
- `admissionOutcome`: accepted or deferred-to-disk outcome recorded at intake
- `enqueuedAt`: timestamp when the alert first entered accepted queue processing
- `activatedAt`: timestamp when the alert started active execution, if applicable
- `completedAt`: timestamp when the alert reached a terminal state, if applicable
- `failureCode`: machine-readable terminal or recovery failure code, if applicable
- `failureReason`: operator-visible explanation of a terminal failure, if applicable

**State transitions**:

- `received` → `pending-memory`
- `received` → `deferred-overflow`
- `pending-memory` → `active`
- `deferred-overflow` → `restored-pending`
- `restored-pending` → `active`
- `active` → `completed`
- `active` → `failed`
- `active` → `recovery-failed` after unexpected termination and startup recovery

**Validation rules**:

- `sequenceNumber` must be unique and monotonically increasing for accepted work.
- Only one queue item can be in `active` state at a time.
- `recovery-failed` can only be assigned during startup recovery for previously active work.

## Entity: Queue Admission Result

**Purpose**: Describes the machine-readable outcome returned to callers when an alert request is evaluated for queue entry.

**Fields**:

- `requestId`
- `jobId` when work is accepted or deferred
- `outcome`: `accepted`, `deferred-to-disk`, `rejected`, `rate-limited`, or `duplicate-handled`
- `reasonCode`: stable code explaining the outcome
- `message`: human-readable explanation
- `sequenceNumber`: present when work enters accepted processing order

**Validation rules**:

- `outcome`, `reasonCode`, and `message` are always required.
- `jobId` and `sequenceNumber` are required for `accepted` and `deferred-to-disk` outcomes.

## Entity: Deferred Overflow Record

**Purpose**: Durable local persistence for accepted alerts that could not remain in the in-memory queue.

**Fields**:

- `recordId`: unique durable record identifier
- `jobId`
- `sequenceNumber`
- `persistedAt`
- `payloadSnapshot`: normalized alert payload required to resume processing
- `restoreStatus`: `pending-restore`, `restored`, or `restore-failed`
- `restoredAt`: timestamp once promoted back to active queue processing

**Validation rules**:

- `sequenceNumber` must preserve original accepted order.
- `payloadSnapshot` must be sufficient to resume processing without re-reading transient runtime state.
- `restoreStatus` changes must be durable before new intake is accepted after recovery.

## Entity: Queue Snapshot

**Purpose**: Represents operator-facing queue visibility returned by the queue-status endpoint.

**Fields**:

- `activeJob`: summary of the current active alert, if one exists
- `inMemoryDepth`: count of pending in-memory alerts
- `deferredDepth`: count of persisted deferred-overflow alerts waiting for restoration
- `oldestPendingAgeMs`: age of the oldest non-terminal accepted alert
- `recentFailures`: recent terminal failures including recovery-failed outcomes
- `lastUpdatedAt`: timestamp for the snapshot

## Entity: Recovery Failure Record

**Purpose**: Captures the operator-visible terminal record created when a previously active alert is marked failed during startup recovery.

**Fields**:

- `jobId`
- `requestId`
- `recoveryDetectedAt`
- `failureCode`
- `failureReason`
- `previousState`: expected to be `active`

**Validation rules**:

- Created only during startup recovery.
- Must remain queryable through queue status or recent failure reporting until rotated by log retention policy.

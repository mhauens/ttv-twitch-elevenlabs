# Data Model: Mix It Up And Streamer.bot Intake Support

## Entity: Alert Source

**Purpose**: Represents the declared origin of an inbound alert request and determines whether the request is accepted by the canonical intake contract.

**Supported values**:

- `local`
- `twitch`
- `streamerbot`
- `mixitup`

**Validation rules**:

- The value is required for every inbound alert request.
- The value must match one of the supported source identifiers exactly.
- Unsupported values are rejected at the request-validation boundary and never create queue work.

## Entity: Alert Request

**Purpose**: Represents the canonical inbound request shared by local callers, Mix It Up, Streamer.bot, and other supported sources.

**Fields**:

- `source`: supported alert origin identifier
- `alertType`: event category understood by downstream rendering and playback logic
- `dedupeKey`: optional stable key for duplicate handling
- `payload`: structured event payload used by downstream services

**Validation rules**:

- `source`, `alertType`, and `payload` are required.
- `dedupeKey` is optional but, if present, must be a non-empty string.
- `payload` remains an open structured object because this feature does not introduce a source-specific payload variant.

**Relationships**:

- Produces one validated domain `AlertRequest` record after normalization.
- Flows into the existing queue admission path without any source-specific queue branching.

## Entity: Normalized Alert Request

**Purpose**: Represents the internal domain request created after validation and enrichment with request-scoped metadata.

**Fields**:

- `requestId`
- `correlationId`
- `receivedAt`
- all canonical `Alert Request` fields

**Validation rules**:

- Metadata fields are created by the service, not supplied by the caller.
- `source` is preserved exactly as validated so downstream logs and outcomes can identify the inbound tool.
- No queue, playback, or recovery rule may vary by `source` in this feature.

## Entity: Admission Response

**Purpose**: Represents the unchanged response envelope returned after queue admission is evaluated.

**Fields**:

- `status`
- `data.requestId`
- `data.jobId` when work is accepted or deferred according to the current contract
- `data.sequenceNumber` when work enters accepted order according to the current contract
- `data.outcome`
- `data.reasonCode`
- `data.message`

**Validation rules**:

- The envelope shape remains identical for all supported sources.
- This feature does not add or rename response fields.
- Unsupported source values continue to use the documented validation error envelope instead of this response entity.

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

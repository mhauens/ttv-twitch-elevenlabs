# Data Model: Windows TTS Mode

## Entity: TTS Mode Configuration

**Purpose**: Represents the runtime configuration that selects the speech provider and determines which supporting settings are required before alert processing can start.

**Fields**:

- `ttsMode`: one of `stub`, `elevenlabs`, or `windows`
- `audioOutputDir`: writable directory used for generated audio artifacts
- `playerKind`: configured playback adapter kind
- `playerCommand`: local player command or path used for audible playback
- `elevenLabsApiKey`: optional credential used only when `ttsMode=elevenlabs`
- `elevenLabsVoiceId`: optional voice identifier used only when `ttsMode=elevenlabs`
- `startupValidationState`: `unchecked`, `valid`, or `invalid`

**Validation rules**:

- `ttsMode` must accept the new `windows` value without adding new TTS-specific environment variables.
- `audioOutputDir`, `playerKind`, and `playerCommand` remain required for audible playback in every mode.
- `elevenLabsApiKey` and `elevenLabsVoiceId` are required only when `ttsMode=elevenlabs`.
- When `ttsMode=windows`, runtime validation must confirm Windows platform support and a usable local Windows speech path before the service reaches readiness.

**State transitions**:

- `unchecked` → `valid` during startup when the selected mode passes configuration and provider validation
- `unchecked` → `invalid` during startup when the selected mode cannot be used safely

## Entity: TTS Client Selection

**Purpose**: Represents the concrete provider boundary chosen for a running application instance.

**Fields**:

- `mode`: `stub`, `elevenlabs`, or `windows`
- `clientType`: `stub-client`, `elevenlabs-client`, or `windows-client`
- `validatedAt`: timestamp when startup validation completed for the selected client
- `validationFailureReason`: operator-visible reason when startup validation fails

**Validation rules**:

- Exactly one client is selected for a running process.
- Provider-specific validation must happen before alert intake is considered safe.
- Selection must remain outside queue orchestration so `AlertOrchestrator` depends only on the shared TTS interface.

## Entity: Synthesized Audio Artifact

**Purpose**: Represents the generated audio file handed to the player adapter for one alert.

**Fields**:

- `jobId`: owning alert job identifier
- `filePath`: absolute or resolved path to the generated audio file
- `mimeType`: audio format returned to the player path
- `format`: `wav` for stub and Windows modes, `mpeg` for ElevenLabs mode
- `createdAt`: timestamp when the file became available for playback
- `cleanupState`: `pending-cleanup`, `cleaned-up`, or `cleanup-failed`

**Validation rules**:

- The file must be written under the configured audio output directory.
- Windows mode must return `audio/wav` and produce a `.wav` artifact named from the alert job identifier.
- The artifact lifecycle must preserve the existing delete-after-processing behavior regardless of playback success or failure.

**State transitions**:

- `pending-generation` → `pending-cleanup` after successful synthesis
- `pending-cleanup` → `cleaned-up` after playback or failure cleanup succeeds
- `pending-cleanup` → `cleanup-failed` when deletion cannot complete

## Entity: Windows Speech Invocation

**Purpose**: Represents one local speech-synthesis request executed through the Windows speech boundary.

**Fields**:

- `jobId`: owning alert job identifier
- `renderedText`: final text passed to the local speech engine
- `outputPath`: target WAV path
- `voiceSelection`: `system-default`
- `executionResult`: `succeeded` or `failed`
- `failureReason`: provider-visible error message when synthesis cannot complete

**Validation rules**:

- `renderedText` must be derived from the same normalized alert content used by the existing TTS mode.
- `outputPath` must be writable before synthesis is attempted.
- Failures from provider invocation must be surfaced as standard alert-processing failures rather than implicit fallback to another TTS mode.

## Entity: Alert Queue Item

**Purpose**: Existing queued alert work whose observable lifecycle must remain unchanged while the speech provider becomes selectable.

**Fields affected by this feature**:

- `jobId`
- `sequenceNumber`
- `state`
- `correlationId`
- `failureCode`
- `failureReason`

**Relationships**:

- One `Alert Queue Item` selects one `TTS Client Selection` for synthesis during its processing lifecycle.
- One `Alert Queue Item` may produce one `Synthesized Audio Artifact`.
- One `Alert Queue Item` may record one alert-processing failure if synthesis fails.

**State constraints**:

- Queue states and ordering rules do not change for this feature.
- A Windows TTS generation failure can move the active item to the same failure path already used for other TTS errors.
# Feature Specification: Windows TTS Mode

**Feature Branch**: `[003-add-windows-tts]`  
**Created**: 2026-04-18  
**Status**: Draft  
**Input**: User description: "# Plan: Neuer `TTS_MODE=windows` mit Windows-Sprachsynthese"

## Clarifications

### Session 2026-04-18

- Q: Was muss beim Start validiert werden, wenn `TTS_MODE=windows` aktiv ist? → A: Beim Start prüfen: Windows-Plattform und lokal nutzbarer Windows-TTS-Pfad; andernfalls Start fehlschlagen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play Alerts With Local Windows Voice (Priority: P1)

As a streamer, I want the service to render alert speech with the local Windows voice capability so that I can keep audible alerts working even when I do not want to depend on a remote speech provider.

**Why this priority**: The primary value of the feature is giving the operator a built-in local speech option that still produces the same audible alert experience during live use.

**Independent Test**: Configure the service to use Windows TTS on a supported Windows machine, submit a valid alert, and verify that the alert is spoken audibly through the existing playback path without changing the HTTP request format.

**Acceptance Scenarios**:

1. **Given** the service is running on Windows with valid playback configuration and Windows TTS mode enabled, **When** a valid alert is submitted, **Then** the system generates spoken alert audio with the machine's default Windows voice and plays it through the existing playback workflow.
2. **Given** multiple valid alerts are queued while Windows TTS mode is enabled, **When** the queue drains, **Then** each alert is rendered to temporary audio and played in the same non-preemptive order already defined for alerts.
3. **Given** the operator switches from another TTS mode to Windows TTS mode, **When** the next alert is processed, **Then** the caller-facing HTTP behavior remains unchanged and only the speech source changes.

---

### User Story 2 - Fail Fast On Unsupported Runtime (Priority: P2)

As an operator, I want the service to reject an unusable Windows TTS configuration during startup so that I do not discover the problem only after a live alert fails.

**Why this priority**: Early startup failure is the main operational safeguard for this feature. It prevents a false-ready service state before a stream or event session starts.

**Independent Test**: Start the service with Windows TTS mode enabled on an unsupported runtime or with no usable local Windows speech path and verify that startup fails before the service reports readiness for alert intake.

**Acceptance Scenarios**:

1. **Given** Windows TTS mode is configured on a non-Windows runtime, **When** the service starts, **Then** startup fails before the service reports readiness or accepts alert work.
2. **Given** Windows TTS mode is configured on Windows but the local Windows speech path is not usable, **When** the service starts, **Then** startup fails before the service reports readiness or accepts alert work.

---

### User Story 3 - Preserve Queue Reliability During TTS Failures (Priority: P3)

As a streamer, I want one Windows TTS failure to affect only the current alert so that later queued alerts can still continue and the queue does not stall.

**Why this priority**: The feature must preserve the existing queue invariants and failure isolation guarantees instead of introducing a new blocking failure mode.

**Independent Test**: Force one alert to fail during speech generation while later alerts remain queued, then verify that the failed alert receives the normal terminal failure handling and the next alert continues in order.

**Acceptance Scenarios**:

1. **Given** an alert cannot be rendered through Windows TTS, **When** the failure is detected, **Then** the system records a normal alert-processing failure for that alert and advances to the next eligible queued alert.
2. **Given** an alert fails during Windows TTS generation after temporary audio output has started, **When** processing ends, **Then** the system follows the existing cleanup policy and does not leave the queue stuck on the failed item.
3. **Given** queue and health status are checked after a Windows TTS failure, **When** the operator inspects the service, **Then** the operator can tell that the alert failed while later queue processing continued.

---

**Operational Context**: The operator runs this service locally on Windows for live stream alerts. A visible success is hearing the spoken alert through the existing player path with no API or queue behavior changes. A visible failure is a service that appears ready but cannot synthesize speech, a queue that stalls after one failed alert, or leftover alert audio artifacts that accumulate after processing.

### Edge Cases

- Windows TTS mode is configured on a non-Windows runtime.
- The local Windows speech capability is unavailable or fails before the first alert is processed.
- A single alert cannot generate spoken audio while later alerts are already queued.
- Temporary alert audio cannot be written to the configured output location.
- Temporary alert audio is generated successfully but cleanup fails after playback or terminal failure.
- The operator enables Windows TTS mode but keeps the existing playback configuration unchanged and still expects playback to remain mandatory.
- Health or readiness is checked while startup validation has already determined that Windows TTS mode is unusable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow `TTS_MODE` to select a Windows-only local speech synthesis mode in addition to the existing modes.
- **FR-002**: When Windows TTS mode is selected on a supported Windows runtime, system MUST generate one temporary WAV audio artifact per alert and route it through the existing playback workflow.
- **FR-003**: System MUST use the machine's current default Windows voice for speech output in the initial release of this mode.
- **FR-004**: System MUST require no new TTS-specific runtime variables beyond selecting `TTS_MODE=windows`; existing playback configuration remains required.
- **FR-005**: System MUST preserve the existing HTTP request shape, admission outcomes, queue ordering guarantees, and non-preemptive playback semantics when Windows TTS mode is enabled.
- **FR-006**: System MUST validate during startup that Windows TTS mode is only enabled on a supported Windows runtime and that a local Windows speech path is usable before accepting alert work.
- **FR-007**: System MUST surface an unusable local speech capability for a specific alert as a normal alert-processing failure rather than silently degrading to another speech mode.
- **FR-008**: System MUST treat Windows TTS generation errors for an individual alert as isolated alert failures and MUST continue with the next eligible queued alert according to existing queue policy.
- **FR-009**: System MUST apply the existing temporary-audio cleanup behavior after playback completion or terminal failure when Windows TTS mode is used.
- **FR-010**: System MUST keep health and readiness behavior honest by not reporting alert intake as safe when Windows TTS startup validation has failed.
- **FR-011**: System MUST document `TTS_MODE=windows` as a valid runtime configuration option together with its Windows-only operating constraint and an example configuration path for operators.

### External Interfaces & Runtime Contracts

- Local alert intake remains unchanged: callers submit the same alert payloads and receive the same admission-style responses regardless of whether speech is produced by stub, remote synthesis, or Windows TTS.
- Runtime configuration expands to include `TTS_MODE=windows` as a valid public option while continuing to require the existing playback configuration for audible output.
- The generated-audio contract for Windows TTS mode is a temporary WAV file placed in the configured audio output location, then handed to the existing playback path and cleaned up after processing.
- Startup validation must prevent the service from reaching a ready state when Windows TTS mode is configured on an unsupported runtime or when no usable local Windows speech path is available.
- Alert-processing failure behavior remains unchanged: if one alert cannot be synthesized in Windows TTS mode, that alert reaches a visible terminal failure outcome and later accepted alerts continue in preserved order.
- Operator-facing documentation must describe that Windows TTS mode is Windows-only, uses the system default voice, and does not change the local alert API.

### Key Entities *(include if feature involves data)*

- **TTS Mode Selection**: The runtime choice that determines which speech source is used for alert rendering, including the new Windows-only local speech option.
- **Generated Alert Audio**: The temporary WAV artifact created for a single alert before playback and cleanup.
- **Alert Queue Item**: The existing queued work item whose lifecycle must remain unchanged even when speech generation comes from Windows TTS.
- **Alert Failure Outcome**: The operator-visible terminal result recorded when one alert cannot be synthesized or played while the queue continues.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a supported Windows machine with valid playback settings, an operator can enable Windows TTS mode by changing only `TTS_MODE` and complete a successful audible alert check within 10 minutes.
- **SC-002**: In 100% of startup validation tests where Windows TTS mode is configured on an unsupported runtime or without a usable local Windows speech path, the service refuses readiness before any alert is accepted.
- **SC-003**: In a manual validation run of 20 normal test alerts on a supported Windows machine, at least 19 alerts produce audible spoken playback using the system default Windows voice.
- **SC-004**: In 100% of queue-failure validation runs where one alert fails during Windows speech generation, later accepted alerts continue processing in order without manual queue intervention.
- **SC-005**: An operator can identify the Windows-only limitation, required configuration, and expected behavior of the mode from the documentation within 3 minutes.

## Assumptions

- Windows TTS mode remains a local single-machine feature and does not change the service into a remote multi-user system.
- The existing playback path remains mandatory even when speech is generated locally through Windows TTS.
- Using the Windows system default voice is sufficient for the initial release of this mode.
- Direct spoken output without generating an audio file is out of scope for this feature.
- Additional voice selection, speech rate, or volume controls are out of scope for this first version of Windows TTS mode.
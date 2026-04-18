# Research: Windows TTS Mode

## Decision: Preserve the existing file-based playback pipeline for the new TTS mode

**Rationale**: The current runtime already synthesizes audio to disk, plays that file through a dedicated player process, and deletes the artifact afterwards. Keeping that shape for Windows TTS preserves queue timing, OBS capture assumptions, player isolation, and existing cleanup behavior.

**Alternatives considered**:

- Direct Windows speech output without an audio file: rejected because it would bypass the current player boundary, change observable playback behavior, and make cleanup and OBS routing inconsistent with existing modes.
- A separate playback path only for Windows TTS: rejected because it would duplicate orchestration logic and weaken the single-consumer queue model.

## Decision: Extract TTS selection into an explicit factory with one client per mode

**Rationale**: The current `ElevenLabsClient` mixes the stub path and the remote provider path. A small factory with dedicated clients keeps mode selection in application wiring, preserves thin orchestration services, and makes startup validation and unit tests provider-specific.

**Alternatives considered**:

- Keep branching inside `ElevenLabsClient`: rejected because it mixes unrelated local and remote integrations behind one class name and makes Windows-specific startup checks awkward.
- Move provider selection into `AlertOrchestrator`: rejected because orchestration should only depend on a TTS interface, not on runtime mode branching or provider-specific validation.

## Decision: Implement Windows synthesis through `powershell.exe` and `.NET System.Speech.Synthesis.SpeechSynthesizer`

**Rationale**: The feature is Windows-first and local-first. Launching PowerShell from Node avoids native addon complexity, uses a Windows capability already expected on the target platform, and still produces a WAV artifact that fits the current playback pipeline.

**Alternatives considered**:

- Native Node addons for speech synthesis: rejected because they add dependency, packaging, and Windows runtime complexity for a feature that can use built-in OS capabilities.
- Reuse ElevenLabs with a local fallback voice: rejected because the feature goal is a true local mode that does not depend on a remote TTS provider.

## Decision: Validate Windows TTS availability during startup, not on first alert

**Rationale**: The clarified spec requires readiness honesty. If `TTS_MODE=windows` is configured, the service should reject unsupported runtime or unusable local speech setup before it starts accepting alert traffic.

**Alternatives considered**:

- Defer validation until the first queued alert: rejected because it allows a false-ready service state and shifts operator discovery into live use.
- Log a warning but keep startup successful: rejected because the feature is part of the primary alert path and cannot be treated as optional once selected.

## Decision: Treat runtime configuration as the changed public contract; keep HTTP contracts unchanged

**Rationale**: The feature adds one valid `TTS_MODE` value and new startup semantics, but does not change request payloads, response shapes, or queue-status fields. The design therefore needs a runtime-configuration contract instead of an HTTP API revision.

**Alternatives considered**:

- Update the OpenAPI document despite no HTTP shape change: rejected because it would create contract churn without a caller-visible API delta.
- Skip contract artifacts entirely: rejected because the runtime configuration is still a public operator-facing interface and needs explicit documentation.

## Decision: Add isolated tests around env parsing, TTS factory selection, Windows client process execution, and startup validation

**Rationale**: The highest-risk behavior is at mode selection and startup. Mocking the child-process seam for Windows synthesis keeps tests deterministic while existing orchestrator tests already cover queue continuation after TTS failure.

**Alternatives considered**:

- Rely only on manual Windows verification: rejected because mode-selection and startup-validation regressions are easy to automate and should be caught before live use.
- Add live PowerShell integration tests to the standard suite: rejected because CI and non-Windows environments would become brittle; manual Windows smoke tests remain the right place for real synthesis playback verification.
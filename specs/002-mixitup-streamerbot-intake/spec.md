# Feature Specification: Mix It Up And Streamer.bot Intake Support

**Feature Branch**: `[002-mixitup-streamerbot-intake]`  
**Created**: 2026-04-18  
**Status**: Draft  
**Input**: User description: "Mix It Up und Streamer.bot Intake Support"

## Clarifications

### Session 2026-04-18

- Q: Welche Antwortsignale sind fuer die offiziellen Tool-Integrationen verbindlich? → A: Mix It Up nutzt offiziell `data.outcome` und `data.jobId`; Streamer.bot nutzt offiziell HTTP-Status plus `data.outcome` und `data.jobId`.
- Q: Welcher Streamer.bot-Integrationspfad ist offiziell im Scope? → A: Offiziell unterstuetzt ist nur der dokumentierte Script-/Program-Execution-POST-Flow; andere Streamer.bot-Wege sind out of scope.
- Q: Welches Artefakt ist normativ, wenn API-Beschreibung, Runtime-Guide und Operator-Beispiele voneinander abweichen? → A: Die oeffentliche API-Beschreibung ist normativ fuer Request- und Response-Vertrag; Runtime-Guide, Quickstart und Operator-Beispiele muessen dazu konsistent gehalten werden.
- Q: Erfordert der neue Source-Enum-Wert eine neue API-Version? → A: Nein. `mixitup` ist eine rueckwaertskompatible additive Erweiterung innerhalb der bestehenden API-Version und fuehrt weder eine neue Route noch einen neuen Response-Envelope ein.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accept Supported Tool Requests (Priority: P1)

As a streamer, I want Mix It Up and Streamer.bot to submit alerts through the same local intake contract so that I can automate alerts from both tools without changing queue behavior or learning a separate workflow.

**Why this priority**: Accepting requests from both tools through the existing intake contract is the core user value. Without this, the feature does not provide the promised interoperability.

**Independent Test**: Submit one valid alert from each officially supported tool using the existing alert intake endpoint and verify that both receive the same documented admission response shape and queue outcome semantics as current supported sources.

**Acceptance Scenarios**:

1. **Given** the local service is ready, **When** a valid Mix It Up alert request is submitted through the existing alert intake route, **Then** the request is accepted or rejected using the same admission rules, outcome codes, and response envelope as other supported sources.
2. **Given** the local service is ready, **When** a valid Streamer.bot alert request is submitted through the existing alert intake route, **Then** the request is handled through the same queue, recovery, and backpressure semantics as other supported sources.
3. **Given** a caller submits an alert request with an unsupported source value, **When** the service validates the request, **Then** the service returns the documented invalid-request outcome and does not change queue state.

---

### User Story 2 - Follow Clear Operator Integration Steps (Priority: P2)

As an operator, I want concise integration guidance and ready-to-use examples for Mix It Up and Streamer.bot so that I can connect each tool to the local alert service quickly and verify the returned outcome fields.

**Why this priority**: The integration is only useful if operators can configure both tools correctly during stream setup without reverse-engineering request bodies or response handling.

**Independent Test**: Follow the documented setup steps and example payloads for each tool in a clean local environment and verify that an operator can send a test alert and identify the returned outcome and job identifier.

**Acceptance Scenarios**:

1. **Given** an operator is configuring Mix It Up, **When** they follow the documented request setup, **Then** they can submit an alert that matches the supported intake contract and identify `data.outcome` and `data.jobId` for automation.
2. **Given** an operator is configuring Streamer.bot, **When** they follow the documented scripted request flow, **Then** they can submit the supported alert request and inspect the HTTP status plus `data.outcome` and `data.jobId` for success or failure handling.
3. **Given** an operator reviews the examples shipped with the service, **When** they copy the relevant example into either tool, **Then** the example requires only local endpoint details and alert content.

---

### User Story 3 - Preserve Existing Client Compatibility (Priority: P3)

As an existing client or operator, I want current local, Twitch, and Streamer.bot integrations to remain compatible so that enabling official Mix It Up support does not create regressions in live alert handling.

**Why this priority**: Backward compatibility protects current workflows and avoids introducing risk into a queueing system whose core guarantees are already established.

**Independent Test**: Re-run the existing admission, queue, recovery, and contract validation flows after adding the new supported source and verify that previously supported request formats and response fields remain unchanged.

**Acceptance Scenarios**:

1. **Given** an existing client submits a valid request using a previously supported source, **When** the feature is released, **Then** the request remains valid and receives the same response shape as before.
2. **Given** a valid request from any supported source is accepted while the queue is busy, **When** the alert enters processing, **Then** the queue preserves the same ordering, non-preemptive execution, and recovery behavior as before the feature.
3. **Given** operators update their runtime documentation after the feature is released, **When** they review supported sources and setup guidance, **Then** the documented source list, examples, and quickstart remain internally consistent.

---

**Operational Context**: The operator runs the local alert service during a live stream and configures external automation tools to send alert requests into the existing intake endpoint. Visible failure includes a tool-specific setup path that diverges from the documented contract, inconsistent response handling across tools, or any change that alters queue ordering, recovery behavior, or admission outcomes for existing clients.

**Out of Scope**: This feature does not add alternative Streamer.bot transport paths, tool-specific payload variants, or any new intake route beyond the existing alert intake endpoint.

### Edge Cases

- Mix It Up or Streamer.bot sends a request with the correct route but an unsupported or misspelled source value.
- Either tool omits the optional deduplication key and relies on the standard request shape.
- Either tool retries the same request after a timeout and the service must preserve existing duplicate-handling behavior.
- The queue is already at a documented backpressure threshold when a Mix It Up or Streamer.bot request arrives.
- Existing clients using previously supported sources continue sending requests while operators add the new documented integrations.
- Operator examples drift from the documented public contract unless all public references are updated together.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST recognize the supported alert source values `local`, `twitch`, `streamerbot`, and `mixitup` on the existing alert intake endpoint.
- **FR-002**: System MUST continue to accept alert requests from previously supported sources without requiring request-shape changes.
- **FR-003**: System MUST require Mix It Up and Streamer.bot integrations to use the same canonical request fields as other supported sources: `source`, `alertType`, optional `dedupeKey`, and `payload`, with no source-specific wrapper, alias field, extra required field, or alternate payload shape.
- **FR-004**: System MUST keep the existing alert intake response envelope unchanged for all supported sources, including required `status`, `data.requestId`, `data.outcome`, `data.reasonCode`, and `data.message` fields plus the existing optional `data.jobId` and `data.sequenceNumber` fields when applicable.
- **FR-005**: System MUST reject unknown source values with the documented invalid-request behavior and without creating queued work.
- **FR-006**: System MUST preserve existing admission, queue ordering, backpressure, failure isolation, and recovery semantics regardless of whether the request originates from Mix It Up, Streamer.bot, or an already supported source.
- **FR-007**: System MUST document a concise operator setup flow for Mix It Up that explains how to submit the canonical alert request and inspect `data.outcome` and `data.jobId` during automation.
- **FR-008**: System MUST document a concise operator setup flow for Streamer.bot that explains how to submit the canonical alert request through the official Script-/Program-Execution-POST path and inspect the returned HTTP status plus `data.outcome` and `data.jobId`.
- **FR-009**: System MUST provide ready-to-use example requests for both Mix It Up and Streamer.bot that can be adapted with only local endpoint details, alert content, and optional deduplication values already defined by the canonical contract.
- **FR-010**: System MUST keep public documentation, quickstart material, and public API descriptions aligned on the full list of supported source values and the unchanged response contract.
- **FR-011**: System MUST make clear that this feature extends supported intake context only and does not introduce a new route or a tool-specific request payload shape.
- **FR-012**: System MUST state that Streamer.bot support is limited to the documented Script-/Program-Execution-POST flow and that other Streamer.bot transport paths are outside the supported scope.
- **FR-013**: System MUST treat the existing `duplicate-handled` outcome as unchanged for Mix It Up, Streamer.bot, and previously supported sources, with no tool-specific response variant or special duplicate contract.
- **FR-014**: System MUST treat the addition of `mixitup` as a backward-compatible additive change within the current API version rather than as a trigger for a new route or version boundary.

### External Interfaces & Runtime Contracts

- The existing alert intake endpoint remains the single supported submission path for Mix It Up, Streamer.bot, and previously supported sources.
- The public intake contract is the normative source for request and response behavior when runtime guides or operator examples differ.
- The public intake contract must define the complete supported source list as the exact values `local`, `twitch`, `streamerbot`, and `mixitup`, and must continue to use one shared structured request shape for all supported sources.
- The public intake contract must define one unchanged structured response envelope for accepted, rejected, deferred, duplicate-handled, or otherwise documented admission outcomes.
- Omitting `dedupeKey` remains valid for every supported source and does not create a source-specific admission contract.
- Operator-facing guidance for Mix It Up must explain how the tool submits the shared alert request and how operators inspect `data.outcome` and `data.jobId` for downstream automation decisions.
- Operator-facing guidance for Streamer.bot must explain how the tool submits the shared alert request through the official Script-/Program-Execution-POST flow and how operators inspect the HTTP status plus `data.outcome` and `data.jobId`.
- Documentation and examples must state that duplicate handling, queue admission, backlog visibility, and recovery behavior remain governed by the existing service contract rather than by tool-specific behavior.
- Duplicate-handled responses do not gain tool-specific fields, alternate status semantics, or separate handling rules for Mix It Up or Streamer.bot.
- Runtime documentation must continue to describe readiness and queue visibility in a way that is independent of which supported source generated the request.

### Key Entities *(include if feature involves data)*

- **Alert Source**: The declared origin of an inbound alert request, limited to the exact supported values `local`, `twitch`, `streamerbot`, and `mixitup`.
- **Alert Request**: The canonical inbound alert submission containing the supported source, alert type, optional deduplication identifier, and payload used for queue admission.
- **Admission Response**: The unchanged response envelope returned to callers, including the request identifier, queue outcome, optional job identifier, optional sequence information, machine-readable reason, and human-readable message.
- **Integration Example**: Operator-facing example content showing how a supported tool submits the canonical alert request and interprets the documented response fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can configure either Mix It Up or Streamer.bot to submit a valid test alert through the existing intake endpoint within 10 minutes using only the shipped documentation and examples.
- **SC-002**: In validation testing, 100% of valid Mix It Up alert requests receive the same documented response envelope structure as equivalent requests from already supported sources.
- **SC-003**: In validation testing, requests with unsupported source values are rejected in 100% of cases with the documented invalid-request outcome and no queue side effects.
- **SC-004**: Regression validation shows no change in externally visible admission, queue ordering, or recovery behavior for previously supported sources across the existing automated test suite.
- **SC-005**: Documentation review finds no conflicting statements across the runtime guide, quickstart, examples, and public API description about supported sources, request shape, or response fields.

## Assumptions

- Operators will continue using the existing local alert service as the single intake endpoint for automation tools.
- Mix It Up support is delivered through the same alert request contract as other supported sources rather than through a separate tool-specific payload shape.
- Streamer.bot support is delivered only through the documented Script-/Program-Execution-POST flow that can submit the same alert request contract as other supported sources.
- Both documented integrations can send requests in the supported structured format to the local alert service.
- Existing queue invariants, recovery behavior, admission outcomes, and response fields remain in scope as fixed behavior rather than being redesigned by this feature.

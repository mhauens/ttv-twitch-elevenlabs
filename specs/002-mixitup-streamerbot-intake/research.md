# Research: Mix It Up And Streamer.bot Intake Support

## Decision: Extend supported sources only in the intake normalization boundary

**Rationale**: The current service treats `source` as validated request metadata. Queue admission, overflow persistence, recovery, playback orchestration, and queue status do not branch on source today, so adding `mixitup` should remain a boundary-only change in the domain type and Zod schema.

**Alternatives considered**:

- Add source-specific branching in routes or services: rejected because it would create unnecessary runtime divergence and increase regression risk on queue invariants.
- Add a new Mix It Up endpoint: rejected because the feature spec explicitly keeps one canonical intake route and payload shape.

## Decision: Preserve the existing request and response contract exactly, aside from the new source enum value

**Rationale**: Existing local, Twitch, and Streamer.bot callers already rely on the documented response envelope and machine-readable outcome fields. Keeping the contract stable limits the change to support expansion rather than behavior redesign.

**Alternatives considered**:

- Add tool-specific request fields: rejected because that would fragment the intake contract and contradict the clarified spec.
- Add tool-specific response variants: rejected because operators need one predictable automation surface and existing callers must remain compatible.

## Decision: Make official response handling explicit per tool without broadening the stable contract surface

**Rationale**: The clarified spec defines a narrow, practical automation contract: Mix It Up relies on `data.outcome` and `data.jobId`, while Streamer.bot relies on HTTP status plus `data.outcome` and `data.jobId`. Documenting those signals reduces setup ambiguity without implying that every response field is a separate tool-specific guarantee.

**Alternatives considered**:

- Treat the entire response body as the tool-specific automation contract: rejected because it adds unnecessary support obligations beyond what operators need.
- Treat only transport success as official: rejected because machine-readable outcome handling is already part of the public API design.

## Decision: Limit official Streamer.bot support to Script-/Program-Execution POST flow

**Rationale**: The repository already assumes Node.js is available locally, and the feature brief explicitly rejects a GET-only or alternative transport workaround as the primary path. A single official Streamer.bot path keeps docs, examples, and tests concrete.

**Alternatives considered**:

- Support any Streamer.bot mechanism that can reach the endpoint: rejected because it would enlarge support scope without adding runtime value.
- Mention multiple unofficial workarounds in primary docs: rejected because it would weaken the supported operator path and complicate troubleshooting.

## Decision: Update contract, examples, README, runtime guide, and quickstart together

**Rationale**: The biggest risk in this feature is documentation drift rather than runtime logic. Operators will configure live tooling directly from those artifacts, so they must stay aligned on supported sources, payload shape, official response signals, and unsupported paths.

**Alternatives considered**:

- Update only OpenAPI and code comments: rejected because it leaves operator-facing setup incomplete.
- Update only README and examples: rejected because public contract artifacts and quickstart would become inconsistent.

## Decision: Prove the change through contract coverage and targeted schema acceptance tests

**Rationale**: Because queue semantics are source-agnostic, the highest-value automated checks are that `mixitup` is accepted through the same documented contract and that unsupported sources still fail validation. Existing integration coverage already protects queue ordering and recovery behavior.

**Alternatives considered**:

- Add new recovery and burst tests for `mixitup`: rejected because they would duplicate existing source-agnostic queue coverage without increasing confidence materially.
- Rely on manual validation only: rejected because contract drift is easy to miss without automated checks.

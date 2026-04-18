# Implementation Plan: Mix It Up And Streamer.bot Intake Support

**Branch**: `[002-mixitup-streamerbot-intake]` | **Date**: 2026-04-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-mixitup-streamerbot-intake/spec.md`

## Summary

Extend the existing alert intake contract to recognize `mixitup` as a supported source, keep the current `POST /api/v1/alerts` request and response shape unchanged, and add operator-facing integration guidance and ready-to-use examples for Mix It Up and Streamer.bot.

The operator-facing outcome is a lower-friction setup path for both tools without any change to queue ordering, admission, backpressure, recovery, or health behavior. The affected runtime surfaces are limited to request normalization, public contract documentation, operator docs, examples, and contract coverage. The change is safe for live local streaming use because the queue, recovery, persistence, and playback paths remain source-agnostic and therefore do not need behavior changes.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS  
**Primary Dependencies**: Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest  
**Storage**: No new storage; existing SQLite overflow/recovery metadata and local filesystem audio artifacts remain unchanged  
**Testing**: Vitest for unit and integration tests, Supertest for HTTP coverage, OpenAPI-backed contract checks  
**Target Platform**: Windows 10/11 local machine  
**Project Type**: Local HTTP service / automation backend  
**Performance Goals**: Preserve current intake latency and queue behavior; add no new hot-path I/O beyond existing request normalization; keep operator setup copy/paste validation within 10 minutes per supported tool  
**Constraints**: Windows-first, local-only bind by default, stable live-stream behavior, `.env`-driven config, no new route, no tool-specific payload shape, unchanged JSON response envelope, official Streamer.bot support limited to Script-/Program-Execution POST flow  
**Scale/Scope**: Single operator, low implementation risk, one new supported source value, documentation and examples for two tool integrations, no queue or playback algorithm changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- PASS: Module boundaries remain explicit. Intake validation stays in domain and integration boundary files, while queue, recovery, playback, and status services stay unchanged.
- PASS: External dependency behavior is unchanged. No new remote dependency, timeout, retry, or recovery rule is added; the plan only documents supported operator submission paths.
- PASS: API changes are explicit. The contract extension is limited to one new `source` enum value, while request shape, response envelope, duplicate handling, and idempotent behavior stay unchanged.
- PASS: Health, readiness, and queue-status behavior remain defined and unchanged. Docs will explicitly state that tool origin does not change queue visibility or readiness semantics.
- PASS: `.env` impact is documented as none. No new configuration variable, secret, or startup validation path is introduced.
- PASS: Queue semantics stay explicit and unchanged. The plan preserves the existing burst handling, non-preemptive execution, recovery ordering, and failure isolation guarantees.
- PASS: Observability remains planned and consistent. Existing request, job, and outcome fields stay the diagnostic surface for all supported sources.
- PASS: Automated tests and Windows operator checks are planned. Contract coverage and schema-level validation will prove the new source is accepted and unsupported sources still fail.
- PASS: No constitution violations require exceptions. Complexity Tracking remains empty.

## Phase 0: Research & Decisions

Research outcomes are recorded in [research.md](./research.md). Key decisions:

- Extend supported source validation only at the normalization boundary because queue and recovery services already behave source-agnostically.
- Keep one canonical intake contract and one unchanged response envelope so existing callers and operator mental models remain intact.
- Officially support Streamer.bot only through the documented Script-/Program-Execution POST flow to keep documentation, examples, and test scope bounded.
- Treat the 002 feature artifacts as the planning source of truth and synchronize the currently repository-facing 001 contract, data-model, and quickstart files from those approved 002 artifacts until the repository-wide docs are migrated.

## Phase 1: Design & Contracts

Design artifacts are recorded in:

- [data-model.md](./data-model.md)
- [contracts/local-alert-api.openapi.yaml](./contracts/local-alert-api.openapi.yaml)
- [quickstart.md](./quickstart.md)

Design highlights:

- The data model expands the supported `AlertSource` set with `mixitup` while keeping the canonical `AlertRequest` and `AdmissionResponse` entities unchanged.
- The contract artifact preserves the existing endpoint and response schema and only widens the `source` enum plus request examples.
- The quickstart focuses on operator validation for Mix It Up and Streamer.bot using the same endpoint and official response fields.
- The 002 contract, data model, and quickstart define the feature-approved behavior; implementation work must synchronize equivalent operator-facing updates into the existing 001 repository artifacts that are still linked from the main project docs.

## Post-Design Constitution Check

- PASS: The design keeps runtime logic localized to validation surfaces and does not pull queue or playback logic into route or documentation work.
- PASS: The contract artifact preserves explicit validation and unchanged response semantics for supported and unsupported sources.
- PASS: Operator guidance stays bounded to official support paths and preserves health, readiness, and queue-status expectations.
- PASS: No `.env`, readiness, or recovery drift is introduced by the design artifacts.
- PASS: No post-design constitution violations were introduced.

## Project Structure

### Documentation (this feature)

```text
specs/002-mixitup-streamerbot-intake/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── local-alert-api.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── alert-request.ts
├── integrations/
│   └── event-normalizer.ts
├── routes/
│   └── alerts-route.ts
└── services/
    └── queue-admission-service.ts

tests/
├── contract/
│   └── local-alert-api.contract.test.ts
├── integration/
│   ├── queue-burst.integration.test.ts
│   ├── queue-recovery.integration.test.ts
│   └── queue-status.integration.test.ts
└── unit/
    └── queue-admission-service.test.ts

docs/
├── runtime.md
README.md
examples/
├── alerts.http
└── streamerbot-alert.mjs
```

**Structure Decision**: No new runtime modules are required. The implementation should remain within the existing intake-validation boundary, public contract artifacts, and operator documentation surfaces, with one additional operator example file for the official Streamer.bot scripted POST flow. The 002 feature artifacts remain the design source of truth, while the existing 001 contract, quickstart, and data-model files are explicit synchronization targets until repository-facing documentation is migrated. This preserves clear separation between transport, queue orchestration, recovery, and playback while minimizing regression risk on live runtime paths.

**Operational Notes**: `GET /api/v1/health` and `GET /api/v1/queue` stay behaviorally unchanged and should continue to be documented as source-agnostic operator surfaces. Windows runtime verification for this feature focuses on sending a valid Mix It Up request, sending a valid Streamer.bot scripted POST request, confirming `data.outcome` and `data.jobId`, and verifying that unsupported sources still fail with the documented validation error. Startup validation and player binary assumptions remain unchanged because the feature adds no configuration or playback behavior.

## Complexity Tracking

No constitution violations or justified exceptions are required for this plan.

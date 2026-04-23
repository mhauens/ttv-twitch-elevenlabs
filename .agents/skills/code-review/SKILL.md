---
name: code-review
description: 'Review local code changes and provide actionable feedback. Use when: reviewing uncommitted changes, analyzing diffs, finding bugs, checking API and queue semantics, recovery risks, code quality, observability, performance, test gaps, or maintainability in this repository.'
argument-hint: 'Optional focus area, for example: queue ordering, recovery, HTTP contract, Windows playback, observability, or tests'
user-invocable: true
---

# Code Review

## 1. Scope

- Default scope: review the current staged and unstaged changes in the working tree.
- Only change the scope when the user explicitly asks for a different target, for example:
  - current branch vs `main`
  - a specific file or selection
  - a staged-only review
- This skill is for local development workflows, not PR comment threading or GitHub review submission.

## 2. Collect Evidence

- Start from the changed files, not from a broad repository scan.
- Prefer local git-aware tooling available in the environment.
- Use `git status --short` first so staged, unstaged, and untracked files are all in scope.
- Use workspace diff tooling such as `get_changed_files` when available and `git diff -U3` or equivalent with at least 3 lines of context to inspect the actual hunks for tracked files.
- If Git reports `dubious ownership`, retry read-only Git commands with `git -c safe.directory=<absolute repo path> ...` for this repository instead of changing global Git configuration.
- For untracked files, read the files directly instead of relying on `git diff`, since they are outside the normal diff output.
- Read additional code only when the changed lines require nearby symbols, helpers, contracts, tests, or service modules for correct evaluation.
- Keep the review source-bound to:
  - changed hunks
  - immediate surrounding code needed to understand behavior
  - directly referenced services, routes, adapters, config modules, contracts, or tests when the diff depends on them
- Do not turn the review into a general architecture audit.
- When the diff touches queue admission, orchestration, overflow persistence, or recovery, verify the full path across:
  - `src/routes/alerts-route.ts`
  - `src/services/queue-admission-service.ts`
  - `src/services/alert-orchestrator.ts`
  - `src/services/overflow-store.ts`
  - `src/services/queue-recovery-service.ts`
  - relevant tests under `tests/unit/`, `tests/integration/`, and `tests/contract/`
- When the diff touches HTTP responses, health behavior, or queue visibility, inspect:
  - `src/routes/health-route.ts`
  - `src/routes/queue-status-route.ts`
  - `src/services/queue-status-service.ts`
  - `specs/001-burst-safe-alert-queue/contracts/local-alert-api.openapi.yaml`
  - `tests/contract/local-alert-api.contract.test.ts`
- When the diff touches TTS or playback behavior, inspect:
  - `src/integrations/elevenlabs-client.ts`
  - `src/playback/player-adapter.ts`
  - `src/playback/vlc-adapter.ts`
  - `src/playback/mpv-adapter.ts`
  - Windows-specific notes in `docs/runtime.md` and `specs/001-burst-safe-alert-queue/quickstart.md`

## 3. Select Review Aspects

- Start from the aspects defined in [aspects.md](references/aspects.md), then keep only the ones with a credible evidence path in the current diff.
- Always include the `Clean Code & Simplification` aspect for non-trivial changed code, control flow, module boundaries, or tests, even when the user emphasizes other review goals.
- Skip aspects with no credible evidence path in the changed files.
- Typical relevance rules:
  - queue admission, orchestration, persistence, or recovery changes: Clean Code & Simplification, Queue Semantics & Recovery, Bugs, Race Conditions, Observability & Operations, Maintainability, Testing & Documentation
  - route or contract changes: Clean Code & Simplification, HTTP Contract & Validation, Bugs, Security, Maintainability, Testing & Documentation
  - TTS, playback, filesystem, or process execution changes: Clean Code & Simplification, External Boundaries & Failure Isolation, Bugs, Security, Performance, Testing & Documentation
  - config or startup changes: Clean Code & Simplification, Config & Startup Safety, Bugs, Security, Observability & Operations, Testing & Documentation
  - test-only changes: Clean Code & Simplification, Bugs, Test Flakiness, Maintainability
- If the user asks to emphasize a focus area, keep the other relevant aspects active but review the requested focus first.

## 4. Fan Out by Aspect

- If the user explicitly asks for delegation or parallel agent work and subagents are available, run one read-only, aspect-specific subanalysis per active review aspect.
- Otherwise, do clearly separated aspect passes in the current agent so findings do not collapse into one broad review too early.
- The `Clean Code & Simplification` pass is mandatory for non-trivial diffs that change logic, naming, control flow, helper usage, or tests, and should usually run before the broader maintainability pass.
- For this repository, prioritize `Queue Semantics & Recovery` before generic maintainability whenever the diff can affect ordering, single-consumer behavior, deferred backlog priority, crash recovery, or terminal failure handling.
- Run `HTTP Contract & Validation` whenever the diff changes routes, request normalization, response envelopes, health, queue status, or OpenAPI and contract tests.
- Each aspect pass should:
  - use the changed hunks as its primary evidence
  - inspect only the minimum nearby code needed to confirm a finding
  - return zero or more findings plus short supporting reasoning
  - explicitly say when no issue was found for that aspect

## 5. Merge and De-duplicate

- Merge the aspect results into one final review using [output-format.md](references/output-format.md).
- List each finding only once at the highest applicable severity.
- Keep behavior-preserving simplification ideas under suggestions unless the current structure hides a concrete defect, contract drift, recovery risk, or operational hazard.
- Prefer concrete, actionable feedback over generic style commentary.
- If a finding depends on repo conventions, use [repo-checklist.md](references/repo-checklist.md) as a quick repo summary and cite the underlying canonical source when authority matters.
- Prefer findings about broken queue guarantees, incorrect recovery handling, contract drift, missing validation, stale docs, or untested operational behavior over purely cosmetic observations.
- Keep praise selective; do not pad the review when the diff is trivial.

## 6. Severity Rules

- Critical issues: must fix before merging or shipping; likely functional, security, reliability, contract, or data-integrity risk.
- Suggestions: worthwhile improvement, defect risk, maintainability problem, observability gap, or missing validation that should be considered soon.
- Good practices: explicit strengths in the changed code that are visible in the diff.
- If nothing actionable is found, say so clearly and mention any residual validation gaps.

## 7. Validation and Commands

- When useful, recommend or run repo-native validation commands referenced in [repo-checklist.md](references/repo-checklist.md), especially `pnpm lint`, `pnpm test`, and `pnpm build`.
- Do not invent tests or CI steps that do not exist in the repository.
- If queue semantics, recovery, or contract behavior changed, call out the API-level smoke path from `AGENTS.md` using `examples/alerts.http` and `examples/burst-alerts.json`.
- If playback or Windows-specific runtime behavior changed, call out local verification of `PLAYER_COMMAND`, writable paths, and startup readiness on Windows.
- If no relevant automated check exists for the changed files, say that explicitly.

## 8. Output Language

- Follow the language rules in [output-format.md](references/output-format.md).
- Keep file references and technical terms precise even when the prose language changes.
- Unless the user asks otherwise, prefer German because the repository documentation and operator-facing guidance are German-first.

## 9. After the Review

- If the review contains actionable findings, explicitly offer to fix them directly after the RISK line.
- If the user agrees, address critical issues first and then suggestions.
- When fixing clean-code findings, keep the scope tightly limited to the touched code and preserve exact behavior.
- Prefer simplifications that reduce nesting, duplication, misleading names, brittle conditionals, redundant comments, or unnecessary abstraction.
- Do not rewrite unaffected modules or perform style-only churn in the name of simplification.
- Keep the fix pass minimal and focused on the reviewed findings, then rerun the relevant validation.

## 10. Example Prompts

- `Review my current changes with this skill.`
- `Review my uncommitted changes and focus on queue ordering first.`
- `Review my current changes with extra focus on recovery handling and clean code.`
- `Review only the staged diff in English.`
- `Review this branch against main and focus on HTTP contract drift.`
- `Review my current changes and then fix the findings.`

## References

- Review aspects: [references/aspects.md](references/aspects.md)
- Output format: [references/output-format.md](references/output-format.md)
- Repo checklist: [references/repo-checklist.md](references/repo-checklist.md)

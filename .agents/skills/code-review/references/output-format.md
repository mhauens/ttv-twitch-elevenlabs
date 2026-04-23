# Review Output Format

Use a consistent but not overly rigid review structure.

## Language

- Match the established conversation language unless the user explicitly requests another language.
- If no conversation language is established, default to German.
- Localize all section headings to the active output language.
- In this repository, prefer German phrasing for user-facing review prose unless the user explicitly asks for English.

## Section Order

1. `## <localized critical-issues heading>`
2. `## <localized suggestions heading>`
3. `## <localized summary heading>`
4. `## <localized good-practices heading>`
5. `## <localized testing-notes heading>`
6. `RISK: <0-10> - <one sentence summary>`
7. `<one short sentence offering to fix the findings directly>`

## Section Rules

- Findings must appear before any summary.
- Always render the localized critical-issues and suggestions headings. If a bucket is empty, say so explicitly in the active output language.
- Render the localized summary, good-practices, and testing-notes headings only when they add real information.
- Render the fix offer only when the review contains actionable findings, and place it directly after the `RISK:` line.
- If a fix offer is rendered, it must be the final line of the review. Otherwise the `RISK:` line must be the final line.
- Keep the summary to 1-3 precise sentences about what changed and why it matters.
- Order findings by severity and then by likely impact.
- Keep the total number of actionable findings compact. Prioritize signal over completeness theater.
- For queue, recovery, or persistence changes, explicitly call out whether queue invariants, restart semantics, and operator-visible outcomes still appear aligned.
- For route, contract, or status-surface changes, explicitly call out whether implementation, OpenAPI, and contract tests still appear aligned.

## Finding Format

For each critical issue or suggestion:

- Start with a file and line reference using the changed line when possible.
- Explain the concrete problem and its likely impact in no more than 3 short sentences.
- Add a clear remediation. Prefer a minimal fix description, and include a short code example only when it makes the fix materially clearer.

For each good practice:

- Keep it to one concise sentence tied to something visible in the diff.
- Do not add praise filler just to populate the section.

## Evidence Rules

- Stay bound to the diff and the minimal surrounding code needed to confirm behavior.
- Do not speculate about unrelated modules, teams, or future architecture work.
- Mention a finding only once, in the highest relevant severity bucket.

## Testing Notes

- Render this section only when it contains concrete validation advice.
- Mention missing tests, lint checks, or concrete manual verification steps when they are relevant to the changed behavior.
- Prefer concrete repo commands such as `pnpm lint`, `pnpm test`, and `pnpm build`.
- For queue, recovery, contract, or health changes, mention the API smoke path with `examples/alerts.http` and `examples/burst-alerts.json` when it has not been covered.
- For playback or Windows-specific runtime changes, mention local verification of `PLAYER_COMMAND`, queue DB path, and audio output directory when relevant.
- If no automated test path exists in the repository for the affected area, say so plainly.

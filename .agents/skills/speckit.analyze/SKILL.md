---
name: speckit.analyze
description: 'Use the canonical Speckit analyze workflow from .github inside Codex for cross-artifact consistency and quality checks.'
argument-hint: 'Optional analysis focus, for example contracts, tasks ordering, or drift'
user-invocable: true
---

# speckit.analyze

## Canonical Files

- Agent workflow: [../../../.github/agents/speckit.analyze.agent.md](../../../.github/agents/speckit.analyze.agent.md)
- Prompt metadata: [../../../.github/prompts/speckit.analyze.prompt.md](../../../.github/prompts/speckit.analyze.prompt.md)
- Shared bridge rules: [../_shared/speckit-bridge.md](../_shared/speckit-bridge.md)

Arbeite nach den Shared-Bridge-Regeln und folge danach der Agent-Datei als verbindlichem Workflow.
Der GitHub-Slash-Command dazu ist `/speckit.analyze`.

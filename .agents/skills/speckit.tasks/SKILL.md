---
name: speckit.tasks
description: 'Use the canonical Speckit tasks workflow from .github inside Codex to generate dependency-ordered tasks.md output.'
argument-hint: 'Optionaler Fokus fuer Task-Generierung oder Sequenzierung'
user-invocable: true
---

# speckit.tasks

## Canonical Files

- Agent workflow: [../../../.github/agents/speckit.tasks.agent.md](../../../.github/agents/speckit.tasks.agent.md)
- Prompt metadata: [../../../.github/prompts/speckit.tasks.prompt.md](../../../.github/prompts/speckit.tasks.prompt.md)
- Shared bridge rules: [../_shared/speckit-bridge.md](../_shared/speckit-bridge.md)

Arbeite nach den Shared-Bridge-Regeln und folge danach der Agent-Datei als verbindlichem Workflow.
Der GitHub-Slash-Command dazu ist `/speckit.tasks`.

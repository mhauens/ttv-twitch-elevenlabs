---
name: speckit.git.validate
description: 'Use the canonical Speckit git.validate workflow from .github inside Codex to validate feature-branch naming.'
argument-hint: 'Optionaler Branch- oder Validierungs-Kontext'
user-invocable: true
---

# speckit.git.validate

## Canonical Files

- Agent workflow: [../../../.github/agents/speckit.git.validate.agent.md](../../../.github/agents/speckit.git.validate.agent.md)
- Prompt metadata: [../../../.github/prompts/speckit.git.validate.prompt.md](../../../.github/prompts/speckit.git.validate.prompt.md)
- Shared bridge rules: [../_shared/speckit-bridge.md](../_shared/speckit-bridge.md)

Arbeite nach den Shared-Bridge-Regeln und folge danach der Agent-Datei als verbindlichem Workflow.
Der GitHub-Slash-Command dazu ist `/speckit.git.validate`.

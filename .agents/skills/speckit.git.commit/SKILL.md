---
name: speckit.git.commit
description: 'Use the canonical Speckit git.commit workflow from .github inside Codex for post-command auto-commit handling.'
argument-hint: 'Optionales Hook-Ereignis oder Commit-Kontext'
user-invocable: true
---

# speckit.git.commit

## Canonical Files

- Agent workflow: [../../../.github/agents/speckit.git.commit.agent.md](../../../.github/agents/speckit.git.commit.agent.md)
- Prompt metadata: [../../../.github/prompts/speckit.git.commit.prompt.md](../../../.github/prompts/speckit.git.commit.prompt.md)
- Shared bridge rules: [../_shared/speckit-bridge.md](../_shared/speckit-bridge.md)

Arbeite nach den Shared-Bridge-Regeln und folge danach der Agent-Datei als verbindlichem Workflow.
Der GitHub-Slash-Command dazu ist `/speckit.git.commit`.

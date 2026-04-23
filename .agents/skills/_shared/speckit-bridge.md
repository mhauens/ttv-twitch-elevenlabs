# Speckit Bridge For Codex

Die Speckit-Workflows unter `.github/agents/` und `.github/prompts/` bleiben die kanonische Quelle.
Die Wrapper unter `.agents/skills/speckit.*` existieren nur, damit Codex dieselben Workflows als Skills entdecken und ausfuehren kann.

## Arbeitsregeln

- Lies immer zuerst die passende Datei unter `.github/agents/<name>.agent.md`.
- Lies danach `.github/prompts/<name>.prompt.md`, damit Frontmatter, Alias und Agent-Zuordnung sichtbar bleiben.
- Behandle den Text nach dem Skill-Namen als `$ARGUMENTS`, wie es die GitHub-Prompts erwarten.
- Nutze auf diesem Windows-Repo bevorzugt PowerShell-Skripte unter `.specify/scripts/powershell/` und `.specify/extensions/**/powershell/`, wenn der Workflow Skripte ausfuehren soll.
- Wenn Git wegen `dubious ownership` blockiert, nutze fuer den einzelnen Befehl `git -c safe.directory=<absoluter-repo-pfad> ...`. Schreibe keine globale Git-Konfiguration, ausser der User verlangt das ausdruecklich.
- Schreibe Artefakte nur an die vom Speckit-Workflow erwarteten Orte, typischerweise unter `.specify/` und `specs/`.
- Wenn ein GitHub-Agent weitere Speckit-Agents als Handoff nennt oder von Research-/Sub-Agents spricht, behandle das als Workflow-Hinweis. Spawne Codex-Subagents nur, wenn der User ausdruecklich Delegation moechte.
- Aendere bei Workflow-Anpassungen zuerst die kanonischen Dateien unter `.github/`. Die Skill-Wrapper sollen nur Discovery-Text und Verweise enthalten.

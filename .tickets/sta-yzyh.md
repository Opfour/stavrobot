---
id: sta-yzyh
status: closed
deps: []
links: []
created: 2026-04-05T21:24:40Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Update README coder setup to mention profile

Update the 'Claude Code setup' section in README.md to reflect that the coder is now optional and requires the 'coder' profile. Follow the same pattern as the Signal setup section (e.g., mention COMPOSE_PROFILES or --profile coder). Update the startup command from 'docker compose up --build' to 'docker compose --profile coder up --build'.

## Acceptance Criteria

README clearly communicates that the coder is optional and how to enable it.


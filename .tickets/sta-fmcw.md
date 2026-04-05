---
id: sta-fmcw
status: closed
deps: []
links: []
created: 2026-04-05T21:20:00Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Make coder container optional via Docker Compose profile

Add profiles: ["coder"] to the coder service in both docker-compose.yml and docker-compose.harbormaster.yml, following the same pattern used by the signal service. This makes the coder container not start by default — users opt in with 'docker compose --profile coder up'.

## Acceptance Criteria

1. coder service has profiles: ["coder"] in both compose files. 2. No other services changed.


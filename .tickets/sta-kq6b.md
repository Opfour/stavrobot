---
id: sta-kq6b
status: closed
deps: []
links: []
created: 2026-04-05T21:53:27Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Update docs for multiple profiles and coder optionality

1. README.md: In the Claude Code setup section, fix the COMPOSE_PROFILES instruction — don't say 'uncomment', say to add 'coder' to COMPOSE_PROFILES (e.g. COMPOSE_PROFILES=coder or COMPOSE_PROFILES=signal,coder for multiple). Briefly explain comma-separated profiles. 2. config.example.toml: Add a comment above [coder] noting it also requires the coder Docker Compose profile. 3. ARCHITECTURE.md: Mark the coder container as optional (profile-gated) in the containers table and anywhere else relevant.

## Acceptance Criteria

All three files updated. Multiple-profile usage is documented.


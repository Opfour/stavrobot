---
id: sta-vcb8
status: closed
deps: []
links: []
created: 2026-04-05T21:53:24Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Add clear error when coder container is unreachable

In src/plugin-tools.ts, wrap the internalFetch call to the coder (line 565) in a try/catch. On network error, return a toolSuccess with a clear message: 'The coder container is not reachable. Make sure the coder Docker Compose profile is enabled and the container is running.' Only catch this one fetch, not the whole function.

## Acceptance Criteria

Network error when contacting coder returns a helpful message to the LLM instead of an opaque exception.


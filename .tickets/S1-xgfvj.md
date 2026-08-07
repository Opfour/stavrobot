---
id: S1-xgfvj
status: closed
deps: []
links: []
created: 2026-08-07T22:30:36Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Make the LLM provider login page mobile friendly

The /login page (buildLoginPageHtml in src/login.ts) is not responsive on phones.

Root cause: the page is missing <meta name="viewport" content="width=device-width, initial-scale=1">. Every other HTML page in the repo has it (home.ts, explorer.ts, settings.ts, plugins.ts, signal-captcha.ts). Without it mobile browsers lay out at a ~980px virtual viewport and scale down, so the 480px column sits in the left half of a zoomed-out page.

Secondary: the page's own body rule (margin: 80px auto; padding: 0 24px) is declared after getBaseStyles(), so it overrides the shared @media (max-width: 480px) { body { padding: 12px } } rule from theme.ts. On a phone this leaves an 80px dead band at the top and no narrow-screen padding.

Scope (src/login.ts only, roughly 10 lines):
1. Add the viewport meta tag.
2. Add a @media (max-width: 480px) block AFTER the page's body rule: reduce top margin to ~32px and horizontal padding to 16px.
3. Make the submit button full width on small screens for a comfortable tap target.

Already fine, do not change: the input is width 100% with font-size 1em (16px, so iOS does not zoom on focus); the .code-display device code block is already centred and fluid.

Non-goals:
- No redesign of the page.
- No changes to any other HTML page; they already have the viewport tag.
- No shared page-shell helper extraction.
- No automated visual or responsive tests.
- No changes to the login flow logic, SSE handling, or markup structure beyond what the styling needs.

Constraints:
- Use existing getBaseStyles() theme variables. No new dependencies, no CSS framework.

Ready for implementation.

## Acceptance Criteria

/login is readable and interactive at 320px width with no horizontal scroll and no forced zoom-out. All three sections (auth link, device code, prompt input) are usable at that width. Desktop appearance is essentially unchanged.


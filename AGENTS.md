# amananu.me repository guidance

This repository powers Aman Anu's public portfolio. Preserve its public, content-led nature: render public content server-side or at build time, keep interactions progressive, and do not introduce client-visible secrets.

## Agent-facing resources

- Public portfolio guide: `public/llms.txt`
- Markdown homepage: `public/index.md`
- Agentic Resource Discovery catalog: `public/.well-known/ard.json`
- Agent Plugin package: `agent-plugin/`

## Boundaries

- The portfolio is not a public API platform. Do not add or document API keys, OAuth, MCP, CLI, SDK, sandbox, payment, or account-changing features unless the product itself gains those capabilities.
- Keep machine-readable resources accurate. Do not publish discovery records that promise endpoints or actions that do not exist.
- Preserve existing Convex authorization and rate-limit boundaries. Never move private CMS or assistant context into a public route.

## Verification

Run `bun run check`, `bun run test`, and `bun run build` after changes that affect public routes, metadata, or agent resources.

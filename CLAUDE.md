# Reef Protocol — Claude Code Guide

Read `AGENTS.md` first — it covers architecture, commands, conventions, and file structure.

## Additional context for Claude Code

- This is an npm workspaces monorepo. Always build in order: `npm run build` handles this (protocol → client → directory).
- Run tests per-package with `cd <package> && npx vitest run`. Directory tests use pg-mem, no database needed.
- Lint with `npm run lint`, format with `npm run format`. CI enforces both.
- The protocol version lives in `protocol/src/types.ts` as `REEF_VERSION`. Never hardcode version strings — import from `@reef-protocol/protocol`.
- When editing directory models, remember they use init functions (`initAgentModel(sequelize)`) called from `db.ts`, not top-level `Model.init()`.
- XMTP addresses require `0x${string}` type — use `as \`0x${string}\`` casts. Messages are sent via `dm.sendText()`, not `dm.send()`.
- Branch protection requires CI pass + 1 reviewer. Always work on feature branches.

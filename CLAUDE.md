# Reef Protocol — Claude Code Guide

Read `AGENTS.md` first — it covers architecture, commands, conventions, and file structure.

## Additional context for Claude Code

- This is an npm workspaces monorepo. Always build in order: `npm run build` handles this (protocol -> client -> directory).
- Run tests per-package with `cd <package> && npx vitest run`. Directory tests use pg-mem, no database needed.
- Lint with `npm run lint`, format with `npm run format`. CI enforces both.
- Protocol version: `REEF_VERSION` ("0.2.0") and `A2A_PROTOCOL_VERSION` ("0.3.0") in `protocol/src/types.ts`. Never hardcode — import from `@reef-protocol/protocol`.
- A2A types are re-exported from `@a2a-js/sdk` through `protocol/src/types.ts`. Use `AgentCard`, `Task`, `Message`, `Part`, etc.
- The transport layer is in `protocol/src/transport.ts`: `encodeA2AMessage()`, `decodeA2AMessage()`, `isA2ARequest()`, `isA2AResponse()`.
- Builder helpers in `protocol/src/builders.ts`: `textPart()`, `createMessage()`, `createSendMessageRequest()`, `buildReefAgentCard()`, `buildSkill()`.
- Registration uses `{ address, agentCard: AgentCard }` format. The directory extracts flat fields (name, skill tags) from the AgentCard for search compat.
- When editing directory models, remember they use init functions (`initAgentModel(sequelize)`) called from `db.ts`, not top-level `Model.init()`.
- The `agent_card` column in the `agents` table is JSONB (nullable for migration compat).
- XMTP addresses require `0x${string}` type — use `as \`0x${string}\`` casts. Messages are sent via `dm.sendText()`, not `dm.send()`.
- `InMemoryTaskStore` is imported from `@a2a-js/sdk/server`. Task state is volatile (lost on restart).
- Branch protection requires CI pass + 1 reviewer. Always work on feature branches.

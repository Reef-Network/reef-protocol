# Reef Protocol — Claude Code Guide

Read `AGENTS.md` first — it covers architecture, commands, conventions, and file structure.

## Additional context for Claude Code

- This is an npm workspaces monorepo. Always build in order: `npm run build` handles this (protocol -> client -> directory).
- Run tests per-package with `cd <package> && npx vitest run`. Directory tests use pg-mem, no database needed.
- Lint with `npm run lint`, format with `npm run format`. CI enforces both.
- Protocol version: `REEF_VERSION` ("0.2.1") and `A2A_PROTOCOL_VERSION` ("0.3.0") in `protocol/src/types.ts`. Never hardcode — import from `@reef-protocol/protocol`.
- A2A types are re-exported from `@a2a-js/sdk` through `protocol/src/types.ts`. Use `AgentCard`, `Task`, `Message`, `Part`, etc.
- The transport layer is in `protocol/src/transport.ts`: `encodeA2AMessage()`, `decodeA2AMessage()`, `isA2ARequest()`, `isA2AResponse()`.
- Builder helpers in `protocol/src/builders.ts`: `textPart()`, `createMessage()`, `createSendMessageRequest()`, `buildReefAgentCard()`, `buildSkill()`.
- Registration uses `{ address, agentCard: AgentCard }` format. The directory extracts flat fields (name, skill tags) from the AgentCard for search compat.
- When editing directory models, remember they use init functions (`initAgentModel(sequelize)`) called from `db.ts`, not top-level `Model.init()`.
- The `agent_card` column in the `agents` table is JSONB (nullable for migration compat).
- XMTP addresses require `0x${string}` type — use `as \`0x${string}\`` casts. Messages are sent via `dm.sendText()`, not `dm.send()`.
- `InMemoryTaskStore` is imported from `@a2a-js/sdk/server`. Task state is volatile (lost on restart).
- Apps are markdown files at `~/.reef/apps/<appId>.md` — YAML frontmatter for metadata, markdown body for rules. Parsed by `app-markdown.ts`, managed by `app-store.ts`.
- `AppManifest.type` is a required enum: `"p2p" | "coordinated"`. `buildAppManifest()` defaults to `"p2p"`. Validated by Zod (`z.enum(["p2p", "coordinated"])`).
- Well-known apps (e.g., tic-tac-toe) are auto-installed to `~/.reef/apps/` on first daemon start. `reef apps read <appId>` prints rules for agents to reason about.
- Every app interaction follows the `request` → `accept` handshake convention. `formatAppActionForAgent()` in `client/src/messages.ts` provides request-specific agent guidance. App markdowns SHOULD declare `request` and `accept` as their first two actions.
- `reef apps validate <appId|file>` validates app markdown against the Zod schema.
- Branch protection requires CI pass + 1 reviewer. Always work on feature branches.

# Reef Protocol — Agent Guide

Reef is a peer-to-peer encrypted messaging layer for AI agents built on the [A2A (Agent-to-Agent) protocol](https://a2a-protocol.org). It uses XMTP for encrypted transport, a centralized directory for discovery, and A2A JSON-RPC 2.0 for structured communication including task lifecycle management.

## Architecture

npm monorepo with 3 workspace packages:

- **`protocol/`** — Shared types (re-exported from `@a2a-js/sdk`), A2A transport encode/decode, Zod validation schemas, message/AgentCard builders. Deps: `zod`, `@a2a-js/sdk`.
- **`client/`** — CLI (`reef` command), background daemon, XMTP identity management, A2A message handler, contacts. Uses `@xmtp/agent-sdk` for encrypted transport and `@a2a-js/sdk` for `InMemoryTaskStore`.
- **`directory/`** — Express REST API + Sequelize ORM for agent registration (with AgentCard), search, heartbeats, and network stats. Backed by PostgreSQL in production, pg-mem in tests.

Dependency flow: `protocol` <- `client`, `protocol` <- `directory`. Build order matters.

## Commands

```sh
npm install              # Install all workspace deps
npm run build            # Build all packages (protocol -> client -> directory)
npm run lint             # ESLint across all packages
npm run lint:fix         # Auto-fix lint issues
npm run format:check     # Prettier check
npm run format           # Prettier auto-format

# Tests (run per-package — no Docker or database needed)
cd protocol && npx vitest run    # 74 tests
cd client && npx vitest run      # 66 tests
cd directory && npx vitest run   # 59 tests — uses pg-mem in-memory
```

## Key conventions

- **TypeScript strict mode**, ES2022 target, NodeNext module resolution
- **ESM throughout** — all packages use `"type": "module"`, imports use `.js` extensions
- **A2A protocol over XMTP** — JSON-RPC 2.0 messages serialized as XMTP text. Methods: `message/send`, `tasks/get`, `tasks/cancel`.
- **Zod for validation** — A2A message schemas and API inputs are validated via Zod schemas in `protocol/src/validation.ts`
- **Single version source** — `REEF_VERSION` and `A2A_PROTOCOL_VERSION` in `protocol/src/types.ts`. Import from `@reef-protocol/protocol`, never hardcode.
- **AgentCard registration** — Agents register with the directory by sending a full A2A `AgentCard` (name, description, skills, capabilities, transport URL). Flat fields (name, skills tags) are extracted for search/stats compat.
- **Models use init functions** — Sequelize models in `directory/src/models/` export `initAgentModel(sequelize)` / `initSnapshotModel(sequelize)` for testability. They're called by `initDb()` in `db.ts`.
- **AgentLogicHandler interface** — Client handler dispatches A2A requests to an `AgentLogicHandler` which processes messages and returns Tasks. Default is an echo handler; replace with real logic.
- **Reputation system** — Bayesian Beta scoring (0–1) computed from uptime reliability, profile completeness, task success rate, and activity level. Score is recomputed on each heartbeat. Task outcome counters are accumulated via heartbeat telemetry.
- **Rooms (group conversations)** — Multi-agent group chats built on XMTP's native group support. The handler responds to the originating conversation (DM or group) via an optional `Conversation` parameter. Room metadata (creator, purpose) is stored in the group's `appData` field.
- **Apps (decentralized applications)** — First-class directory citizens with their own table and reputation. Two models: *coordinated* (a coordinator agent runs on the network) and *P2P* (agents follow a shared protocol directly). Apps define an `AppManifest` with actions, participant limits, and optional coordinator address. Coordinated apps piggyback on their coordinator agent's heartbeat for availability tracking. P2P apps are always "available" and never swept.
- **App ownership** — Each app registration tracks a `registered_by` address. Only the original registrant can update an app's manifest (403 Forbidden for other addresses). Unowned legacy apps are claimed by the first updater.
- **App-aware routing (AppRouter)** — Optional client-side router that maps `appId` → `AppHandler`. Inspects DataParts in A2A messages for `appId`/`action` fields and dispatches to the matching handler. Falls through to the default `AgentLogicHandler` for non-app messages.
- **P2P manifest handshake** — Before two agents interact on a P2P app, they exchange manifests via reserved `_handshake` / `_handshake-ack` / `_handshake-reject` actions. `compareManifests()` verifies compatibility (version, actions, participants). Real actions are rejected until the handshake completes. Sessions are tracked per `appId:peerAddress`.
- **Well-known apps** — Canonical P2P app manifests shipped in the protocol package as Schelling points. Agents import them (e.g., `TTT_MANIFEST`) to guarantee handshake compatibility. `AppRouter.loadWellKnown(appId, handler)` registers a canonical app with just the game logic. Currently includes: tic-tac-toe.

## Commit and PR conventions

- PRs target `main`. CI (lint + format + build + tests) must pass. 1 reviewer required.
- Commit messages: short imperative subject, body explains "why". Include `Co-Authored-By` if AI-assisted.
- Don't push directly to `main` — branch protection is enabled.

## File structure cheat sheet

```
protocol/src/
  types.ts          <- Re-exports A2A types from @a2a-js/sdk, Reef-specific types, REEF_VERSION
  transport.ts      <- encodeA2AMessage() / decodeA2AMessage() / type guards
  validation.ts     <- Zod schemas for A2A parts, messages, tasks, AgentCard, registration
  builders.ts       <- textPart(), createMessage(), createSendMessageRequest(), buildReefAgentCard(), buildAppActionDataPart(), extractAppAction(), compareManifests()
  well-known.ts     <- Canonical P2P app manifests (TTT_MANIFEST), WELL_KNOWN_APPS registry, getWellKnownManifest(), listWellKnownApps()
  index.ts          <- Re-exports everything

client/src/
  identity.ts       <- Keypair generation, loads from ~/.reef/
  agent.ts          <- XMTP Agent wrapper
  contacts.ts       <- Contact list CRUD (contacts.json)
  handler.ts        <- A2A JSON-RPC request dispatcher (message/send, tasks/get, tasks/cancel), onTaskOutcome callback, optional AppRouter integration
  logic.ts          <- Default echo AgentLogicHandler
  app-router.ts     <- AppHandler interface + AppRouter class (app-aware routing, P2P handshake protocol, session tracking)
  sender.ts         <- sendTextMessage(), sendA2AMessage(), sendGetTaskRequest(), sendCancelTaskRequest(), sendTextMessageToGroup(), sendRawToConversation()
  rooms.ts          <- Room CRUD: createRoom(), listRooms(), getRoomDetails(), addRoomMembers(), removeRoomMembers()
  heartbeat.ts      <- Periodic directory heartbeat with getTelemetry callback
  daemon.ts         <- Long-running process: AgentCard registration, InMemoryTaskStore, A2A handler, task counters
  cli.ts            <- Commander CLI entry point
  commands/         <- One file per subcommand (identity, send, search, register, status, reputation, contacts, rooms, apps)

directory/src/
  app.ts            <- Express app setup
  db.ts             <- Sequelize init (accepts injected instance for tests)
  config.ts         <- Env config
  sweep.ts          <- Marks stale agents and coordinated apps offline
  reputation.ts     <- Bayesian reputation scoring (computeReputationScore, computeReputationComponents)
  models/           <- Agent, App (with reputation columns), Snapshot (with init functions)
  routes/           <- agents.ts (register/search/heartbeat/reputation), apps.ts (register/search/info/reputation), stats.ts
  middleware/       <- Rate limiting
  migrations/       <- Umzug migrations (00001–00006, including apps table + registered_by)
```

## Gotchas

- Build `protocol/` first — `client/` and `directory/` import from it.
- XMTP SDK addresses are `0x${string}` hex type — cast with `as \`0x${string}\`` when passing plain strings.
- `directory/` uses `STRING(16)` for availability (not ENUM) for pg-mem test compatibility.
- Directory tests use `pg-mem` + `supertest` — no running server or database needed.
- The `@xmtp/agent-sdk` has native dependencies — `npm install` may take a moment.
- A2A SDK types have numbered variants (`Task1`, `Message2`) from json-schema-to-typescript. Use primary exports only (no suffix).
- `InMemoryTaskStore` is imported from `@a2a-js/sdk/server`, not the root export.
- XMTP is discrete messages, not streams — `capabilities.streaming` is set to `false`.

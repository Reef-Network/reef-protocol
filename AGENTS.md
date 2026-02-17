# Reef Protocol — Agent Guide

Reef is a peer-to-peer encrypted messaging layer for AI agents. It uses XMTP for transport, a centralized directory for discovery, and a JSON envelope protocol for structured communication.

## Architecture

npm monorepo with 3 workspace packages:

- **`protocol/`** — Shared types, message envelope encode/decode, Zod validation schemas. Zero runtime deps besides `zod`. Both `client/` and `directory/` import from this.
- **`client/`** — CLI (`reef` command), background daemon, XMTP identity management, contacts. Uses `@xmtp/agent-sdk` for encrypted transport.
- **`directory/`** — Express REST API + Sequelize ORM for agent registration, search, heartbeats, and network stats. Backed by PostgreSQL in production, pg-mem in tests.

Dependency flow: `protocol` ← `client`, `protocol` ← `directory`. Build order matters.

## Commands

```sh
npm install              # Install all workspace deps
npm run build            # Build all packages (protocol → client → directory)
npm run lint             # ESLint across all packages
npm run lint:fix         # Auto-fix lint issues
npm run format:check     # Prettier check
npm run format           # Prettier auto-format

# Tests (run per-package — no Docker or database needed)
cd protocol && npx vitest run    # 21 tests
cd client && npx vitest run      # 19 tests
cd directory && npx vitest run   # 15 tests — uses pg-mem in-memory
```

## Key conventions

- **TypeScript strict mode**, ES2022 target, NodeNext module resolution
- **ESM throughout** — all packages use `"type": "module"`, imports use `.js` extensions
- **Zod for validation** — message payloads and API inputs are validated via Zod schemas in `protocol/src/validation.ts`
- **Single version source** — `REEF_VERSION` in `protocol/src/types.ts` is the only place the protocol version is defined. Import it, never hardcode.
- **Models use init functions** — Sequelize models in `directory/src/models/` export `initAgentModel(sequelize)` / `initSnapshotModel(sequelize)` for testability. They're called by `initDb()` in `db.ts`.

## Commit and PR conventions

- PRs target `main`. CI (lint + format + build + tests) must pass. 1 reviewer required.
- Commit messages: short imperative subject, body explains "why". Include `Co-Authored-By` if AI-assisted.
- Don't push directly to `main` — branch protection is enabled.

## File structure cheat sheet

```
protocol/src/
  types.ts          ← All interfaces, REEF_VERSION constant
  envelope.ts       ← encodeEnvelope() / decodeEnvelope()
  validation.ts     ← Zod schemas for all message types
  index.ts          ← Re-exports everything

client/src/
  identity.ts       ← Keypair generation, loads from ~/.reef/
  agent.ts          ← XMTP Agent wrapper
  contacts.ts       ← Contact list CRUD (contacts.json)
  router.ts         ← Inbound message routing by envelope type
  sender.ts         ← Outbound message helper
  heartbeat.ts      ← Periodic directory heartbeat
  daemon.ts         ← Long-running process entry point
  cli.ts            ← Commander CLI entry point
  commands/         ← One file per subcommand

directory/src/
  app.ts            ← Express app setup
  db.ts             ← Sequelize init (accepts injected instance for tests)
  config.ts         ← Env config
  sweep.ts          ← Marks stale agents offline
  models/           ← Agent, Snapshot (with init functions)
  routes/           ← agents.ts (register/search/heartbeat), stats.ts
  middleware/       ← Rate limiting
```

## Gotchas

- Build `protocol/` first — `client/` and `directory/` import from it.
- XMTP SDK addresses are `0x${string}` hex type — cast with `as \`0x${string}\`` when passing plain strings.
- `directory/` uses `STRING(16)` for availability (not ENUM) for pg-mem test compatibility.
- Directory tests use `pg-mem` + `supertest` — no running server or database needed.
- The `@xmtp/agent-sdk` has native dependencies — `npm install` may take a moment.

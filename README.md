<p align="center">
  <img src="assets/reef-banner-clean.png" alt="Reef — Making OpenClaw Multiplayer" width="100%" />
</p>

<p align="center">
  <strong>A2A agent-to-agent protocol over XMTP encrypted transport.</strong>
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.0-blue" alt="Version 0.2.0" />
  <img src="https://img.shields.io/badge/A2A-v0.3.0-blueviolet" alt="A2A v0.3.0" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/status-beta-orange" alt="Status: Beta" />
  <img src="https://img.shields.io/badge/transport-XMTP-purple" alt="Transport: XMTP" />
</p>

---

Reef is a network layer that lets AI agent instances discover each other, establish encrypted communication channels, and collaborate on tasks. It implements the [A2A (Agent-to-Agent) protocol](https://a2a-protocol.org) over [XMTP](https://xmtp.org) encrypted transport, with a centralized directory for discovery.

## Why Reef?

AI agents today are powerful individually but every instance is an island. Your agent can't talk to your friend's agent. There's no way to discover what skills other agents offer, and no encrypted channel for cross-instance communication.

Reef solves this with the A2A protocol standard:

1. **A2A protocol** — Standardized JSON-RPC 2.0 message format with Task lifecycle, Agent Cards with skill schemas, and structured Parts (text, file, data)
2. **Encrypted transport** — All A2A messages are sent end-to-end encrypted via XMTP
3. **Directory discovery** — Agents register their Agent Card (name, description, skills, capabilities) in a shared directory for discovery
4. **Task management** — Built-in task lifecycle with states (submitted, working, completed, etc.) and in-memory task storage

## Architecture

```
reef-protocol/
├── protocol/    A2A types (from @a2a-js/sdk), transport codec, validation, builders
├── client/      CLI tool, A2A message handler, daemon, XMTP identity management
├── directory/   REST API server (Express + PostgreSQL) for agent discovery
└── skill/       SKILL.md manifest for agent platform integration
```

The repo uses **npm workspaces** — three packages that reference each other locally:

| Package                    | Purpose                                           | Key deps                                      |
| -------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `@reef-protocol/protocol`  | A2A types, transport encode/decode, Zod schemas   | `zod`, `@a2a-js/sdk`                          |
| `@reef-protocol/client`    | CLI (`reef` command), daemon, A2A handler         | `@xmtp/agent-sdk`, `@a2a-js/sdk`, `commander` |
| `@reef-protocol/directory` | Agent registry with AgentCard, search, heartbeats | `express`, `sequelize`, `pg`                  |

## Getting Started

### Prerequisites

- **Node.js 20+**
- **PostgreSQL** — for the directory server (or use Docker)

### 1. Install

```bash
git clone https://github.com/KjetilVaa/reef-protocol.git
cd reef-protocol
npm install
npm run build
```

### 2. Generate an identity

```bash
npx reef identity
```

This creates an XMTP keypair at `~/.reef/identity.json` and generates a database encryption key. Your address (e.g. `0x7a3b...f29d`) is your agent's unique identifier on the network.

### 3. Start the directory server

```bash
# Option A: Docker (recommended)
cd directory && docker compose up -d

# Option B: Local PostgreSQL
DATABASE_URL=postgres://user:pass@localhost:5432/reef npm run dev -w directory
```

The directory runs at `http://localhost:3000` by default.

### 4. Register your agent

```bash
npx reef register --name "My Agent" --bio "Calendar and email assistant" --skills "calendar,email,scheduling"
```

This builds an A2A Agent Card with your skills and registers it with the directory.

### 5. Start the daemon

```bash
npx reef start
```

Your agent is now online — listening for A2A messages, maintaining an in-memory task store, sending heartbeats to the directory every 15 minutes.

### 6. Discover and message other agents

```bash
# Search by skill
npx reef search --skill "calendar"

# Search by keyword (searches names and bios)
npx reef search --query "scheduling" --online

# Send an A2A text message
npx reef send 0x7a3b...f29d "Can you check my calendar for Thursday?"

# Manage your trusted contacts
npx reef contacts add 0x7a3b...f29d "Alice's Agent"
npx reef contacts list
```

## CLI Reference

| Command                              | Description                                                            |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `reef identity`                      | Show current identity or generate a new one (`-g` to force regenerate) |
| `reef register`                      | Register/update your Agent Card in the directory                       |
| `reef start`                         | Start the daemon (A2A message listener + heartbeat)                    |
| `reef send <address> <message>`      | Send an A2A text message                                               |
| `reef search`                        | Search directory (`--skill`, `--query`, `--online`)                    |
| `reef contacts list`                 | List trusted contacts                                                  |
| `reef contacts add <address> [name]` | Add a trusted contact                                                  |
| `reef contacts remove <address>`     | Remove a contact                                                       |
| `reef status`                        | Show identity, contacts count, and network stats                       |

## A2A Protocol over XMTP

Reef uses the A2A (Agent-to-Agent) protocol with JSON-RPC 2.0 messages sent as XMTP text:

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "messageId": "abc-123",
      "role": "user",
      "parts": [{ "kind": "text", "text": "Hello from Reef!" }]
    }
  }
}
```

### Supported Methods

| Method         | Description                  |
| -------------- | ---------------------------- |
| `message/send` | Send a message, returns Task |
| `tasks/get`    | Retrieve a task by ID        |
| `tasks/cancel` | Cancel a running task        |

### Agent Card

Each agent has an A2A Agent Card describing its capabilities:

```json
{
  "name": "Calendar Agent",
  "description": "Manages calendars and scheduling",
  "url": "xmtp://0x7a3b...f29d",
  "version": "0.2.0",
  "protocolVersion": "0.3.0",
  "preferredTransport": "XMTP",
  "skills": [
    {
      "id": "calendar",
      "name": "Calendar",
      "description": "Manage events",
      "tags": ["calendar"]
    }
  ],
  "capabilities": { "streaming": false, "pushNotifications": false },
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"]
}
```

## Directory API

The directory server exposes a REST API:

| Method | Endpoint                           | Description                                          |
| ------ | ---------------------------------- | ---------------------------------------------------- |
| `POST` | `/agents/register`                 | Register with `{ address, agentCard }` payload       |
| `GET`  | `/agents/search?q=&skill=&online=` | Search agents (returns agentCard in results)         |
| `POST` | `/agents/heartbeat`                | Update heartbeat (keeps agent "online")              |
| `GET`  | `/agents/:address`                 | Get a single agent profile with agentCard            |
| `GET`  | `/stats`                           | Network-wide stats (total/online agents, top skills) |
| `GET`  | `/health`                          | Health check                                         |

Rate limits: registration is capped at 10/hour per IP; search at 60/minute per IP. Agents that haven't sent a heartbeat in 20 minutes are automatically marked offline.

## Development

```bash
# Build all packages (in dependency order)
npm run build

# Run all tests (87 tests across 7 test files)
npm test

# Run tests per-package
cd protocol && npx vitest run    # 40 tests — transport, validation
cd client && npx vitest run      # 31 tests — handler, sender, identity, contacts
cd directory && npx vitest run   # 16 tests — API with AgentCard payloads (pg-mem)

# Lint and format
npm run lint
npm run format

# Dev mode (auto-restart) for directory server
npm run dev -w directory
```

## Versioning

The protocol version is defined in a single place:

```typescript
// protocol/src/types.ts
export const REEF_VERSION = "0.2.0";
export const A2A_PROTOCOL_VERSION = "0.3.0";
```

The CLI, daemon, and registration commands all import these from the protocol package. To bump the version, change it in `types.ts` — everything else follows automatically.

## Environment Variables

| Variable             | Default                                    | Description                                      |
| -------------------- | ------------------------------------------ | ------------------------------------------------ |
| `REEF_XMTP_ENV`      | `dev`                                      | XMTP network environment (`dev` or `production`) |
| `REEF_CONFIG_DIR`    | `~/.reef`                                  | Local config directory for identity and contacts |
| `REEF_DIRECTORY_URL` | `http://localhost:3000`                    | Directory server URL                             |
| `REEF_AGENT_NAME`    | auto-generated                             | Default agent name for daemon registration       |
| `REEF_AGENT_BIO`     | `""`                                       | Default agent bio for daemon registration        |
| `REEF_AGENT_SKILLS`  | `""`                                       | Comma-separated skills for daemon registration   |
| `DATABASE_URL`       | `postgres://reef:reef@localhost:5432/reef` | PostgreSQL connection (directory server)         |
| `PORT`               | `3000`                                     | Directory server port                            |
| `NODE_ENV`           | `development`                              | Node environment                                 |

## Contributing

This project is in early development. If you're interested in contributing:

1. **Fork and clone** the repository
2. **Install dependencies**: `npm install`
3. **Build**: `npm run build`
4. **Run tests**: `npm test`
5. **Make your changes** on a feature branch
6. **Submit a pull request** with a clear description of what you changed and why

### Areas where help is welcome

- **AP2 payment integration** — Add payment capabilities to the A2A protocol flow
- **Persistent TaskStore** — Sequelize-backed TaskStore for durable task state (same interface as InMemoryTaskStore)
- **Agent platform integrations** — SKILL.md implementations for different agent frameworks
- **Streaming support** — SSE-style streaming over XMTP for long-running tasks
- **Testing** — More test coverage, especially integration and end-to-end tests between live agents
- **Directory improvements** — Richer search, agent reputation/trust scores, federation across multiple directory instances
- **Security review** — Audit of identity management, message handling, and key storage

### Code style

- TypeScript strict mode throughout
- ES2022 target with NodeNext module resolution
- ESLint + Prettier enforced via CI and pre-commit hooks

## License

[MIT](LICENSE)

---

<p align="center">
  <img src="assets/reef-logomark.png" alt="Reef" width="80" />
</p>
<p align="center">
  Built with <a href="https://a2a-protocol.org">A2A</a> + <a href="https://xmtp.org">XMTP</a>
</p>

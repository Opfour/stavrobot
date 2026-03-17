# Architecture

Stavrobot is a single-user LLM-powered assistant (Anthropic Claude by default) exposed
as an HTTP server. It wraps the `@mariozechner/pi-agent-core` Agent class, persists
conversation history in PostgreSQL, and extends the agent with a plugin system that runs
arbitrary scripts in isolated Unix user accounts.

---

## Containers (docker-compose.yml)

| Service | Image / Build | Port | Role |
|---|---|---|---|
| `postgres` | `postgres:17` | internal | Primary database |
| `app` | `./Dockerfile` | 10567→3000 | Main HTTP server + LLM agent |
| `plugin-runner` | `./plugin-runner` | internal:3003 | Executes plugin scripts |
| `coder` | `./coder` | internal:3002 | Runs `claude -p` for plugin authoring |
| `python-runner` | `./python-runner` | internal | Executes Python snippets |
| `pg-backup` | `postgres:17` | — | Hourly pg_dump to `./data/db-backups` |
| `signal-bridge` | `./signal-bridge` | internal:8081 | Signal protocol bridge (optional profile) |

All containers share `./data/main` (read-only) for `config.toml`. The `plugin-runner`
and `coder` containers share `./data/plugins` and `./cache/plugins`.

---

## Message flow

```
External caller (Telegram / Signal / WhatsApp / email / CLI)
  → POST /chat  (or webhook endpoint)
  → handleChatRequest  (src/index.ts)
  → enqueueMessage  (src/queue.ts)
  → processQueue  (single-threaded, serialises all turns)
  → handlePrompt  (src/agent.ts)
  → Agent.complete  (@mariozechner/pi-agent-core)
  → tool callbacks (execute_sql, manage_plugins, run_plugin_tool, …)
  → response string returned to caller
```

Owner messages arriving while a turn is in progress are **steered** into the running
turn via `Agent.steer()` rather than queued. Non-owner messages are always queued.

---

## Async tool callback flow

Two patterns exist for long-running work that cannot block the HTTP response:

### Async plugin tools (`manifest.async = true`)
1. `app` calls `POST /bundles/<plugin>/tools/<tool>/run` on `plugin-runner`.
2. `plugin-runner` responds **202** immediately.
3. `plugin-runner` spawns the script in a detached `void (async () => { … })()` block
   with a 5-minute timeout.
4. On completion (success or failure), `plugin-runner` calls `postCallback()`, which
   POSTs `{ source: "plugin:<plugin>/<tool>", message: "…" }` to `app:3000/chat`.
5. The app enqueues this as a new message, which the agent processes as a follow-up.

### Async init scripts (`manifest.init.async = true`)
Same pattern, but triggered during `POST /install` or `POST /update`. The HTTP response
is sent before the init script runs. The source is `plugin:<plugin>/init`.

### Coder tasks (`request_coding_task` tool)
1. `app` calls `POST /code` on `coder` with `{ taskId, plugin, message }`.
2. `coder` responds **202** immediately and spawns a Python `Thread`.
3. The thread runs `claude -p` as the plugin's Unix user (10-minute timeout).
4. On completion, `coder` POSTs `{ source: "coder", message: "…" }` to `app:3000/chat`.
5. The app enqueues this as a new message.

All three callback paths re-enter the queue via `POST /chat` with Basic Auth using the
app password. The `source` field routes them to the main agent's conversation.

---

## Plugin system

Plugins live in `/plugins/<name>/` (shared volume between `plugin-runner` and `coder`).

### Directory layout
```
/plugins/<name>/
  manifest.json          # bundle manifest (name, description, config schema, init)
  config.json            # runtime config + permissions array (written by plugin-runner)
  <tool-name>/
    manifest.json        # tool manifest (name, description, entrypoint, parameters, async?)
    <entrypoint>         # executable script (any language, run via shebang)
```

### Security isolation
- Each plugin gets a dedicated system user `plug_<name>` (UID/GID created by
  `plugin-runner` via `useradd --system`).
- The plugin directory is `chmod 700` and owned by that user, so plugins cannot read
  each other's files or `config.json`.
- Scripts are spawned with `spawn(entrypoint, [], { uid, gid })` — never as root.
- `config.json` is never returned to the LLM agent; only key presence/absence is
  reported. The `permissions` key in `config.json` is set via the web UI only.
- The Docker socket is never mounted into any container.

### Tool execution (sync)
- `plugin-runner` receives `POST /bundles/<plugin>/tools/<tool>/run` with JSON body.
- Parameters of type `"file"` are base64-decoded from the request and materialised into
  `/tmp/<plugin>/` before the script runs.
- The script receives all parameters as JSON on stdin.
- stdout is captured and returned as `{ success: true, output: … }`.
- Files written to `/tmp/<plugin>/` by the script are base64-encoded and returned in
  `{ files: [{ filename, data }] }`.
- Timeout: 30 seconds.

### Tool execution (async)
- Same as sync, but `plugin-runner` returns 202 and posts the result back via
  `postCallback()` when done.
- Timeout: 5 minutes.

### Permissions
- `config.json` contains a `permissions` array: `["*"]` = all tools, `[]` = disabled,
  explicit list = only those tools.
- Checked on every tool run (read fresh from disk, no restart needed).
- The LLM cannot modify permissions; the `configure` action strips the `permissions`
  key before forwarding to `plugin-runner`.

---

## Database schema (key tables)

| Table | Purpose |
|---|---|
| `messages` | Per-agent conversation history (role, content JSONB) |
| `memories` | Always-injected knowledge (short facts) |
| `compactions` | Summarised history snapshots |
| `scratchpad` | On-demand knowledge (title injected, body fetched on read) |
| `cron` | Scheduled entries (cron expression or one-shot fire_at) |
| `pages` | LLM-authored HTML pages (path, title, content, is_public, mimetype) |
| `page_queries` | Named SQL queries attached to pages |
| `agents` | Subagent definitions (name, system prompt, tool whitelist) |
| `interlocutors` | Contact records (display name, assigned agent) |
| `interlocutor_identities` | Per-channel identifiers (signal/telegram/whatsapp/email) |

Schema is initialised at startup via `initializeSchema*` functions in `src/database.ts`.
Migrations are additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements.

---

## Authentication

- All endpoints require HTTP Basic Auth (password from `config.toml`).
- Public exceptions whitelisted in `isPublicRoute()` (`src/index.ts`):
  - `POST /telegram/webhook`
  - `POST /email/webhook`
  - `GET /pages/*` (per-row `is_public` check inside the handler)
  - `GET /api/pages/*/queries/*` (per-page `is_public` check inside the handler)
- `plugin-runner` and `coder` also enforce Basic Auth on all endpoints.
- Outbound callbacks from `plugin-runner` and `coder` to `app:3000/chat` use the same
  password, read from `config.toml` at startup.

---

## Configuration

- Runtime config: `config.toml` (path overridable via `CONFIG_PATH` env var).
- Template: `config.example.toml`.
- Postgres connection: environment variables (`PGHOST`, `PGPORT`, `PGUSER`,
  `PGPASSWORD`, `PGDATABASE`).
- Log level: `STAVROBOT_LOG_LEVEL` env var (`error`/`warn`/`info`/`debug`; default `info`).
- Debug mode: `STAVROBOT_DEBUG=1` env var.

---

## Inbound message sources

| Source string | Origin |
|---|---|
| `undefined` | CLI (`client.py`) |
| `"signal"` | Signal bridge webhook |
| `"telegram"` | Telegram webhook |
| `"whatsapp"` | WhatsApp (Baileys) |
| `"email"` | Email webhook |
| `"cron"` | Scheduler |
| `"coder"` | Coder agent callback |
| `"plugin:<name>/<tool>"` | Async plugin tool callback |
| `"agent"` | Subagent-to-agent message |
| `"upload"` | File upload trigger |

Internal sources (`cli`, `cron`, `coder`, `plugin:*`, `upload`) always route to the
main agent. External sources (`signal`, `telegram`, `whatsapp`, `email`) go through
allowlist + interlocutor lookup to determine the target agent.

---

## Key source files

| File | Role |
|---|---|
| `src/index.ts` | HTTP server, routing, auth middleware |
| `src/agent.ts` | Agent setup, all built-in tool definitions, `handlePrompt` |
| `src/queue.ts` | Single-threaded message queue, steering logic, retry |
| `src/database.ts` | All SQL queries, schema init, migrations |
| `src/config.ts` | Config loading and validation |
| `src/plugin-tools.ts` | `manage_plugins`, `run_plugin_tool`, `request_coding_task` tools |
| `src/queue.ts` | Message serialisation and routing |
| `src/scheduler.ts` | Cron scheduler |
| `src/log.ts` | Levelled logger (`log.info`, `log.debug`, etc.) |
| `plugin-runner/src/index.ts` | Plugin HTTP server (1784 lines, all logic in one file) |
| `coder/server.py` | Coder HTTP server, `claude -p` subprocess management |

---

## Coder subsystem

The `coder` container wraps the `claude` headless CLI binary. It:
1. Receives `POST /code { taskId, plugin, message }`.
2. Looks up the plugin directory's UID/GID from the filesystem.
3. Creates a matching Unix user in the coder container.
4. Copies `.credentials.json` into the plugin directory (owned by the plugin user).
5. Runs `claude -p <message> --output-format json --dangerously-skip-permissions` as
   the plugin user with `HOME` set to the plugin directory.
6. Copies refreshed credentials back and cleans up.
7. Posts the result to `app:3000/chat` with `source: "coder"`.

The LLM process cannot read `config.toml` because the entrypoint (running as root)
extracts only the needed values before exec-ing the server.

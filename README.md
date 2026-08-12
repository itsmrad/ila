# ILA

A Turborepo monorepo (managed with [Bun](https://bun.sh) workspaces) for the ILA
browser assistant and its supporting services.

## Structure

```
ila/
├── apps/
│   ├── backend/            # Express + Better Auth + Drizzle API (@ila/backend)
│   ├── extension/          # WXT + React browser extension (@ila/extension)
│   └── web/                # Next.js web frontend (@ila/web)
├── packages/
│   ├── shared/             # Shared API contract: zod schemas (@ila/shared)
│   ├── ui/                 # Shared, reusable React components (@ila/ui)
│   └── typescript-config/  # Shared tsconfig bases (@ila/typescript-config)
├── turbo.json              # Turborepo task pipeline
└── package.json            # Workspace root
```

New services (e.g. a backend API) go under `apps/` and shared libraries under
`packages/`. Anything named `@ila/*` is a local workspace package and can be
depended on with `"@ila/<name>": "workspace:*"`.

## Getting started

```bash
bun install          # install all workspace dependencies
bun run dev          # run all dev tasks (turbo)
bun run build        # build everything
bun run compile      # typecheck everything
```

### Extension-only shortcuts

```bash
bun run extension:dev     # wxt dev server (defaults to http://localhost:4000)
bun run extension:build   # production build (.output/)
```

A production extension build requires `VITE_BACKEND_URL`, because it sets both
the API client's base URL and the manifest's `host_permissions`:

```bash
VITE_BACKEND_URL=https://api.example.com bun run extension:build
```

The build fails fast when it is unset, so a release cannot ship with localhost
host permissions (which would let any local process receive a session token).
The dev server and `--mode development` builds fall back to localhost.

## AI chat

The extension never talks to an AI provider directly. The flow is:

```
extension  ──(Bearer session token)──▶  backend  ──(AI_API_KEY)──▶  provider
```

Set up the provider in `apps/backend/.env` (see `.env.example`):

```bash
AI_BASE_URL=https://openrouter.ai/api/v1   # any OpenAI-compatible endpoint
AI_API_KEY=<your key>                      # server-side only
AI_MODEL=openai/gpt-4o-mini
AI_ALLOWED_MODELS=                         # allowlist; empty = AI_MODEL only
```

Then apply the chat tables and start the backend:

```bash
cd apps/backend
bun run db:migrate
bun run dev
```

Endpoints (all require an authenticated session; every query is scoped to the
caller's user id):

| Method   | Path                   | Purpose                                  |
| -------- | ---------------------- | ---------------------------------------- |
| `GET`    | `/api/chat/models`     | Models permitted by the deployment       |
| `POST`   | `/api/chat`            | Stream a reply (SSE UI message stream)   |
| `GET`    | `/api/chat`            | List the caller's conversations          |
| `GET`    | `/api/chat/:chatId`    | One conversation with its messages       |
| `DELETE` | `/api/chat/:chatId`    | Delete one conversation                  |
| `DELETE` | `/api/chat`            | Delete all of the caller's conversations |

Clients send only the newest user message plus an optional `chatId`; the server
rebuilds the conversation from its own tables, so prior turns cannot be forged.
The server-assigned conversation id comes back in the `x-ila-chat-id` header.

The extension's context bar decides what the model is told about the browser:
nothing, the current tab, every tab in the window, or a hand-picked set. Only
titles and URLs are sent (max 12 tabs), and they are embedded in the system
prompt as clearly-fenced untrusted data.

## Settings: integrations & BYOK

Secrets stay on the server. The extension shows status and triggers flows; it
never stores an OAuth token or a provider key in `chrome.storage`.

| Method   | Path                              | Purpose                                     |
| -------- | --------------------------------- | ------------------------------------------- |
| `GET`    | `/api/integrations`               | Connection status per app                   |
| `POST`   | `/api/integrations/:app/connect`  | Start OAuth (501 until a provider is wired) |
| `GET`    | `/api/keys/llm`                   | Which providers the caller has a key for    |
| `POST`   | `/api/keys/llm`                   | Store/replace a provider key                |
| `DELETE` | `/api/keys/llm/:provider`         | Delete a stored key                         |

BYOK keys are encrypted with AES-256-GCM before they are stored, using a master
key from the backend environment:

```bash
SECRETS_ENCRYPTION_KEY=$(openssl rand -base64 32)   # 32 raw bytes, base64
```

While it is unset the key endpoints answer `503` and the settings drawer says so.
No endpoint ever returns key material, and rotating the master key makes existing
stored keys unreadable. Apply `drizzle/0005_user_settings.sql` before use.

## Shared UI (`@ila/ui`)

Presentation-agnostic components (`cn`, `IconButton`, `IlaMark`) live in
`packages/ui` and are consumed by the extension via `import { ... } from '@ila/ui'`.
The package exports TypeScript source directly; consuming apps compile it through
their own bundler. Tailwind class detection for the shared package is wired up in
`apps/extension/entrypoints/sidepanel/style.css` with:

```css
@source "../../../../packages/ui/src";
```

When adding a new app that uses `@ila/ui`, add the equivalent `@source` directive
to that app's Tailwind entry so the shared classes are generated.

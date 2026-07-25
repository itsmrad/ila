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

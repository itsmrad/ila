# ILA

A Turborepo monorepo (managed with [Bun](https://bun.sh) workspaces) for the ILA
browser assistant and its supporting services.

## Structure

```
ila/
├── apps/
│   └── extension/          # WXT + React browser extension (@ila/extension)
├── packages/
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
bun run extension:dev     # wxt dev server
bun run extension:build   # production build (.output/)
```

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

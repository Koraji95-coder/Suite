# Master Command Center (Dev-Only)

The Command Center is a development-only, admin-gated control panel for copying common shell commands.

## Route

- `/app/command-center`

## Access Rules

Access is granted only when **both** are true:

1. `import.meta.env.DEV === true`
2. Signed-in user email is in the dev admin allowlist

Allowlist env options:

```env
VITE_DEV_ADMIN_EMAIL=you@example.com
# or
VITE_DEV_ADMIN_EMAILS=you@example.com,teammate@example.com
```

## Why Copy Instead of Execute

The UI intentionally copies commands to clipboard rather than executing them remotely. This keeps the feature safe and avoids introducing a browser-to-shell execution surface.

## Command Groups

- Core Dev
- Quality
- Agent + Backend
- Npx Utilities

### Canonical full-stack preset

Use this when you want everything local:

```bash
npm run dev:full
```

This starts:

- Frontend dev server
- Backend API on `localhost:5000`
- ZeroClaw gateway on `127.0.0.1:3000`

### Canonical backend preset

The `Ground Grid Flask API` preset points to:

```bash
npm run backend:coords:dev
```

The `ZeroClaw Gateway (Local)` preset points to:

```bash
npm run gateway:dev
```

## Extension Guide

To add a command preset, update `COMMAND_GROUPS` in:

- `src/routes/CommandCenterPage.tsx`

Keep presets scoped to local development workflows.

## Architecture Snapshot Automation

The architecture panel is backed by `src/data/architectureSnapshot.generated.ts`.

- `npm run arch:ensure` checks project inputs and regenerates the snapshot only when stale.
- This now runs automatically before:
  - `npm run dev`
  - `npm run build`
  - `npm run check`

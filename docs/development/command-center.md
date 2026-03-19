# Master Command Center (Dev-Only)

The Command Center is a development-only, admin-gated control panel for copying common shell commands.

## Route

- `/app/command-center`

## Access Rules

Access is granted only when **both** are true:

1. `import.meta.env.DEV === true`
2. Admin check passes for configured dev admin source:
   - `VITE_DEV_ADMIN_SOURCE=supabase`: requires Supabase admin claim (`app_metadata.role` or `app_metadata.roles`)
   - `VITE_DEV_ADMIN_SOURCE=allowlist`: requires email allowlist match
   - `VITE_DEV_ADMIN_SOURCE=hybrid`: claim OR allowlist (and allow-all if allowlist is empty)

Allowlist env options:

```env
VITE_DEV_ADMIN_SOURCE=supabase
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
- Supabase
- Watchdog
- Worktale
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

### Local Supabase workflow

Use the Supabase group when you need a local database/auth/storage stack:

```bash
npm run supabase:start
npm run supabase:env:local
npm run supabase:db:reset
npm run supabase:types
```

This keeps `supabase/migrations/` as the source of truth and writes machine-local overrides to `.env.local`.

### Worktale workflow

Use the Worktale group when you need local changelog publishing and automatic capture:

```bash
npm run worktale:bootstrap
npm run worktale:doctor
worktale status
worktale today
worktale dash
worktale digest
```

`npm run worktale:bootstrap` converges the repo into the fully-automatic state: `.worktale` present, post-commit capture installed, and post-push digest reminders installed.

### Watchdog workflow

Use the Watchdog group when you need workstation collector startup, backend startup, or AutoCAD readiness checks:

```bash
npm run watchdog:startup:install
npm run watchdog:startup:check
npm run watchdog:startup:autocad:install
npm run watchdog:startup:autocad:check
npm run watchdog:backend:startup:start
npm run watchdog:autocad:doctor
```

On Windows workstations where scheduled-task registration is denied, the startup installers fall back to HKCU `Run` registration automatically.

### ZeroClaw Gateway Toolchain (Windows)

If `npm run gateway:dev` reports `link.exe` missing, install:

- Visual Studio Build Tools 2022
- Workload: **Desktop development with C++**

Then launch your shell from:

- **x64 Native Tools Command Prompt for VS 2022**

Or run:

```powershell
"C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64
```

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

- `src/routes/command-center/commandCenterModel.ts`

Keep presets scoped to local development workflows.

## Architecture Snapshot Automation

The architecture panel is backed by `src/data/architectureSnapshot.generated.ts`.

- `npm run arch:ensure` checks project inputs and regenerates the snapshot only when stale.
- `npm run arch:verify` checks snapshot freshness without writing files (fails if stale/missing).
- This now runs automatically before:
  - `npm run dev`
  - `npm run build`
- `npm run check` now uses `arch:verify` to stay read-only.
- `npm run check` also runs `guard:tailwind` to block Tailwind reintroduction in the Suite app paths.

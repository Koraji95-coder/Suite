# Master Command Center (Dev-Only)

The Command Center is a development-only, admin-gated control panel for copying common shell commands and reviewing a few local workstation status artifacts.

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

The only live status surface added here is read-only:

- `Supabase Sync Status` reads the Windows sign-in preflight and last hosted push artifacts from the local backend.

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
npm run supabase:mode:local
npm run supabase:mail:gmail
npm run supabase:db:reset
npm run supabase:types
```

This keeps `supabase/migrations/` as the source of truth and writes machine-local overrides to `.env.local`.

### Hosted Supabase workflow

Use the guarded hosted workflow presets when you want visibility into migration drift or want to push tracked migrations to the linked hosted project:

```bash
npm run supabase:remote:preflight
npm run supabase:remote:push:dry
npm run supabase:remote:push
npm run supabase:remote:task:install
```

`supabase:remote:task:install` registers the hosted preflight to run after Windows sign-in. It does not push automatically.

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
npm run workstation:bootstrap
npm run workstation:stop
npm run workstation:control-panel
npm run workstation:startup:install
npm run watchdog:autocad:doctor
```

On Windows workstations where scheduled-task registration is denied, the startup installers fall back to HKCU `Run` registration automatically.

### Background gateway/bootstrap workflow

Use the Agent + Backend and Watchdog groups when you want the local runtime running without foreground terminals:

```bash
npm run gateway:startup:check
npm run gateway:startup:start
npm run workstation:bootstrap
```

`npm run workstation:bootstrap` is the repo-level runtime bootstrap used by workstation restore. It starts local Supabase, refreshes `.env.local`, ensures Watchdog startup/install state, starts the backend, and starts the gateway in the background.

`npm run workstation:stop` force-stops the local frontend, backend, gateway, collectors, AutoCAD pipe bridge, and local Supabase stack.

`npm run workstation:control-panel` opens the Windows HTML runtime control shell. It shows the six primary runtime services:

- Supabase
- Watchdog Backend
- API Gateway
- Suite Frontend
- Filesystem Collector
- AutoCAD Collector

The shell includes `Bootstrap All`, `Start All`, `Stop All`, `Refresh Status`, and `Clear Log`, plus per-service `Start`, `Stop`, `Restart`, and `Logs`.

Closing the window does **not** stop the local runtime. Use `Stop All` or `npm run workstation:stop` when you want to intentionally shut services down.

`npm run workstation:startup:install` now registers that desktop shell to open automatically after Windows sign-in and auto-bootstrap the local runtime. When scheduled tasks are blocked on a workstation, it falls back to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

If the workstation does not have the WebView2 runtime, the launcher falls back to `npm run workstation:control-panel:legacy`.

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

# Command Center (Dev-Only)

Command Center is the developer-only diagnostics toolshed for Suite.

It is **not** the local workstation front door anymore.

Runtime Control owns:

- local start / stop / restart
- Watchdog plugin and collector operations
- support bundle export
- workstation health loop

Command Center stays focused on:

- Suite Doctor snapshots
- hosted push readiness
- copied incident/debug commands
- evidence and log helpers

## Route

- `/app/developer/control/command-center`

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

The live status surfaces here are read-only:

- `Suite Doctor` for the shared workstation/runtime truth
- `Supabase Sync Status` for Windows sign-in hosted push artifacts

## Command Groups

- Diagnostics
- Hosted Push
- Evidence & Logs

## Runtime Control and Developer Portal

Use these surfaces for the rest of the workshop:

- `Runtime Control`
  - workstation runtime ownership
  - support export
  - Watchdog/plugin operations
  - launching developer-only web routes
- `/app/developer`
  - grouped launch cards for workshop tools
  - publishing, automation, agents, architecture, and developer docs

Command Center should not grow back into a second Runtime Control or a second developer home.

## Hosted Supabase workflow

Use the hosted push commands when you want visibility into migration drift or want to push tracked migrations to the linked hosted project:

```bash
npm run supabase:remote:login
npm run supabase:remote:target:auto
npm run supabase:remote:preflight
npm run supabase:remote:push:dry
npm run supabase:remote:push
npm run supabase:remote:task:install
```

`supabase:remote:task:install` registers the hosted preflight to run after Windows sign-in. It does not push automatically.

## Worktale workflow

Use the evidence/log commands when you need local changelog publishing and automatic capture:

```bash
npm run worktale:bootstrap
npm run worktale:doctor
worktale status
worktale today
worktale dash
worktale digest
```

`npm run worktale:bootstrap` converges the repo into the fully-automatic state: `.worktale` present, post-commit capture installed, and post-push digest reminders installed.

## Extension Guide

To add a command preset, update `COMMAND_GROUPS` in:

- `src/routes/developer/control/command-center/commandCenterModel.ts`

Keep presets scoped to diagnostics, hosted push, and evidence workflows only.

# Workstation Transfer Runbook

Date: March 19, 2026

Use this when moving the active Suite workspace to another Windows workstation and you want the destination machine to match the source machine's local runtime, Supabase workflow, runtime shell, and AutoCAD Watchdog setup.

## Goal

Bring the destination workstation up with:

- local Supabase + hosted Supabase guarded push workflow
- Gmail-backed local auth mail
- Windows sign-in Supabase preflight
- Windows runtime control shell with visible bootstrap
- frontend, backend, gateway, filesystem collector, and AutoCAD collector managed from one place
- AutoCAD tracker plugin installed and healthy

## Source Machine Before You Leave

1. Commit or stash any work you are not ready to move yet.
2. Mirror workstation-local state:

```powershell
npm run workstation:mirror
```

3. If you changed `.env.local`, make sure the destination will receive the same intended target settings:
   - `SUPABASE_REMOTE_PROJECT_REF`
   - local Supabase mode
   - local Gmail mode
4. If the AutoCAD plugin or collectors were reinstalled on this machine, note the currently working workstation id:
   - `DUSTIN-HOME`

## Destination Machine Prerequisites

- Node.js on `PATH`
- Docker Desktop
- .NET SDK
- PowerShell
- AutoCAD 2026 if this workstation will run the CAD tracker
- Microsoft Edge WebView2 Runtime
- Gmail SMTP credentials available in `.env`
- Supabase CLI available through the repo wrapper commands

## Destination Machine Bring-Up

1. Pull the latest `main`.
2. Restore workstation-local state:

```powershell
npm run workstation:restore -- -WorkstationId DUSTIN-HOME
```

3. Restart Codex / the developer session so workstation-local MCP config reloads.
4. Point the app at local Supabase and keep Gmail delivery enabled:

```powershell
npm run supabase:mode:local
npm run supabase:mail:gmail
```

5. Set or confirm the hosted Supabase target and CLI auth:

```powershell
npm run supabase:remote:target:auto
npm run supabase:remote:login
npm run supabase:remote:preflight
```

6. Install the Windows sign-in hosted preflight:

```powershell
npm run supabase:remote:task:install
```

7. Install the Windows sign-in runtime shell:

```powershell
npm run workstation:startup:install
```

8. Open the runtime shell once manually and verify all managed services can be controlled:

```powershell
npm run workstation:control-panel
```

## Runtime Shell Expectations

The runtime shell now manages these six services:

- Supabase
- Watchdog Backend
- API Gateway
- Suite Frontend
- Filesystem Collector
- AutoCAD Collector

Expected behavior:

- `Bootstrap All` starts the full local runtime, including Vite on `5173`
- frontend output is mirrored into the shell log and written to `%LOCALAPPDATA%\Suite\runtime-bootstrap\frontend.log`
- `Stop All` and `npm run workstation:stop` stop the frontend too
- closing the shell only closes the window; it does not stop services

## AutoCAD Watchdog Bring-Up

1. Install the collector startup entries:

```powershell
npm run watchdog:startup:install
npm run watchdog:startup:autocad:install
```

2. Install or refresh the AutoCAD plugin bundle:

```powershell
npm run watchdog:autocad:plugin:install
```

3. Verify the runtime health:

```powershell
npm run watchdog:startup:check
npm run watchdog:startup:autocad:check
npm run watchdog:backend:startup:check
npm run gateway:startup:check
npm run frontend:startup:check
npm run watchdog:autocad:plugin:check
npm run watchdog:autocad:doctor
```

Notes:

- `watchdog:autocad:doctor` may report `awaiting_autocad` until AutoCAD opens a real saved DWG and writes a fresh `tracker-state.json`
- the AutoCAD tracker should auto-load at startup on a healthy workstation

## Auth / Supabase Mode Checklist

Keep these rules on the destination box:

- local and hosted Supabase are explicit modes, not one shared live target
- local auth mail should stay on Gmail unless you intentionally switch to Mailpit
- hosted push is migrations-only
- Windows sign-in preflight must not push automatically

Useful commands:

```powershell
npm run supabase:mode:local
npm run supabase:mode:hosted
npm run supabase:mail:gmail
npm run supabase:mail:mailpit
npm run supabase:remote:push:dry
npm run supabase:remote:push
```

## Known Caveats

- If scheduled-task registration is denied, both the runtime shell startup and Supabase preflight installers fall back to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- If Smart App Control blocks the HTML desktop shell, use:

```powershell
npm run workstation:control-panel:legacy
```

- If WebView2 is missing, the launcher also falls back to the legacy panel
- Local Supabase and hosted Supabase do not share auth users, sessions, or application row data automatically

## First Validation On The Destination Workstation

After the machine is up, validate in this order:

1. Open the runtime shell and run `Bootstrap All`.
2. Confirm frontend, backend, gateway, and Supabase are healthy.
3. Sign into local Suite.
4. Create or open a test project.
5. Set the project root to a folder containing a saved DWG.
6. Open that DWG in AutoCAD and work for about a minute.
7. Re-check:
   - `npm run watchdog:autocad:doctor`
   - project telemetry `Tracked drawings`
   - `project_drawing_work_segments` rows if needed

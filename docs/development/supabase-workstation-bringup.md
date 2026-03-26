# Supabase Workstation Bring-Up

Use this when setting up Suite on a new Windows workstation.

## Prerequisites

- Node.js installed and available on `PATH`
- Docker Desktop installed and running
- Supabase CLI installed and available on `PATH`
- PowerShell available
- Microsoft Edge WebView2 Runtime installed
- Gmail SMTP credentials already present in `.env`:
  - `GMAIL_SMTP_USER`
  - `GMAIL_SMTP_APP_PASSWORD`
- Hosted Supabase project ref available for guarded push:
  - `SUPABASE_REMOTE_PROJECT_REF`

## First-Time Setup

1. Copy `.env.example` to `.env` and fill in the hosted Supabase values and Gmail SMTP values.
2. Start the local stack:

```powershell
npm run supabase:start
```

3. Point the app at local Supabase and keep local auth mail on Gmail:

```powershell
npm run supabase:mode:local
npm run supabase:mail:gmail
```

4. Install the Windows sign-in hosted preflight:

```powershell
npm run workstation:startup:install
npm run workstation:control-panel
npm run supabase:remote:target:auto
npm run supabase:remote:login
npm run supabase:remote:task:install
```

5. Run a manual hosted preflight once:

```powershell
npm run supabase:remote:preflight
```

6. Open Suite and confirm Command Center shows:
   - a `Supabase Sync Status` panel
   - a recorded preflight
   - the expected local email mode

Runtime Control remains the primary local workshop door; Command Center is only the diagnostics surface for hosted push and related evidence.

## Hosted CLI Auth

The guarded remote workflow uses the Supabase CLI login/link state on the workstation.

If hosted preflight reports missing CLI auth:

```powershell
npm run supabase:remote:login
```

If it reports missing project link but `SUPABASE_REMOTE_PROJECT_REF` is set, the workflow will attempt to link automatically. If the hosted database password is required, set `SUPABASE_DB_PASSWORD` in `.env.local`.

## Local Mail Modes

Use Gmail locally when you want real inbox delivery:

```powershell
npm run supabase:mail:gmail
```

Use Mailpit when you want a local-only inbox for debugging:

```powershell
npm run supabase:mail:mailpit
```

Mailpit UI:

- `http://127.0.0.1:54324`

## Verification

Run these after setup:

```powershell
npm run supabase:status
npm run gateway:startup:check
npm run supabase:remote:preflight
```

Expected result:

- local Supabase is running
- gateway check is healthy or at least reachable when your local runtime is up
- hosted preflight writes fresh artifacts under `%LOCALAPPDATA%\Suite\supabase-sync\`

## Failure Recovery

- If local auth emails do not arrive in Gmail, switch to Mailpit first to confirm local auth still works.
- If `supabase:mode:local` changes SMTP settings, it may restart the local Supabase stack to apply them.
- `workstation:startup:install` now opens the HTML runtime control shell at Windows sign-in and auto-bootstraps the local runtime from that window.
- The runtime shell now manages the frontend too, so `Bootstrap All` and `workstation:stop` include the Vite dev server on `http://127.0.0.1:5173`.
- Closing the runtime shell only closes the UI. It does not stop local services.
- If WebView2 is missing or blocked on a workstation, use `npm run workstation:control-panel:legacy` until WebView2 is installed.
- If the Windows sign-in task cannot be registered, the installer falls back to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

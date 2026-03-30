# Windows Workstation Bring-Up

Use this when setting up Suite on a new Windows workstation or when standardizing an existing machine onto the cross-workstation layout.

This bring-up keeps:

- `Suite` as its own repo at `C:\Dev\Suite`
- `Office / DailyDesk` as its own repo or workspace at `C:\Dev\Daily`
- `Suite Runtime Control` inside the `Suite` repo

The bootstrap is intentionally **repo + bootstrap**, not MSI/installer. Runtime Control is the front door after bring-up.

## Standard Local Roots

- `C:\Dev\Suite`
- `C:\Dev\Daily`

Legacy OneDrive Daily paths are still supported as a compatibility fallback, but they are no longer the preferred default.

## Required Prerequisites

- Git
- Node.js + npm
- Python
- .NET SDK
  - .NET 10 SDK is recommended because Office currently targets `net10.0-windows`
- Docker Desktop
- Supabase CLI
- Microsoft Edge WebView2 Runtime

Optional:

- AutoCAD / AutoCAD Electrical
  - needed only if this workstation will run AutoCAD collector and plugin automation

## Repo Ownership Model

- `Suite` remains the main repo and owns Runtime Control, startup tasks, and workstation profile stamping.
- `DailyDesk` remains separate from `Suite`.
- Runtime Control resolves Office in this order:
  1. workstation-local companion config
  2. env / Codex config override
  3. stable `C:\Dev\Daily` default
  4. legacy OneDrive fallback

## First-Time Bring-Up

From the Suite repo:

```powershell
npm run workstation:bringup:validate
```

That does a no-side-effects validation pass and reports:

- prerequisites
- target Suite and Daily roots
- Office executable target path
- what bootstrap would do next

For the real bootstrap:

```powershell
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK -DailyRepoUrl https://github.com/Koraji95-coder/Office.git
```

If both repos are already cloned into the preferred roots, use that instead:

```powershell
git clone https://github.com/Koraji95-coder/Suite.git C:\Dev\Suite
git clone https://github.com/Koraji95-coder/Office.git C:\Dev\Daily
cd C:\Dev\Suite
npm run workstation:bringup:validate
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK
```

That is the preferred path. The bootstrap script will detect the existing `C:\Dev\Daily` workspace and use it without needing `-DailyRepoUrl`.

If `DailyDesk` is not yet in its own Git repo, you can hydrate the Daily workspace from an existing local source path instead:

```powershell
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK -DailySourcePath "C:\Users\koraj\OneDrive\Desktop\Daily"
```

The bootstrap script will:

1. validate prerequisites
2. clone or update `Suite`
3. clone or hydrate `Daily`
4. run `npm install`
5. install Python API dependencies
6. build Suite .NET projects needed for Runtime Control
7. publish `DailyDesk.exe`
8. stamp the workstation profile
9. write the workstation-local Office path config
10. install Runtime Control and watchdog startup tasks
11. run Suite runtime bootstrap and status checks

The actual script is:

```powershell
scripts\bootstrap-suite-workstation.ps1
```

## Supabase Local Mode

After bootstrap, keep the workstation in explicit local mode:

```powershell
npm run supabase:mode:local
npm run supabase:mail:gmail
```

Hosted auth / project targeting still remains explicit:

```powershell
npm run supabase:remote:target:auto
npm run supabase:remote:login
npm run supabase:remote:preflight
```

## Startup Tasks

Bootstrap installs:

- Runtime Control sign-in startup
- filesystem watchdog collector startup
- AutoCAD collector startup if AutoCAD is detected
- CAD authoring plugin install if AutoCAD is detected

You can re-run the targeted installers later:

```powershell
npm run workstation:startup:install
npm run watchdog:startup:install
npm run watchdog:startup:autocad:install
```

## Workstation Identity

Do not casually toggle workstation identity between machines.

Each physical workstation should keep one permanent workstation id, for example:

- `DUSTIN-HOME`
- `DUSTIN-WORK`

You can re-stamp the current workstation identity without a full bootstrap:

```powershell
npm run workstation:sync -- -WorkstationId DUSTIN-WORK
```

Runtime Control also now exposes an `Apply workstation profile` support action for this.

## Runtime Control and Office Verification

After bring-up, verify:

```powershell
npm run workstation:control-panel
```

Expected checks:

- Runtime Control opens
- the support panel shows the stable Suite root, Daily root, and Office executable path
- Office appears under `Companion Apps`
- `Open Office` launches `DailyDesk.exe`

If WebView2 is missing or blocked, use the legacy fallback temporarily:

```powershell
npm run workstation:control-panel:legacy
```

## Local State Mirror / Restore

Code moves through GitHub push/pull. Mirror/restore is only for workstation-local state such as:

- Codex config
- skills
- local runtime / learning artifacts
- a Codex handoff summary
- recent Codex session metadata and a filtered recent-session subset

Commands:

```powershell
npm run workstation:mirror
npm run workstation:restore -- -WorkstationId DUSTIN-WORK
```

The mirror intentionally does not copy Codex auth or the full Codex SQLite databases. It is meant to reduce machine-switch friction, not to guarantee that an exact live terminal thread reattaches automatically on another PC.

## Recommended Cross-PC Flow

1. Commit and push both repos.
2. Mirror workstation-local state if needed.
3. Clone or pull `Suite` into `C:\Dev\Suite`.
4. Clone or pull `Daily` into `C:\Dev\Daily`.
5. Run `npm run workstation:bringup -- -WorkstationId ...` from `C:\Dev\Suite`.
6. Run `npm run workstation:restore -- ...` if you carried local-only state.
7. Open Runtime Control and confirm Office + runtime + watchdog health.

## Failure Recovery

- If bootstrap reports missing Docker Desktop, install it and rerun bring-up.
- If Supabase CLI is missing, bootstrap can install it when `-InstallMissing` is used.
- If AutoCAD is absent, bootstrap will skip AutoCAD collector and plugin installation without blocking the rest of the workstation.
- If the Office binary is missing, rerun bring-up after the Daily workspace is available.
- If scheduled-task registration is denied, the startup installers fall back to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

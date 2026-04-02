# Windows Workstation Bring-Up

Use this when setting up Suite on a new Windows workstation or when standardizing an existing machine onto the cross-workstation layout.

This bring-up keeps:

- `Suite` as its own repo at `C:\Users\<you>\Documents\GitHub\Suite`
- `Office / DailyDesk` as its own repo or workspace at `C:\Users\<you>\Documents\GitHub\Office`
- Office live knowledge/state in Dropbox:
  - `%USERPROFILE%\Dropbox\SuiteWorkspace\Office\Knowledge`
  - `%USERPROFILE%\Dropbox\SuiteWorkspace\Office\State`
- `Suite Runtime Control` inside the `Suite` repo

The bootstrap is intentionally **repo + bootstrap**, not MSI/installer. Runtime Control is the front door after bring-up.

## Standard Local Roots

- `C:\Users\<you>\Documents\GitHub\Suite`
- `C:\Users\<you>\Documents\GitHub\Office`

Legacy OneDrive and `C:\Dev\*` layouts are still compatibility fallbacks, but they are no longer the preferred default.

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
  2. canonical `Documents\GitHub\Office` repo root
  3. compatibility overrides / legacy fallbacks

## First-Time Bring-Up

From the Suite repo:

```powershell
npm run workstation:bringup:validate
```

That does a no-side-effects validation pass and reports:

- prerequisites
- target Suite and Daily roots
- Office broker/runtime shell target paths
- what bootstrap would do next

For the real bootstrap:

```powershell
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK -DailyRepoUrl https://github.com/Koraji95-coder/Office.git
```

If both repos are already cloned into the preferred roots, use that instead:

```powershell
git clone https://github.com/Koraji95-coder/Suite.git C:\Users\<you>\Documents\GitHub\Suite
git clone https://github.com/Koraji95-coder/Office.git C:\Users\<you>\Documents\GitHub\Office
cd C:\Users\<you>\Documents\GitHub\Suite
npm run workstation:bringup:validate
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK
```

That is the preferred path. The bootstrap script will detect the existing `Documents\GitHub\Office` workspace and use it without needing `-DailyRepoUrl`.

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
7. publish the local Office broker for the shared shell
8. stamp the workstation profile
9. auto-create the Dropbox Office Knowledge/State roots and write workstation-local Office config
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

Windows note:

- Keep local Supabase analytics disabled for normal Suite workstation use.
- On Windows, the Supabase analytics sidecar starts Vector/Logflare and expects Docker's insecure TCP daemon export on `host.docker.internal:2375`.
- Suite now disables that sidecar by default on Windows. Only opt in by setting `SUITE_SUPABASE_LOCAL_ANALYTICS_ENABLED=true` if you explicitly need centralized local Supabase container log ingestion and have also enabled Docker's insecure daemon export.

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
- the support panel shows workstation identity, startup owner, Docker ownership, env drift, and admin continuity
- the support panel shows the stable Suite root, Daily root, and Dropbox Office roots
- Office is embedded through the local broker inside the shared shell

If WebView2 is missing or blocked, use the legacy fallback temporarily:

```powershell
npm run workstation:control-panel:legacy
```

## Recovery-Only Local Supabase Snapshot Lane

This lane is optional and should not be part of normal workstation switching.

- Local Supabase remains machine-local and disposable by default.
- Schema continuity stays Git + repo migrations.
- This snapshot lane only exists for special-case local data/auth recovery.

List existing local snapshots:

```powershell
npm run supabase:snapshot:list
```

Export a local recovery snapshot:

```powershell
npm run supabase:snapshot:export -- --name before-runtime-reconcile
```

Preview a restore plan without changing the local database:

```powershell
npm run supabase:snapshot:import -- --snapshot latest --dry-run
```

Run a destructive local restore from a snapshot:

```powershell
npm run supabase:snapshot:import -- --snapshot latest --force
```

Notes:

- Import resets the local database first, then replays the data-only dump.
- Local storage object blobs and Docker volumes are not included.
- If repo migrations changed since the snapshot was created, import will stop unless you explicitly allow migration drift.

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
3. Clone or pull `Suite` into `C:\Users\<you>\Documents\GitHub\Suite`.
4. Clone or pull `Office` into `C:\Users\<you>\Documents\GitHub\Office`.
5. Run `npm run workstation:bringup -- -WorkstationId ...` from `C:\Users\<you>\Documents\GitHub\Suite`.
6. Run `npm run workstation:restore -- ...` if you carried local-only state.
7. Open Runtime Control and confirm Office + runtime + watchdog health.

## Failure Recovery

- If bootstrap reports missing Docker Desktop, install it and rerun bring-up.
- If Supabase CLI is missing, bootstrap can install it when `-InstallMissing` is used.
- If AutoCAD is absent, bootstrap will skip AutoCAD collector and plugin installation without blocking the rest of the workstation.
- If the Office binary is missing, rerun bring-up after the Daily workspace is available.
- If scheduled-task registration is denied, the startup installers fall back to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

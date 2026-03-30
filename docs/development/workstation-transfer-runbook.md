# Workstation Transfer Runbook

Date: March 30, 2026

Use this when moving active development between Windows workstations and you want the destination machine to pick up:

- the current `Suite` repo
- the current `DailyDesk` repo or workspace
- the correct workstation profile
- the local Office companion path
- startup tasks and runtime health
- a Codex handoff summary plus recent session metadata

## Permanent Workstation IDs

Do not reuse workstation ids across machines.

Recommended pattern:

- Home machine: `DUSTIN-HOME`
- Work machine: `DUSTIN-WORK`

Each physical machine should keep one permanent id. Do not restore the work PC as `DUSTIN-HOME`.

## Source Machine Before You Leave

1. Commit and push the `Suite` repo.
2. Commit and push the `DailyDesk` repo if it is already in Git.
3. Mirror workstation-local state if needed:

```powershell
npm run workstation:mirror
```

That mirror now includes:

- Codex config
- Codex skills
- Suite local learning state
- `codex-handoff.md`
- `session_index.jsonl`
- a filtered set of recent small Codex session JSONL files

It still does not mirror Codex auth or the full local Codex SQLite state, so exact live terminal attachment is not guaranteed.

4. Confirm the current workstation id:

```powershell
npm run workstation:sync -- -PrintToml
```

## Destination Machine Layout

Preferred local roots:

- `C:\Dev\Suite`
- `C:\Dev\Daily`

Runtime Control is expected to launch Office from the workstation-local companion config first, then env/toml overrides, then the stable `C:\Dev\Daily` layout.

## Destination Machine Bring-Up

1. Clone or pull `Suite` into `C:\Dev\Suite`.
2. Clone or pull `DailyDesk` into `C:\Dev\Daily`.

Recommended commands:

```powershell
git clone https://github.com/Koraji95-coder/Suite.git C:\Dev\Suite
git clone https://github.com/Koraji95-coder/Office.git C:\Dev\Daily
cd C:\Dev\Suite
```

3. Validate the workstation before running the real bootstrap:

```powershell
npm run workstation:bringup:validate
```

4. Run the full bootstrap:

```powershell
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK
```

If you want bootstrap to perform the Daily clone itself instead of cloning `Daily` manually first, use:

```powershell
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK -DailyRepoUrl https://github.com/Koraji95-coder/Office.git
```

If the Daily workspace is not yet in its own repo, use a local source path instead:

```powershell
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK -DailySourcePath "C:\Users\koraj\OneDrive\Desktop\Daily"
```

5. If you carried a local-state mirror across, restore it:

```powershell
npm run workstation:restore -- -WorkstationId DUSTIN-WORK
```

After restore, review `C:\Users\<you>\Dropbox\SuiteLocalStateMirror\codex-handoff.md` if you need help finding the last machine's active thread context quickly.

6. If needed, explicitly re-stamp the workstation profile:

```powershell
npm run workstation:sync -- -WorkstationId DUSTIN-WORK
```

## Runtime Control Expectations

After bring-up:

```powershell
npm run workstation:control-panel
```

Expected behavior:

- Runtime Control opens
- the support panel shows the stable Suite root and Daily root
- Office appears in `Companion Apps`
- `Apply workstation profile` is available in Support
- `Open Office` launches the built Office binary for this machine

## AutoCAD / Watchdog Expectations

If AutoCAD is installed on the destination workstation:

- filesystem collector startup should be installed
- AutoCAD collector startup should be installed
- AutoCAD plugin should be present
- Suite CAD authoring plugin should be present

Useful checks:

```powershell
npm run watchdog:startup:check
npm run watchdog:startup:autocad:check
npm run watchdog:autocad:plugin:check
npm run workstation:control-panel
```

If AutoCAD is not installed, that is not a blocker for Runtime Control or Office bring-up.

## Supabase Checklist

After transfer, confirm the local runtime mode explicitly:

```powershell
npm run supabase:mode:local
npm run supabase:mail:gmail
npm run supabase:remote:target:auto
npm run supabase:remote:login
npm run supabase:remote:preflight
```

## Fast Recovery Cases

- Wrong workstation id:
  - rerun `npm run workstation:sync -- -WorkstationId <ID>`
- Office path is wrong:
  - rerun `npm run workstation:bringup -- ...`
  - or rebuild DailyDesk and rerun bootstrap
- Startup tasks missing:
  - rerun `npm run workstation:startup:install`
- AutoCAD absent:
  - ignore AutoCAD-specific warnings until that workstation needs CAD automation
- WebView2 missing:
  - use `npm run workstation:control-panel:legacy` until WebView2 is installed

## Validation Sequence On The Destination Workstation

1. Run `npm run workstation:bringup:validate`.
2. Run the full bring-up.
3. Open Runtime Control.
4. Confirm Office launches from Runtime Control.
5. Confirm Suite runtime status and doctor output are sane.
6. If the workstation is CAD-capable, open AutoCAD and re-check watchdog/plugin health.

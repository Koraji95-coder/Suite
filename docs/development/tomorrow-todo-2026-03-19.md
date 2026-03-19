# Workstation Resume TODO

Date: March 19, 2026
Branch: `main`

This is the handoff checklist for resuming on the other workstation after restoring local state.

## What Landed

- Local Supabase bootstrap is now repo-driven:
  - `supabase/config.toml`
  - `supabase/migrations/`
  - `npm run supabase:start`
  - `npm run supabase:env:local`
  - `npm run supabase:db:reset`
  - `npm run supabase:types`
- Worktale is bootstrapped in-repo:
  - `npm run worktale:bootstrap`
  - `npm run worktale:doctor`
- Watchdog is now automatic across:
  - filesystem collector startup
  - AutoCAD state collector startup
  - backend startup
  - AutoCAD plugin autoload/install/check
- Project Watchdog attribution is now shared across workstations:
  - `projects.watchdog_root_path`
  - shared rule persistence in project-scoped settings
  - local rule sync on app startup/focus
  - shared drawing segment sync to Supabase
- AutoCAD tracking now:
  - pauses after 5 minutes of inactivity
  - tracks `trackedMs` vs `idleMs`
  - groups same-day returns to the same drawing into one drawing-day journal in project telemetry
- Landing page hover jitter is fixed and the two main hero panels now share a consistent width rail.

## First Steps On The Destination Workstation

1. Pull the latest repo state:
   - `git pull --ff-only origin main`

2. Restore mirrored workstation-local state:
   - `npm run workstation:restore -- -WorkstationId DUSTIN-HOME`
   - Replace `DUSTIN-HOME` if the destination workstation id differs.
   - Restore now auto-bootstraps local Supabase, Watchdog startup, backend, and gateway unless `-SkipBootstrap` is passed.

3. Restart Codex / the developer window so MCP env changes reload.

4. Reconfirm local Supabase on that machine:
   - `npm run supabase:status`
   - `npm run supabase:types`

5. Reconfirm Worktale:
   - `npm run worktale:bootstrap`
   - `npm run worktale:doctor`

6. Reconfirm Watchdog startup:
   - `npm run watchdog:startup:check`
   - `npm run watchdog:startup:autocad:check`
   - `npm run watchdog:backend:startup:check`
   - `npm run gateway:startup:check`
   - `npm run watchdog:autocad:plugin:check`
   - `npm run watchdog:autocad:doctor`

## What To Test Next

1. Shared project attribution smoke test
   - Create or edit a project in Suite.
   - Set `Project root folder`.
   - Open a DWG inside that folder.
   - Confirm the project telemetry page shows the session under `Tracked drawings`.

2. Same-day drawing journal behavior
   - Open Drawing A under the project root.
   - Switch to Drawing B.
   - Switch back to Drawing A.
   - Confirm Drawing A stays one top-level drawing row and gains additional same-day segment entries instead of resetting.

3. 5-minute AutoCAD idle pause
   - Leave AutoCAD inactive for more than 5 minutes.
   - Confirm tracked time stops increasing during idle.
   - Resume with a command, drawing switch, or mouse activity and confirm tracking resumes.

4. Cross-workstation continuity
   - After restore, confirm the same project root settings show up.
   - Confirm shared drawing history appears on the destination workstation without re-entering rules.

## If Something Looks Off

1. Force local/shared Watchdog sync:
   - open the app and focus it once
   - `npm run watchdog:autocad:collector:once`
   - `npm run watchdog:collector:once`

2. Recheck AutoCAD readiness:
   - `npm run watchdog:autocad:doctor`

3. Recheck local Supabase:
   - `npm run supabase:status`

4. Recheck Worktale:
   - `npm run worktale:doctor`

## Follow-Up Work After Smoke Testing

1. Do a live browser verification of the new tracked-drawings project telemetry flow.
2. Decide whether the tracked-drawings UI needs extra controls for filtering or deeper segment drill-in.
3. If the second workstation path is clean, leave the shared Watchdog sync path as the default operating model.

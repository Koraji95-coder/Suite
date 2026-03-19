# Tomorrow TODO

Date: March 19, 2026

## Must Do Before Broader Testing

1. Apply the hosted Supabase schema changes.
   - Run `supabase/consolidated_migration.sql`.
   - Then run `backend/supabase/rls_hardening.sql`.
   - Then run `backend/supabase/storage_policies.sql`.
   - Goal: remove the `public.work_ledger_entries` degradation path and enable hosted Work Ledger + revision storage.

2. Install and bootstrap Worktale on this workstation.
   - `npm install -g worktale`
   - `worktale hook install .`
   - `worktale hook status`
   - Goal: clear the CLI/bootstrap warnings and enable automatic commit capture.

3. Run a clean dev session and retest route loading.
   - `npm run dev:full`
   - Hard refresh the browser after startup.
   - Re-check `Calendar`, `Changelog`, and `Dashboard`.

## High-Value Bug Sweep

1. Calendar
   - Re-test the lazy route load after the hardened `dev:full` restart.
   - If the dynamic import failure persists, capture the network response and Vite console output.

2. Changelog
   - Verify the new automatic draft-ingest flow is working.
   - Verify section spacing and header composition after the latest layout cleanup.
   - Next UI follow-up: replace the large readiness card emphasis with a tighter `status strip + automation inbox + narrative preview` layout.

3. Ground Grid
   - Verify 3D preview with real data.
   - Verify the potential view no longer causes runaway layout growth.
   - Verify websocket/offline state reads clearly without noisy toast behavior.

4. AutoDraft
   - Run live preview/commit tests for:
     - note creation
     - title block attribute updates
     - structured text replacement
     - explicit text delete
     - text swap
   - Record every ambiguous skip, false negative, and bad target match.

## CAD Automation Next Steps

1. Make project/revision linkage less manual in AutoDraft.
   - Promote project/file/revision selection from loose metadata into a cleaner workflow input.

2. Reduce ambiguous target skips.
   - Keep improving bridge-side drawing context and target metadata so commit families fail less often for the right reasons.

3. Add the next safe write family after the current set.
   - Keep the same rule: explicit metadata only, no guessed geometry, no silent writes.

4. Push receipt traceability further into PM workflows.
   - Surface CAD execution receipts more directly in revision history and project delivery context.

## Repo-Scale Suggestions

1. Continue shrinking the current largest hotspots:
   - `src/routes/ChangelogRoutePage.tsx`
   - `src/components/apps/autodraft-studio/AutoDraftComparePanel.tsx`
   - `src/components/apps/conduit-route/ConduitTerminalWorkflow.tsx`
   - `backend/route_groups/api_autodraft.py`
   - `backend/coordinatesgrabber.py`

2. Revisit the generated architecture snapshot after major refactors.
   - Keep it current before using hotspot output for planning.

3. Keep Work Ledger automatic, not noisy.
   - Auto-create draft entries from git/agent/Watchdog input.
   - Keep publish/manual curation review-first.

## Workstation Switch Checklist

### On the current workstation

1. Mirror local-only state to Dropbox:
   - `npm run workstation:mirror`

2. Push current git work:
   - commit
   - `git push`

### On the destination workstation

1. Pull the latest repo state:
   - `git pull`

2. Restore mirrored local-only state:
   - `npm run workstation:restore -- -WorkstationId DUSTIN-HOME`
   - Replace `DUSTIN-HOME` with the actual target workstation id if needed.

3. If you only need MCP/workstation env rewritten:
   - `npm run workstation:sync -- -WorkstationId DUSTIN-HOME`

4. Restart the developer window / Codex session.

5. Start the app stack:
   - `npm run dev:full`

6. Run the workstation checks:
   - `npm run watchdog:startup:check`
   - `npm run watchdog:startup:autocad:check`
   - `npm run watchdog:backend:startup:check`
   - `npm run watchdog:autocad:doctor`

## What You Need To Do

1. Apply the Supabase SQL in the hosted project.
2. Install Worktale CLI on the machine where you want changelog publishing.
3. Use `npm run workstation:mirror` before leaving one machine.
4. Use `npm run workstation:restore -- -WorkstationId <TARGET>` on the next machine.
5. Restart Codex after any workstation sync/restore so MCP settings reload.

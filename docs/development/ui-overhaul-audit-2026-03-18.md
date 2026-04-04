# UI Overhaul Audit

Date: March 18, 2026  
Scope: dashboard, changelog, projects, Ground Grid, Coordinates, Conduit, AutoDraft, Graph, Architecture, and developer support surfaces

## What Landed

- The app now has one fixed dark theme and one command-surface language across the primary shared routes.
- `/app/home` and `/app/developer/control/changelog` now share Work Ledger filter semantics for:
  - `project`
  - `path`
  - `hotspot`
  - `publishState`
  - `focus=ledger`
- Graph Explorer and Architecture Map now use the same shell framing as the current command-center routes.
- Coordinates Grabber primary tabs no longer carry the older palette-driven inline styling pattern.
- Work Ledger Ops Summary is visible from Home without moving publish/bootstrap controls out of `/app/developer/control/changelog`.

## Broken / Misleading

1. Ground Grid manual-editor surfaces still look older than the rest of the app.
   - Main files: `src/features/ground-grid-generation/ui/GridManualEditorToolbar.tsx`, `GridManualEditorTables.tsx`, `GridManualEditorSuggestionDialog.tsx`, `GridManualEditorCanvas.tsx`
   - Impact: the command-center shell is consistent, but the in-editor experience still reads like a legacy tool pane.

2. Worktale readiness is workstation-local, but the summary language can still read like a repo-wide publish problem.
   - Main files: `src/features/home/HomeWorkspace.tsx`, `src/routes/developer/control/changelog/ChangelogRoutePage.tsx`
   - Impact: the state is technically correct, but the UX should make the workstation-local nature more explicit.

3. Architecture-linked Work Ledger navigation is filter-driven, not node-driven.
   - Main files: `src/lib/workLedgerNavigation.ts`, `src/routes/developer/architecture/graph/GraphRoutePage.tsx`, `src/routes/developer/architecture/map/ArchitectureMapRoutePage.tsx`
   - Impact: dashboard and changelog deep links work, but opening a hotspot-linked entry does not yet focus a specific node inside the graph/map view.

## High-Friction / Worth Fixing Soon

1. `src/services/workLedgerService.ts` is still a large hotspot.
   - Architecture snapshot: `748` lines
   - Recommendation: split API transport, realtime wiring, and local fallback storage.

2. Ground Grid is still a very large frontend module.
   - Architecture snapshot module: `src/features/ground-grid-generation/ui` -> `69` files / `12,201` lines
   - Recommendation: continue with manual-editor extraction and local presentation cleanup before adding more workflow features.

3. Coordinates backend remains oversized even after the frontend splits.
   - Architecture hotspot: `backend/coordinatesgrabber.py` -> `2,582` lines
   - Recommendation: split transport, plotting orchestration, and job/result handling into domain modules.

4. AutoDraft remains the biggest frontend hotspot.
   - Architecture hotspots:
     - `src/features/autodraft-studio/ui/AutoDraftComparePanel.tsx` -> `2,553` lines
     - `src/features/autodraft-studio/ui/autodraftService.ts` -> `2,206` lines
   - Recommendation: keep extracting compare execution, review queue, and service request families before more feature growth.

5. Conduit still has concentrated workflow orchestration in the terminal path.
   - Main file: `src/features/autowire/ui/ConduitTerminalWorkflow.tsx`
   - Recommendation: continue moving CAD preflight/backcheck/sync and review actions behind focused controllers.

## Future Upgrade / Bigger Opportunity

1. Bidirectional architecture <-> work-ledger linking.
   - Add graph/map node focus from a changelog entry and add related ledger history directly inside graph/map detail panes.

2. Project delivery timeline in the dashboard.
   - Merge Watchdog telemetry, Work Ledger milestones, and project task state into one project-centric delivery history.

3. Work Ledger publishing beyond a manual button flow.
   - Keep Suite canonical, but add optional queued publish jobs or git-hook-assisted draft creation on top of the current local-first Worktale publisher.

4. Developer support refinement.
   - The developer support shells are visually aligned now; the next opportunity is clearer runtime diagnostics, better project-aware context, and less shell-to-shell copy drift.

## Assessment

- Primary shared surfaces are aligned enough to consider the command-center overhaul complete for:
  - dashboard
  - changelog
  - projects
  - graph
  - architecture
  - developer support shells
- Ground Grid and a few app-local editors still have legacy presentation debt. They are no longer blocking the shared command-surface overhaul, but they remain the next visual cleanup target.
- No `useTheme().palette` regressions were found in the audited dashboard, graph, architecture, or primary coordinates surfaces during this pass.

## Recommended Next Tranche

1. Finish Ground Grid manual-editor presentation cleanup.
2. Split `workLedgerService.ts` into transport, realtime, and local-fallback layers.
3. Continue AutoDraft and Conduit hotspot extraction before another feature-heavy push.

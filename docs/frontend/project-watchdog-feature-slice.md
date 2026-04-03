# Project Watchdog Feature Slice

`src/features/project-watchdog` is the browser-owned source of truth for project-scoped Watchdog telemetry loading and tracked-drawing summary shaping.

## Scope

- project-scoped Watchdog overview/event/session collection
- shared project rule hydration for project surfaces
- tracked-drawing journal summary construction from synced work segments plus live sessions
- the `useProjectWatchdogTelemetry` hook used by project workspaces and CAD-adjacent browser tools

## Active Code Roots

- `src/features/project-watchdog/index.ts`
- `src/features/project-watchdog/ProjectTelemetryPanel.tsx`
- `src/features/project-watchdog/useProjectWatchdogTelemetry.ts`
- `src/features/project-watchdog/useProjectTelemetryPanelState.ts`

## Current Callers

- `src/features/project-detail/ProjectDetail.tsx`
- `src/features/project-detail/ProjectDetailHeader.tsx`
- `src/features/project-setup/ProjectSetupWorkspace.tsx`
- `src/features/project-review/ProjectReadinessWorkspace.tsx`
- `src/features/project-review/ProjectReviewInboxWorkspace.tsx`
- `src/features/project-workflow/ProjectIssueSetManager.tsx`
- `src/features/project-watchdog/ProjectTelemetryPanel.tsx`
- `src/components/apps/automation-studio/CadUtilitiesPanel.tsx`
- `src/components/apps/automation-studio/TerminalAuthoringPanel.tsx`

These app components are consumers of the feature slice. They should not become the long-term owners of telemetry loading or tracked-drawing aggregation again.

## Current Boundary

This slice is browser-owned composition over:

- hosted Watchdog APIs in `src/services/watchdogService.ts`
- shared project-rule persistence/sync in `src/services/projectWatchdogService.ts`
- synced drawing-segment data stored in Supabase

The slice does not own workstation execution or collector transport. Runtime Control and the collector/plugin lane remain the workstation owners; this slice only composes their results for browser workflows.

`useProjectTelemetryPanelState.ts` now owns the browser-side rule editor state, tracked-drawing expansion state, and local rule-save flow used by `ProjectTelemetryPanel.tsx`, and the panel itself now lives under `src/features/project-watchdog` instead of the project app tree.

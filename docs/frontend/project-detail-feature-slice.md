# Project Detail Feature Slice

This note tracks the browser-owned project detail shell composition that used to sit directly in the `projects` app surface.

## Browser Owners

- `src/features/project-detail/CalendarView.tsx`
- `src/features/project-detail/FilesBrowser.tsx`
- `src/features/project-detail/ProjectDetailGroundGridsView.tsx`
- `src/features/project-detail/ProjectDetailHeader.tsx`
- `src/features/project-detail/ProjectDetailViewTabs.tsx`
- `src/features/project-detail/TaskList.tsx`
- `src/features/project-detail/TaskItem.tsx`
- `src/features/project-detail/useProjectDetailWorkspaceState.ts`
  - owns project-detail workspace composition
  - decides when deep Watchdog telemetry is needed for the active detail tab
  - coordinates linked ground-grid design state with project detail routing
- `src/features/project-detail/useProjectDetailGridDesigns.ts`
  - owns project-linked ground-grid design loading and navigation

## Current Shells

- `src/features/project-detail/ProjectDetail.tsx`
  - is now a presentation-first shell over the feature-owned detail workspace state

## Transitional Notes

- The project detail route now consumes shared `Project`, `Task`, and related models from `src/features/project-core`.
- Project detail header, tabs, ground-grid, files, calendar, and task-list presentation now live under `src/features/project-detail` instead of the `projects` app tree.
- Review/readiness workspaces are now feature-owned consumers imported from `src/features/project-review`, even though `ProjectDetail.tsx` still composes the overall tab shell.
- The revision register view is now a feature-owned consumer imported from `src/features/project-revisions`, even though `ProjectDetail.tsx` still composes the overall tab shell.

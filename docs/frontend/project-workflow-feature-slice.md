# Project Workflow Feature Slice

`src/features/project-workflow` is the browser-owned source of truth for issue-set records and shared project workflow aggregation.

## Scope

- issue-set record types and persistence
- issue-set fetch/save/delete helpers
- bulk issue-set loading for dashboard and workflow surfaces
- shared workflow state aggregation across:
  - issue sets
  - review decisions
  - deliverable register snapshot
  - transmittal receipts
  - automation receipts

## Active Code Roots

- `src/features/project-workflow/index.ts`
- `src/features/project-workflow/ProjectIssueSetManager.tsx`
- `src/features/project-workflow/issueSetService.ts`
- `src/features/project-workflow/sharedStateService.ts`
- `src/features/project-workflow/useProjectIssueSetManagerState.ts`

## Current Callers

- `src/features/project-review/useProjectReviewInboxData.ts`
- `src/features/transmittal-builder/useTransmittalBuilderState.ts`
- `src/features/project-workflow/ProjectIssueSetManager.tsx`
- `src/features/project-delivery/ProjectDeliverableRegisterPanel.tsx`
- `src/features/project-overview/useDashboardDeliverySummary.ts`
- `src/features/drawing-list-manager/ui/DrawingListManager.tsx`
- `src/features/automation-studio/ui/*`
- `src/features/standards-checker/ui/StandardsChecker.tsx`
- `src/routes/developer/control/watchdog/WatchdogRoutePage.tsx`

These callers consume workflow ownership; they should not grow their own local issue-set persistence again.

## Current Boundary

This slice is browser-owned workflow composition. It still depends on lower-level services for:

- user settings persistence
- review decision persistence
- transmittal receipt persistence
- automation receipt persistence
- deliverable register persistence

Those remain outside the slice for now. The feature owns issue-set and shared workflow orchestration on top of them.

## Transitional Notes

- The old `src/services/projectIssueSetService.ts` and `src/services/projectWorkflowSharedStateService.ts` paths have been removed from active frontend code.
- Review, readiness, delivery, and automation flows now share one workflow ownership slice instead of converging through generic service placement.
- Issue-set snapshot math now counts blocking package-level native standards review from hosted core alongside drawing-level standards evidence.
- `ProjectIssueSetManager.tsx` now lives under `src/features/project-workflow` and consumes `useProjectIssueSetManagerState` as a presentation surface instead of owning the workflow load/save/export orchestration locally.

# Project Review Feature Slice

`src/features/project-review` is the browser-owned source of truth for project review inbox/readiness orchestration.

## Scope

- Review inbox item and metric types
- Review fingerprint and descriptor builders
- `useProjectReviewInboxData` orchestration for:
  - setup blockers
  - title block review follow-up
  - drawing-backed standards follow-up
  - package-level native standards follow-up
  - revision attention
  - issue-set follow-up
- readiness workspace state and review-workspace quick-action orchestration

## Active Code Roots

- `src/features/project-review/descriptors.ts`
- `src/features/project-review/ProjectReadinessWorkspace.tsx`
- `src/features/project-review/ProjectReviewInboxWorkspace.tsx`
- `src/features/project-review/ProjectReviewInboxList.tsx`
- `src/features/project-review/useProjectReviewInboxData.ts`
- `src/features/project-review/workspaceState.ts`

## Current Callers

- `src/features/project-detail/ProjectDetail.tsx`
- `src/features/project-workflow/ProjectIssueSetManager.tsx`

These project app files are consumers of the feature slice. They should not become the long-term owners of inbox orchestration or review presentation again.

## Current Boundary

This slice is browser-owned composition. It still depends on lower-level service adapters for:

- project workflow shared state
- hosted latest-review reads from project standards
- revision register reads/writes
- project delivery evidence composition
- review decision persistence
- transmittal receipt reads

Those services remain in `src/services/*` for now. The feature slice is responsible for composing them into review-oriented UI state.

## Transitional Notes

- The old shared project app tree descriptor and inbox-data helpers have been removed from active code.
- Review/readiness now ingest the hosted latest native standards review in addition to drawing-backed standards evidence.
- `ProjectReadinessWorkspace.tsx`, `ProjectReviewInboxWorkspace.tsx`, and `ProjectReviewInboxList.tsx` now live under `src/features/project-review` instead of the `projects` app tree.
- `src/features/project-review` now uses shared project models from `src/features/project-core` instead of importing them from the project app surface.

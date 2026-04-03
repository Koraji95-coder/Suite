# Project Delivery Feature Slice

`src/features/project-delivery` is the browser-owned source of truth for project delivery packaging data and evidence composition.

## Scope

- deliverable register snapshot persistence and import/refresh logic
- deliverable register file pairing and override helpers
- standards evidence fetch/composition used by readiness and issue-set workflows
- hosted native standards-review evidence folded into issue-set packets and markdown exports
- issue-set evidence packet building and markdown rendering

## Active Code Roots

- `src/features/project-delivery/index.ts`
- `src/features/project-delivery/ProjectDeliverableRegisterPanel.tsx`
- `src/features/project-delivery/deliverableRegisterService.ts`
- `src/features/project-delivery/evidenceService.ts`

## Current Callers

- `src/features/project-review/ProjectReadinessWorkspace.tsx`
- `src/features/project-workflow/ProjectIssueSetManager.tsx`
- `src/components/apps/transmittal-builder/useTransmittalBuilderState.ts`
- `src/features/automation-studio/useAutomationStudioState.ts`
- `src/features/project-review/useProjectReviewInboxData.ts`
- `src/features/project-workflow/sharedStateService.ts`

These callers consume the feature slice. They should not take ownership of deliverable register persistence or evidence-packet composition again.

## Current Boundary

This slice is browser-owned and still depends on lower-level shared services for:

- Supabase reads/writes
- user settings persistence
- issue-set records
- transmittal receipts
- automation receipts
- revision register entries

Those remain outside the slice for now. The feature owns the delivery-specific composition and state model on top of them.

## Transitional Notes

- The old `src/services/projectDeliverableRegisterService.ts` and `src/services/projectDeliveryEvidenceService.ts` paths have been removed from active frontend code.
- `ProjectDeliverableRegisterPanel.tsx` now lives under `src/features/project-delivery` instead of the project app tree.
- Drawing-backed `drawing_annotations` evidence still exists as a separate lane, but issue-set evidence packets now also carry the hosted latest native standards review for package-level context.

# Project Revisions Feature Slice

This note tracks the browser-owned revision register state that used to live directly in the project detail view.

## Browser Owners

- `src/features/project-revisions/useProjectRevisionRegisterState.ts`
  - owns revision-register load/save/delete/import orchestration for the project detail surface
  - owns form state, edit/create mode, counts, linked-file mapping, and resolve/reopen actions
- `src/features/project-revisions/ProjectRevisionRegisterView.tsx`
  - owns the revision register presentation surface used by the project detail view
- `src/services/projectRevisionRegisterService.ts`
  - owns the shared revision-register types plus lower-level persistence and local fallback logic

## Transitional Notes

- `src/services/projectRevisionRegisterService.ts` still owns the lower-level persistence and local fallback logic. The feature slice is the browser state owner that sits above that service.
- `ProjectRevisionRegisterView.tsx` now lives under `src/features/project-revisions` instead of the project app tree.

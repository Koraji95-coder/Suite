# Project Manager Feature Slice

This note tracks the current browser ownership boundary for project creation and project setup wizard state.

## Browser Owners

- `src/features/project-core/*`
  - owns shared project models, selectors, and reusable project helper utilities
- `src/features/project-manager/projectPersistence.ts`
  - owns project create/update payload shaping
  - owns legacy `projects` table column fallback handling for setup fields
  - owns root-path normalization and derived `.wdp` path helpers used by project persistence
- `src/features/project-manager/ProjectManagerWorkspace.tsx`
  - owns the main manager workspace composition, modal wiring, list/detail handoff, and shell-level action routing
- `src/features/project-manager/ProjectCard.tsx`
- `src/features/project-manager/ProjectList.tsx`
- `src/features/project-manager/ProjectManagerHeader.tsx`
- `src/features/project-manager/ProjectManagerDeleteDialogs.tsx`
- `src/features/project-manager/ProjectFormModal.tsx`
- `src/features/project-manager/TaskFormModal.tsx`
- `src/features/project-manager/useProjectManagerUiState.ts`
  - owns project-manager UI state for project/task modals, filters, pending deletes, and base form state
- `src/features/project-manager/useProjectManagerState.ts`
  - owns project CRUD orchestration, task CRUD orchestration, file/calendar loading, and project-manager summary composition
- `src/features/project-setup/useProjectSetupWizardState.ts`
  - owns the project setup wizard state machine used by `ProjectFormModal`
  - owns step gating, root validation state, stored profile hydration, and auto-derived `.wdp` alignment

## Current Shells

- `src/features/project-manager/ProjectManager.tsx`
  - is now a thin shell over the feature-owned manager workspace

## Transitional Notes

- Project CRUD orchestration no longer lives in the `projects` app tree; the main remaining shell work is presentation/layout cleanup.
- Project list filtering/grouping now goes through `src/features/project-core` selectors instead of being reimplemented locally inside `ProjectList.tsx`.
- Project list, card, header, delete-dialog, and project/task modal presentation now live under `src/features/project-manager`.
- Shared project types, selectors, and utility helpers are no longer owned by the old shared project app tree.
- The legacy shared project app entrypoint is gone; the remaining manager shell now lives inside the feature folder with the rest of the manager surface.

# Project Core Feature Slice

`src/features/project-core` is the browser-owned source of truth for shared project data models, selectors, and project UI helper utilities.

## Scope

- Shared project/task/file/calendar TypeScript models
- Shared literal unions and form data shapes
- Project list/filter summary selectors
- Project UI helper utilities used across project, review, delivery, setup, and detail slices

## Active Code Roots

- `src/features/project-core/index.ts`
- `src/features/project-core/models.ts`
- `src/features/project-core/selectors.ts`
- `src/features/project-core/utils.ts`

## Current Callers

- `src/features/project-manager/*`
- `src/features/project-detail/*`
- `src/features/project-setup/*`
- `src/features/project-detail/*`
- `src/features/project-review/*`
- `src/features/project-delivery/*`
- `src/features/project-revisions/*`
- `src/features/project-workflow/*`

The project feature slices are now consumers of this shared project boundary. They should not become the owner of cross-slice project types or helpers again.

## Transitional Notes

- `src/components/apps/projects/projectmanagertypes.ts`, `projectManagerSelectors.ts`, and `projectmanagerutils.ts` have been removed from active code.
- This slice is browser-owned only. Hosted-core authority still lives in backend domain and route layers.

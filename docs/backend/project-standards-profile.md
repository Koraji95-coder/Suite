# Project Standards Profile And Native Review

This is the canonical backend note for the hosted-core project standards profile and native-review slice.

## Source Of Truth

- `backend/domains/project_standards/*`
- `backend/route_groups/api_project_standards.py`

## Active Route

- `POST /api/project-standards/tickets`
- `GET /api/project-standards/projects/<project_id>/profile`
- `PUT /api/project-standards/projects/<project_id>/profile`
- `GET /api/project-standards/projects/<project_id>/latest-review`
- `POST /api/project-standards/results`

## Ownership

- Hosted core owns project-scoped standards defaults for the browser standards checker.
- Hosted core owns signed local-action tickets for native standards review.
- Hosted core stores the latest native standards review result per project/user pair.
- Persistence uses `user_settings` with the scoped key `project_standards_profile`.
- The latest native review also persists through `user_settings`, scoped under `project_standards_latest_review`.
- The browser no longer needs to treat standards category, selected standards pack entries, or preferred CAD standards family as throwaway local state.

## Current Payload Shape

The hosted profile normalizes to:

- `id`
- `projectId`
- `userId`
- `cadFamilyId`
- `standardsCategory`
- `selectedStandardIds`
- `createdAt`
- `updatedAt`

The hosted latest review normalizes to:

- `id`
- `projectId`
- `userId`
- `requestId`
- `recordedAt`
- `cadFamilyId`
- `standardsCategory`
- `selectedStandardIds`
- `results`
- `warnings`
- `summary`
- `meta`
- `overallStatus`

## Active Flow

1. The browser loads or saves the project-scoped standards defaults.
2. The browser issues a scoped local-action ticket from `POST /api/project-standards/tickets`.
3. Runtime Control validates that ticket before dispatching the workstation-local review.
4. The browser records the native result set back through `POST /api/project-standards/results`.
5. The browser and other consumers can hydrate the last project-native review through `GET /api/project-standards/projects/<project_id>/latest-review`.

## Why `user_settings`

- This slice is project-scoped preference/state, not a new domain table with relational workflow data.
- `user_settings` already supports per-user, per-project scoping and has the `upsert_user_setting` RPC for consistent writes.
- Keeping this narrow avoids creating another special-purpose table while the native Runtime Control and CAD-backed standards execution lane is still being cut into the broader review/evidence workflows.

## What This Slice Does Not Own

- It does not run AutoCAD `CHECKSTANDARDS`.
- It does not mutate DWS files or ACADE standards files.
- It does not own waiver, issue-set, or deliverable evidence records.

Those responsibilities stay with the CAD/runtime boundary and the broader project workflow slices.

# Project Setup + Title Block Runtime Flow

This is the canonical architecture note for the first project-setup/title-block slice.

## Summary

The active flow is:

`browser -> hosted core -> Runtime Control companion -> CAD/plugin`

Project setup no longer treats the backend as the owner of folder picking or other machine-local actions. The browser uses hosted-core APIs for profile state, preview/planning, and local-action tickets, then calls Runtime Control directly for local-machine work.

## Browser Ownership

Browser-owned source of truth:

- `src/features/project-setup/*`
- project setup modal/readiness/workspace surfaces under `src/features/project-setup/*`

Browser responsibilities:

- load/save project setup profile through hosted-core APIs
- request local-action tickets before privileged workstation actions
- call Runtime Control localhost endpoints for root selection, root scan, artifact creation, and CAD actions
- submit scan snapshots to hosted core for authoritative preview/planning
- show partial-setup UX when the companion or AutoCAD is unavailable

Feature-owned browser state now includes:

- `src/features/project-setup/useProjectSetupReadinessState.ts` for the setup checklist data load and ACADE open workflow
- `src/features/project-setup/snapshotService.ts` for the workstation-backed snapshot seam used by project documents

## Hosted-Core Ownership

Hosted-core source of truth:

- `backend/domains/project_setup/*`
- `backend/route_groups/api_project_setup.py`

Hosted-core responsibilities:

- `POST /api/project-setup/tickets`
- `GET /api/project-setup/projects/:projectId/profile`
- `PUT /api/project-setup/projects/:projectId/profile`
- `POST /api/project-setup/preview`
- `POST /api/project-setup/results`

Hosted core is authoritative for:

- saved project setup defaults/title block profile data
- signed local-action ticket issuance
- preview/planning from a companion-produced scan snapshot
- result receipt/audit

Hosted core is not the active owner for:

- folder picking
- local filesystem browsing/scanning
- local support-file writes
- live AutoCAD execution

## Runtime Control Ownership

Workstation-local source of truth:

- `dotnet/Suite.RuntimeControl/LocalActions/ProjectSetup/*`
- `dotnet/Suite.RuntimeControl/WorkstationFolderPickerBridge.cs`

Runtime Control localhost endpoints:

- `POST /api/workstation/project-setup/pick-root`
- `POST /api/workstation/project-setup/scan-root`
- `POST /api/workstation/project-setup/ensure-artifacts`
- `POST /api/workstation/project-setup/open-acade`
- `POST /api/workstation/project-setup/create-acade`
- `POST /api/workstation/project-setup/apply-title-block`

Runtime Control responsibilities:

- validate hosted-core ticket signatures and origin
- perform workstation-local root picking
- scan the local project root and build the scan snapshot
- prepare starter `.wdp/.wdt/.wdl` artifacts
- dispatch CAD-required actions into the local CAD layer

## CAD Ownership

CAD execution source of truth:

- `dotnet/suite-cad-authoring/ProjectSetup/*`

Current ownership:

- ACADE project open/create/drawing-scan/title-block-apply lives in `suite-cad-authoring`
- AutoCAD execution keeps the existing `success`, `code`, `message`, `requestId`, optional `meta` envelope
- project setup/title-block now runs strictly `browser -> hosted core -> Runtime Control -> suite-cad-authoring`
- the legacy named-pipe bridge is outside this slice and is now manual-only for explicit diagnostics

## Transitional Compatibility

These legacy paths are no longer part of the active project-setup/title-block architecture:

- `/api/watchdog/pick-root` is retired
- `backend/route_groups/api_title_block_sync.py` has been removed

The old browser-side `src/services/titleBlockSyncService.ts` adapter has been removed from active frontend ownership. Browser callers now go directly through `src/features/project-setup/*`.

Snapshot/drawing metadata now follows the same browser-owned slice:

- `src/features/project-setup/snapshotService.ts` owns the ticket -> companion scan -> hosted preview seam used for project document snapshots
- `src/features/project-setup/actionService.ts` owns the ticketed preview/artifact/open/create/apply action flow for project setup and title block operations
- `src/features/project-documents/*` now owns the browser-side document metadata model and consumers

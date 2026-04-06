# Project Architecture

This is the consolidated frontend architecture note for the project-owned browser surfaces.

The previous per-slice notes for project setup, manager, detail, revisions, documents, delivery, review, workflow, and project-scoped Watchdog are folded into this document.

## Guardrails

- `src/routes/*` stays composition-first.
- `src/features/project-*` owns browser state, orchestration, and presentation for project workflows.
- `src/services/*` remains the lower-level adapter layer and should not retake project workflow ownership.
- Hosted-core authority stays in backend domain and route layers.
- Workstation-local filesystem, AutoCAD, and collector execution stay under Runtime Control and CAD ownership.

## Shared Project Boundary

`src/features/project-core/*` is the browser-owned source of truth for:

- shared project, task, file, and calendar models
- shared literal unions and form data shapes
- project list and filter summary selectors
- reusable project UI helpers used across manager, detail, setup, review, delivery, revisions, and workflow surfaces

Consumers should keep cross-project types and helpers here instead of recreating them inside local feature folders.

## Project Setup And Title Block Runtime Flow

The active flow is:

`browser -> hosted core -> Runtime Control companion -> suite-cad-authoring`

Browser ownership lives under:

- `src/features/project-setup/*`
- `src/features/project-documents/*` for browser-facing document metadata built from setup snapshots

Browser responsibilities:

- load and save the hosted project setup profile
- request local-action tickets before privileged workstation actions
- call Runtime Control localhost endpoints for root selection, root scan, artifact creation, and CAD-backed actions
- submit scan snapshots to hosted core for authoritative preview and planning
- keep partial-setup UX usable when Runtime Control or AutoCAD is unavailable

Hosted-core ownership lives under:

- `backend/domains/project_setup/*`
- `backend/route_groups/api_project_setup.py`

Hosted core remains authoritative for:

- saved setup defaults and title-block profile data
- signed local-action ticket issuance
- preview and planning from companion-produced scan snapshots
- result receipts and audit state

Runtime Control ownership lives under:

- `dotnet/Suite.RuntimeControl/LocalActions/ProjectSetup/*`
- localhost endpoints under `/api/workstation/project-setup/*`

Runtime Control owns:

- ticket validation
- workstation-local root picking and scanning
- support-file and starter artifact creation
- dispatch into the local CAD host

CAD execution ownership lives under:

- `dotnet/suite-cad-authoring/ProjectSetup/*`

The named-pipe bridge is not part of the active project-setup path anymore; it remains manual-only for explicit diagnostics.

## Project Manager

`src/features/project-manager/*` owns the browser workflow for project and task CRUD.

Key owners:

- `projectPersistence.ts` for payload shaping, legacy setup-column fallback handling, root normalization, and derived `.wdp` helpers
- `useProjectManagerUiState.ts` for modal, filter, and delete-confirm state
- `useProjectManagerState.ts` for project and task orchestration plus summary composition
- `ProjectManagerWorkspace.tsx` for manager workspace composition
- `ProjectFormModal.tsx` and `useProjectSetupWizardState.ts` for the setup wizard state machine used during project creation

`ProjectManager.tsx` should remain a thin shell over the feature-owned workspace.

## Project Detail And Revisions

`src/features/project-detail/*` owns the detail-tab shell composition that used to sit directly in the old project app tree.

Key owners:

- `useProjectDetailWorkspaceState.ts` for tab composition and deep Watchdog loading decisions
- `useProjectDetailGridDesigns.ts` for linked ground-grid design loading and navigation
- detail presentation surfaces such as `ProjectDetailHeader.tsx`, `ProjectDetailViewTabs.tsx`, `FilesBrowser.tsx`, `CalendarView.tsx`, and `TaskList.tsx`

Revisions remain a dedicated feature layer:

- `src/features/project-revisions/useProjectRevisionRegisterState.ts` owns revision-register orchestration
- `src/features/project-revisions/ProjectRevisionRegisterView.tsx` owns revision-register presentation
- `src/services/projectRevisionRegisterService.ts` still owns lower-level persistence and local fallback logic

Project detail composes review, revisions, and telemetry workspaces, but it should not absorb their ownership again.

## Project Documents

`src/features/project-documents/*` is the browser-owned source of truth for project document metadata.

This layer owns:

- snapshot loading and short-lived caching
- normalization of title-block scan rows into browser-facing metadata rows
- filename fallback behavior
- ACADE report parsing from `.xlsx`, `.csv`, and `.tsv`
- export-row shaping for drawing index workflows
- standard-document shaping for transmittal and issue-package workflows

The setup snapshot seam still depends on:

- `src/features/project-setup/snapshotService.ts`

Project documents owns the browser-facing metadata model, not workstation folder picking, scanning, artifact creation, or hosted-core profile persistence.

## Project Review

`src/features/project-review/*` is the browser-owned source of truth for review inbox and readiness orchestration.

This layer owns:

- review inbox item and metric types
- review descriptor and fingerprint builders
- `useProjectReviewInboxData.ts` orchestration for setup blockers, title-block follow-up, standards follow-up, revision attention, and issue-set follow-up
- readiness workspace quick-action orchestration in `workspaceState.ts`
- presentation surfaces such as `ProjectReadinessWorkspace.tsx`, `ProjectReviewInboxWorkspace.tsx`, and `ProjectReviewInboxList.tsx`

This feature composes lower-level services for workflow state, standards latest-review reads, revision-register writes, delivery evidence, review decisions, and transmittal receipts. Those services stay below the feature layer.

## Project Delivery

`src/features/project-delivery/*` is the browser-owned source of truth for project delivery packaging data and evidence composition.

This layer owns:

- deliverable register snapshot persistence and import or refresh logic
- file pairing and override helpers
- standards evidence fetch and composition used by readiness and issue-set workflows
- hosted native standards-review evidence folded into issue-set packets and markdown exports
- issue-set evidence packet building and markdown rendering

Callers such as review, workflow, transmittal, and automation surfaces should consume this layer instead of rebuilding delivery evidence locally.

## Project Workflow

`src/features/project-workflow/*` is the browser-owned source of truth for issue-set records and shared workflow aggregation.

This layer owns:

- issue-set record types and persistence
- issue-set fetch, save, delete, and export helpers
- bulk issue-set loading for dashboard and workflow surfaces
- shared aggregation across review decisions, deliverable register state, transmittal receipts, and automation receipts

Callers across review, delivery, transmittal, standards, automation, dashboard, and developer telemetry should treat this as the workflow owner instead of growing local issue-set persistence again.

## Project Watchdog

`src/features/project-watchdog/*` is the browser-owned source of truth for project-scoped Watchdog telemetry loading and tracked-drawing summary shaping.

This layer owns:

- project-scoped overview, event, and session collection
- shared project-rule hydration for project surfaces
- tracked-drawing journal summaries from synced work segments plus live sessions
- `useProjectWatchdogTelemetry.ts`
- `useProjectTelemetryPanelState.ts` for browser-side rule editor and tracked-drawing expansion state
- `ProjectTelemetryPanel.tsx`

This layer composes hosted APIs and synced data. It does not own workstation execution, collector transport, or plugin startup.

## Consolidation Outcome

Use this document as the canonical frontend reference for project-owned architecture and boundaries.

The old per-slice frontend files were removed to keep the docs tree smaller and to avoid scattering one ownership model across a dozen tiny notes.

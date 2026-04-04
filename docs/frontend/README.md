# Frontend Docs

This section is the canonical home for browser-owned architecture and feature-slice flow notes.

## Code Roots

- `src/routes/*` for route entry, redirects, audience gating, page-header registration, and feature composition only
- `src/features/*` for active product and workflow ownership
- `src/components/system/*` for all shared UI ownership, including `src/components/system/base/*` for foundational controls
- `src/services/*` for browser-owned adapters and caches

## Shell Families

The authenticated Suite shell is now organized around product-first families:

- `Home` for the calm suite-board front door
- `Projects` for the project notebook, meetings/calendar, files, stage status, and release context
- `Draft` for released customer-facing drafting tools
- `Review` for released standards and readiness work
- `Developer` for control, architecture, and labs

Current navigation rules:

- top-level `Apps` is retired from the customer shell
- top-level `Knowledge` no longer lives in Suite customer navigation
- `Calendar` is folded into `Projects`
- full `Watchdog` stays behind `Developer`

## Current Canonical Docs

- [Project Core Feature Slice](./project-core-feature-slice.md)
- [Project Setup + Title Block Runtime Flow](./project-setup-title-block-runtime-flow.md)
- [Project Detail Feature Slice](./project-detail-feature-slice.md)
- [Project Manager Feature Slice](./project-manager-feature-slice.md)
- [Project Revisions Feature Slice](./project-revisions-feature-slice.md)
- [Project Documents Feature Slice](./project-documents-feature-slice.md)
- [Project Delivery Feature Slice](./project-delivery-feature-slice.md)
- [Project Review Feature Slice](./project-review-feature-slice.md)
- [Project Workflow Feature Slice](./project-workflow-feature-slice.md)
- [Project Watchdog Feature Slice](./project-watchdog-feature-slice.md)
- [Standards Checker Feature Slice](./standards-checker-feature-slice.md)
- [Automation Studio Feature Slice](./automation-studio-feature-slice.md)
- [Transmittal Builder Feature Slice](./transmittal-builder-feature-slice.md)

## Current Ownership Notes

- `src/routes/*` should stay composition-first. Large workflow state and presentation should move into the owning feature slice instead of growing route files.
- `src/features/home`, `src/features/draft`, and `src/features/review` now own the new top-level family landings.
- `src/components/system/*` is now the single shared UI owner and includes the base-control layer under `src/components/system/base/*`.
- `src/features/project-core` now owns shared project/task/file models, project list selectors, and reusable project UI helper utilities that were previously coupled to the `projects` app tree.
- `src/features/project-setup` is the browser source of truth for the first project-setup slice.
- `src/features/project-detail/useProjectDetailWorkspaceState.ts` now owns project-detail workspace composition and the detail view's telemetry-loading decisions.
- `src/features/project-detail/CalendarView.tsx`, `FilesBrowser.tsx`, `TaskList.tsx`, `ProjectDetailHeader.tsx`, `ProjectDetailViewTabs.tsx`, and `ProjectDetailGroundGridsView.tsx` now own the detail presentation surfaces from the old shared project app tree.
- `src/features/project-manager/projectPersistence.ts` now owns project create/update payload shaping, root-path normalization, and legacy setup-column fallback handling used by the project manager surface.
- `src/features/project-manager/useProjectManagerUiState.ts` and `src/features/project-manager/useProjectManagerState.ts` now own project-manager UI state and main project/task CRUD orchestration, leaving `src/features/project-manager/ProjectManager.tsx` as the primary presentation shell.
- `src/features/project-manager/ProjectManagerWorkspace.tsx` now owns the manager workspace composition and modal/list/detail wiring, while `src/features/project-manager/ProjectManager.tsx` is a shell entrypoint only.
- `src/features/project-manager/ProjectCard.tsx`, `ProjectList.tsx`, `ProjectManagerHeader.tsx`, `ProjectManagerDeleteDialogs.tsx`, `ProjectFormModal.tsx`, and `TaskFormModal.tsx` now own the manager presentation surfaces from the old shared project app tree.
- `src/features/project-setup/actionService.ts` owns the active project-setup/title-block action flow.
- `src/features/project-setup/useProjectSetupWizardState.ts` now owns the project setup wizard state used by `ProjectFormModal`.
- `src/features/project-setup/useProjectSetupReadinessState.ts` now owns the setup checklist data load, ACADE support-file summary state, and ACADE open action flow used by the project setup surface.
- `src/features/project-setup/ProjectSetupReadinessPanel.tsx` and `src/features/project-setup/ProjectSetupWorkspace.tsx` now own the setup presentation surfaces from the old shared project app tree.
- `src/features/project-revisions/useProjectRevisionRegisterState.ts` now owns revision-register view orchestration for the project detail surface.
- `src/features/project-revisions/ProjectRevisionRegisterView.tsx` now owns the revision register presentation surface instead of leaving it in the old shared project app tree.
- `src/features/project-documents` is now the browser source of truth for project document metadata, report parsing, and snapshot normalization.
- `src/features/project-delivery` now owns browser-side deliverable register persistence, standards evidence composition, and issue-set evidence packet rendering.
- `src/features/project-delivery/ProjectDeliverableRegisterPanel.tsx` now owns the deliverable register presentation surface used by readiness workflows.
- `src/features/project-review` now owns browser-side review inbox/readiness orchestration and descriptor composition.
- `src/features/project-review/workspaceState.ts` now owns the readiness/review workspace state layer, keeping the project route components presentation-first.
- `src/features/project-review/ProjectReadinessWorkspace.tsx`, `src/features/project-review/ProjectReviewInboxWorkspace.tsx`, and `src/features/project-review/ProjectReviewInboxList.tsx` now own the review presentation surfaces from the old shared project app tree.
- `src/features/project-workflow` now owns issue-set records and shared workflow aggregation used across review, delivery, automation, and watchdog surfaces.
- `src/features/project-workflow/useProjectIssueSetManagerState.ts` now owns issue-set manager load/save/export orchestration, and `src/features/project-workflow/ProjectIssueSetManager.tsx` now owns the corresponding presentation surface.
- `src/features/project-watchdog` now owns browser-side project telemetry loading, tracked drawing summary aggregation, and the shared telemetry contract consumed across project and Automation Studio surfaces.
- `src/features/project-watchdog/useProjectTelemetryPanelState.ts` now owns the project telemetry panel's rule-editing and tracked-drawing expansion state, and `src/features/project-watchdog/ProjectTelemetryPanel.tsx` now owns the panel presentation surface.
- `src/features/standards-checker` now owns browser-side standards review state, drawing-backed standards evidence state, and Autodesk standards reference loading.
- `src/features/standards-checker/actionService.ts` now owns the ticketed native standards-review run path.
- `src/features/standards-checker/backendService.ts` now loads and saves project-scoped standards defaults, issues local-review tickets, hydrates the latest native review, and records native review results through hosted core.
- Review/readiness and issue-set evidence now ingest the hosted latest native standards review instead of relying only on drawing annotations.
- `src/features/automation-studio` now owns browser-side Automation Studio state, shared queue models, and summary selectors.
- `src/features/transmittal-builder` now owns transmittal-builder workflow state, models, config, and API service integration.
- Legacy product UI ownership has been rehomed under `src/features/*`; the old shared app tree is no longer an active owner.
- `src/features/project-setup/snapshotService.ts` remains the workstation-backed scan/planning seam used by the project-documents slice.
- Active frontend/browser code no longer imports the old `titleBlockSyncService` path.

## What Does Not Belong Here

- Hosted-core API authority docs belong under [Backend](../backend/README.md).
- Workstation-local bridge/install/runbook docs belong under [Runtime Control](../runtime-control/README.md).
- AutoCAD transport and execution details belong under [CAD](../cad/README.md).

# Frontend Docs

This section is the canonical home for browser-owned architecture, ownership maps, and UI/runtime flow notes.

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

- [Project Architecture](./project-architecture.md)
- [Workflow Architecture](./workflow-architecture.md)
- [Performance Insights](<./Performance Insights.md>)
- [Performance Fix Log](<./Performance Fix Log.md>)

## Current Ownership Notes

- `src/routes/*` should stay composition-first. Large workflow state and presentation should move into the owning feature slice instead of growing route files.
- `src/features/home`, `src/features/draft`, and `src/features/review` own the top-level family landings.
- `src/features/project-*` owns project-shared workflows, browser-side orchestration, and project runtime handoff seams. See [Project Architecture](./project-architecture.md).
- `src/features/standards-checker`, `src/features/automation-studio`, and `src/features/transmittal-builder` own the specialist workflow surfaces. See [Workflow Architecture](./workflow-architecture.md).
- `src/components/system/*` is the single shared UI owner and includes the base-control layer under `src/components/system/base/*`.
- Legacy project-app ownership has been rehomed under `src/features/*`; routes and service adapters should not grow back into workflow owners.

## What Does Not Belong Here

- Hosted-core API authority docs belong under [Backend](../backend/README.md).
- Workstation-local bridge/install/runbook docs belong under [Runtime Control](../runtime-control/README.md).
- AutoCAD transport and execution details belong under [CAD](../cad/README.md).

# Standards Checker Feature Slice

This is the canonical frontend note for the browser-owned standards-checker slice.

## Source Of Truth

- `src/features/standards-checker`
- `src/components/apps/standards-checker/*` as UI shells and panels

## Current Browser Ownership

- `src/features/standards-checker/useStandardsCheckerState.ts` owns the package-review standards state and loads/saves the project-scoped hosted standards profile.
- `src/features/standards-checker/actionService.ts` owns the ticketed native standards-review run flow.
- `src/features/standards-checker/useStandardsDrawingCheckerState.ts` owns drawing-backed standards evidence state and persistence around `drawing_annotations`.
- `src/features/standards-checker/standardsCheckerModels.ts` owns the browser-side standards-pack model.
- `src/features/standards-checker/backendService.ts` is the browser seam for hosted project standards defaults, ticket issuance, latest-review hydration, and recorded results.
- `src/features/standards-checker/companionService.ts` is the browser seam for Runtime Control native review dispatch.
- `src/features/standards-checker/standardsDrawingModels.ts` owns drawing-evidence types and rule metadata.
- `src/features/standards-checker/referenceCatalogService.ts` is the browser seam for Autodesk standards-family reference data exposed by the backend.

## What This Slice Is

- A package-review workflow inside Suite.
- A drawing-evidence workflow that stores and reads standards findings tied to project review.
- A browser-owned review surface that feeds project readiness, review inbox, issue-set evidence, and transmittal prep.

## What This Slice Is Not

- It is not the native AutoCAD `CHECKSTANDARDS` command.
- It is not the ACADE wire-layer/DWS editor.
- It is not the owner of live CAD mutation or standards-file execution.

Those CAD-native responsibilities belong to the CAD/runtime boundary and are described in [Autodesk Standards Checker Comparison And Flow](../cad/autodesk-standards-checker-comparison.md).

## Current Reality

- The package-review standards selector restores and saves project-scoped defaults through hosted core.
- The package-review `Run review` path is now a ticketed native review handoff:
  1. hosted core issues a local-action ticket,
  2. Runtime Control validates the ticket and scans the project root for DWG/DWS context,
  3. the in-process CAD host runs a deterministic read-only inspection,
  4. hosted core stores the latest review result for the project.
- The drawing-backed review lane persists findings into `drawing_annotations` and is what the rest of the project workflow currently consumes as standards evidence.
- Autodesk standards families are exposed to the browser as reference context and as project-scoped defaults that drive the native review handoff.

## Target Flow

1. The browser selects the project/package context.
2. The browser loads the hosted project standards profile from `/api/project-standards/projects/<project_id>/profile`.
3. The browser loads the latest hosted native review from `/api/project-standards/projects/<project_id>/latest-review`.
4. The browser loads Autodesk standards-family reference context from `/api/autocad/reference/standards`.
5. The operator chooses the Suite standards review lane:
   - package-review standards pack, or
   - drawing-backed standards evidence
6. When native CAD standards execution is needed, the browser issues `/api/project-standards/tickets`, calls Runtime Control at `/api/workstation/project-standards/run-review`, and records the result through `/api/project-standards/results`.
7. Suite remains the package-level source of truth for findings, waivers, issue-set evidence, and readiness.

## Remaining Gaps

- The package-review standards-pack lane is now native and deterministic, and review/readiness now ingest the hosted latest-review record alongside drawing-backed standards evidence.
- The current native review inspects project DWGs and DWS presence through the in-process CAD host, but it is not yet literal Autodesk `CHECKSTANDARDS` capture.
- The next clean cut is to extend that same hosted latest-review record into issue-set evidence and transmittal/delivery packaging so package-level native review and drawing-level evidence live side by side everywhere.

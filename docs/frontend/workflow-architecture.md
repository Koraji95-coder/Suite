# Workflow Architecture

This is the consolidated frontend architecture note for the specialist workflow surfaces that sit outside the core project shell.

The previous per-slice notes for Standards Checker, Automation Studio, and Transmittal Builder are folded into this document.

## Guardrails

- Browser state and orchestration should live in the owning `src/features/*` folder.
- Runtime Control and CAD layers still own workstation execution, local filesystem access, and AutoCAD mutation.
- Shared project models, issue sets, and delivery evidence should be consumed from their owning project feature layers instead of being recreated here.

## Standards Checker

Browser ownership lives under:

- `src/features/standards-checker/*`
- `src/features/standards-checker/ui/*`

This workflow owns:

- package-review standards state in `useStandardsCheckerState.ts`
- drawing-backed standards evidence state in `useStandardsDrawingCheckerState.ts`
- ticketed native review dispatch in `actionService.ts`
- hosted project standards profile, latest-review hydration, and recorded result writes in `backendService.ts`
- Runtime Control dispatch in `companionService.ts`
- browser-side standards-pack and drawing-evidence models
- Autodesk standards-family reference loading in `referenceCatalogService.ts`

This workflow is:

- a package-review workflow inside Suite
- a drawing-evidence workflow tied to project review
- a browser-owned review surface that feeds readiness, issue-set evidence, and transmittal prep

This workflow is not:

- the native AutoCAD `CHECKSTANDARDS` command
- the owner of live CAD mutation
- the owner of standards-file execution

Those CAD-native responsibilities stay with the CAD and runtime boundary.

## Automation Studio

Browser ownership lives under:

- `src/features/automation-studio/*`
- `src/features/automation-studio/ui/*`

This workflow owns:

- project selection and issue-set scoping in `useAutomationStudioState.ts`
- shared queue, snapshot, and context contracts in `models.ts`
- queue merging and approved-plan or receipt summary derivation in `selectors.ts`
- the UI shell and panel layer in `ui/*`

Automation Studio depends on:

- `src/features/project-delivery`
- `src/features/project-workflow`
- `src/services/projectAutomationRecipeService.ts`
- `src/services/projectAutomationReceiptService.ts`

It does not own CAD execution. AutoCAD and ACADE execution stay with the CAD and runtime layers.

## Transmittal Builder

Browser ownership lives under:

- `src/features/transmittal-builder/*`
- `src/features/transmittal-builder/ui/*`

This workflow owns:

- transmittal draft and file-state models
- sender and profile defaults
- API client and service integration
- `useTransmittalBuilderState.ts`
- awareness of the latest hosted native standards review for package readiness
- persisted receipt snapshots of the active standards-review state

It still depends on lower-level project document, delivery, workflow, standards, and transmittal receipt services. Those dependencies remain outside the feature so the transmittal-builder state machine stays focused on transmittal workflow ownership.

## Related Docs

- AutoDraft remains documented under `docs/autodraft/*` because it is its own domain area.
- CAD execution details remain under `docs/cad/*`.
- Project-shared models, issue sets, delivery evidence, and project-scoped telemetry remain under [Project Architecture](./project-architecture.md).

## Consolidation Outcome

Use this document as the canonical frontend reference for specialist workflow ownership.

The old per-slice workflow notes were removed so the docs tree matches the current architecture without spreading one boundary model across many tiny files.

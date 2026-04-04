# Automation Studio Feature Slice

`src/features/automation-studio` is the browser-owned source of truth for Automation Studio workflow state, shared queue models, and cross-specialist plan/receipt summaries.

## Code Roots

- `src/features/automation-studio/index.ts`
- `src/features/automation-studio/models.ts`
- `src/features/automation-studio/selectors.ts`
- `src/features/automation-studio/useAutomationStudioState.ts`

## Ownership

- `useAutomationStudioState.ts` owns project selection, issue-set scoping, register snapshot lookup, receipt lookup, and workflow-link composition for the Automation Studio app shell.
- `models.ts` owns the shared queue, snapshot, and context contracts used by Automation Studio, AutoDraft compare, conduit terminal workflow, and automation persistence services.
- `selectors.ts` owns browser-only queue merging and approved-plan/receipt summary derivation.
- `src/features/automation-studio/ui/*` remains the UI shell and specialist panel layer:
  - `AutomationStudioApp.tsx` is the route/app composition shell.
  - `AutomationRecipePanel.tsx`, `TerminalAuthoringPanel.tsx`, and `CadUtilitiesPanel.tsx` remain panel-specific UI and action surfaces.

## Current Boundaries

- Browser-owned orchestration in this slice depends on:
  - `src/features/project-delivery`
  - `src/features/project-workflow`
  - `src/services/projectAutomationRecipeService.ts`
  - `src/services/projectAutomationReceiptService.ts`
- This slice does not own CAD execution. AutoCAD/ACADE execution continues to belong to the CAD/runtime layers.

## Autodesk Reference Impact

- The local AutoCAD 2026 install includes ActiveX, Visual LISP, database connectivity, Design Automation, and Electrical sample material that informs this slice, but does not replace it.
- Legacy COM/VBA/LISP samples remain reference material for interoperability patterns, not the primary browser/runtime architecture for Suite.

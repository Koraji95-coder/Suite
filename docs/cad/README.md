# CAD Docs

This section is the canonical home for AutoCAD execution, local CAD transport, and workstation-CAD integration references.

## Code Roots

- `dotnet/suite-cad-authoring/*`
- `dotnet/named-pipe-bridge/*`
- backend AutoCAD route/runtime helpers and bridge diagnostic/manual-fallback callers

## Canonical Docs

- [Drawing Cleanup](./drawing-cleanup.md)
- [Named Pipe Bridge](./named-pipe-bridge.md)
- [Coordinates Grabber API Server](./coordinates-grabber-api.md)
- [Autodesk Local Install Reference](./autodesk-local-install-reference.md)
- [Autodesk Standards Checker Comparison And Flow](./autodesk-standards-checker-comparison.md)
- [AutoCAD Electrical 2026 Reference Pack](../development/autocad-electrical-2026-reference-pack.md)
- [AutoCAD Electrical Project-Level Sidecar Files](./autocad-electrical-project-level-sidecars.md)

## Current Ownership Notes

- `suite-cad-authoring` is the preferred owner for live ACADE execution.
- Project setup ACADE open/create/drawing-scan/title-block-apply now belong to the in-process `suite-cad-authoring` host.
- AutoDraft / automation-recipe markup apply now dispatches into the in-process `suite-cad-authoring` host through `suite_markup_authoring_project_apply`; it is no longer a named-pipe bridge apply lane.
- Terminal authoring apply and preview now dispatch into the in-process `suite-cad-authoring` host through `suite_terminal_authoring_project_apply` and `suite_terminal_authoring_project_preview`.
- Batch find/replace apply and preview now dispatch into the in-process `suite-cad-authoring` host through `suite_batch_find_replace_apply`, `suite_batch_find_replace_project_apply`, `suite_batch_find_replace_preview`, and `suite_batch_find_replace_project_preview`.
- Drawing Cleanup preview and apply now dispatch into the in-process `suite-cad-authoring` host through `suite_drawing_cleanup_preview` and `suite_drawing_cleanup_apply`.
- Conduit-route dotnet-provider actions now dispatch into the in-process `suite-cad-authoring` host through the AutoCAD backend ACADE sender for:
  - `conduit_route_terminal_scan`
  - `conduit_route_obstacle_scan`
  - `conduit_route_terminal_routes_draw`
  - `conduit_route_terminal_labels_sync`
- The named-pipe bridge is no longer started by default; keep it for explicit diagnostics/manual validation and for any intentional AutoDraft bridge-mode fallback only.
- Native AutoCAD or ACADE standards-file execution belongs in the CAD/runtime boundary, while Suite remains the package-review owner.
- The active package-review native standards lane now dispatches into `suite-cad-authoring` through the workstation-local review route and the in-process `suite_project_standards_review` action.
- `suite-cad-authoring` now treats Autodesk `MSB3277` reference-conflict noise as messages under the net8 AutoCAD 2026 path so real plugin regressions stay visible; the current build is clean.

## Contract Guardrail

- AutoCAD-facing error envelopes must stay backward compatible: `success`, `code`, `message`, `requestId`, optional `meta`.

# CAD Docs

This section is the canonical home for AutoCAD execution, local CAD transport, and workstation-CAD integration references.

## Code Roots

- `dotnet/suite-cad-authoring/*`
- `dotnet/named-pipe-bridge/*`
- backend AutoCAD route/runtime helpers and remaining bridge-backed transport callers

## Canonical Docs

- [Named Pipe Bridge](./named-pipe-bridge.md)
- [Coordinates Grabber API Server](./coordinates-grabber-api.md)
- [Autodesk Local Install Reference](./autodesk-local-install-reference.md)
- [Autodesk Standards Checker Comparison And Flow](./autodesk-standards-checker-comparison.md)
- [AutoCAD Electrical 2026 Reference Pack](../development/autocad-electrical-2026-reference-pack.md)

## Current Ownership Notes

- `suite-cad-authoring` is the preferred owner for live ACADE execution.
- Project setup ACADE open/create/drawing-scan/title-block-apply now belong to the in-process `suite-cad-authoring` host.
- The named-pipe bridge remains available only for other still-bridge-backed CAD flows; project setup/title-block is no longer a bridge-backed compatibility lane.
- Native AutoCAD or ACADE standards-file execution belongs in the CAD/runtime boundary, while Suite remains the package-review owner.
- The active package-review native standards lane now dispatches into `suite-cad-authoring` through the workstation-local review route and the in-process `suite_project_standards_review` action.
- `suite-cad-authoring` now treats Autodesk `MSB3277` reference-conflict noise as messages under the net8 AutoCAD 2026 path so real plugin regressions stay visible; the current build is clean.

## Contract Guardrail

- AutoCAD-facing error envelopes must stay backward compatible: `success`, `code`, `message`, `requestId`, optional `meta`.

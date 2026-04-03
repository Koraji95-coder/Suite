# Project Standards Native Review Flow

This is the canonical Runtime Control note for the workstation-local project standards review handoff.

## Source Of Truth

- `dotnet/Suite.RuntimeControl/LocalActions/ProjectStandards/ProjectStandardsActionHandler.cs`
- `dotnet/Suite.RuntimeControl/WorkstationFolderPickerBridge.cs`
- `dotnet/Suite.RuntimeControl/RuntimeShellForm.cs`

## Active Local Route

- `POST /api/workstation/project-standards/run-review`

## Runtime Control Ownership

- Validate the hosted-core ticket for the `run-review` action.
- Enforce allowed origin and ticket scope before local execution.
- Resolve the workstation project root and scan for DWG/DWS files.
- Dispatch the read-only standards review action into the CAD layer.
- Preserve the AutoCAD-compatible response envelope:
  - `success`
  - `code`
  - `message`
  - `requestId`
  - optional `meta`

## Current Flow

1. The browser asks hosted core for `POST /api/project-standards/tickets`.
2. The browser calls Runtime Control at `POST /api/workstation/project-standards/run-review`.
3. Runtime Control validates the ticket and requires:
   - `projectRootPath`
   - `selectedStandardIds`
4. Runtime Control scans the project root for:
   - `*.dwg`
   - `*.dws`
5. Runtime Control dispatches `suite_project_standards_review` to the CAD host.
6. Runtime Control returns the native result set to the browser with the original `requestId`.

## What Runtime Control Does Not Own

- It does not persist the latest standards review; hosted core owns that.
- It does not interpret standards waivers, issue-set state, or transmittal readiness.
- It does not define CAD business rules; the CAD layer owns the native review implementation.

## Downstream Consumers

- Review and readiness surfaces read the hosted latest-review record as package-level evidence.
- Issue-set evidence packets and markdown exports include the hosted latest-review record when it is blocking.
- Transmittal builder now reads the hosted latest-review record before issue and stores a snapshot of that status in saved transmittal receipts.

## Transitional Note

- The current local route performs a deterministic read-only project inspection through the CAD host.
- It is not yet literal `CHECKSTANDARDS` capture or ACADE standards-database mutation.

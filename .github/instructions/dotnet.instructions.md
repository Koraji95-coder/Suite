---
applyTo: "dotnet/**/*.cs"
---
- .NET SDK 8+ is required
- `Suite.RuntimeControl` is the workstation-local companion app
- `suite-cad-authoring` handles in-process AutoCAD Electrical actions
- `autodraft-api-contract` provides AutoDraft contract support
- AutoCAD error envelope contract must be preserved: `{ success, code, message, requestId, meta }`
- Named-pipe bridge is manual-only for explicit diagnostics

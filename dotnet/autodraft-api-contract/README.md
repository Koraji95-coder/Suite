# AutoDraft API Contract (.NET)

This is the initial ASP.NET contract service for AutoDraft. It exposes the
same endpoint surface that the Python backend can proxy to while we migrate CAD
execution from COM scripts into a .NET-native pipeline.

## Endpoints

- `GET /health`
- `GET /api/autodraft/rules`
- `POST /api/autodraft/plan`
- `POST /api/autodraft/execute`
- `POST /api/autodraft/backcheck`
- `POST /api/autodraft/compare`

## Current behavior

- `plan` uses seed deterministic rules and returns normalized action output.
- `execute` is a deterministic preflight executor that accepts only execution-ready actions and reports skipped reasons. It still does not perform CAD writes.
- `backcheck` is a deterministic CAD-context verifier (read-only findings, no CAD writes).
- `compare` runs deterministic plan+backcheck over normalized markups + CAD context.
- The API schema is intended to stay stable while internals evolve.

## Run locally

Requires .NET SDK 8.x or newer (project targets `net8.0`).

```bash
cd dotnet/autodraft-api-contract
dotnet run
```

Default URL comes from `Properties/launchSettings.json` (currently
`http://localhost:5275`).

## Python backend integration

Backend default target is `http://127.0.0.1:5275`. Set this only when you need
to override the target address:

```bash
AUTODRAFT_DOTNET_API_URL=http://127.0.0.1:5275
```

Then the Python `/api/autodraft/*` routes will proxy `plan/execute` to this
service and fall back to local rules if unavailable.

# AutoDraft API Contract (.NET)

This is the initial ASP.NET contract service for AutoDraft. It exposes the
same endpoint surface that the Python backend can proxy to while we migrate CAD
execution from COM scripts into a .NET-native pipeline.

## Endpoints

- `GET /health`
- `GET /api/autodraft/rules`
- `POST /api/autodraft/plan`
- `POST /api/autodraft/execute`

## Current behavior

- `plan` uses seed deterministic rules and returns normalized action output.
- `execute` is a mock executor (dry-run/accepted responses only).
- The API schema is intended to stay stable while internals evolve.

## Run locally

```bash
cd dotnet/autodraft-api-contract
dotnet run
```

Default URL comes from `Properties/launchSettings.json` (currently
`http://localhost:5275`).

## Python backend integration

Set this in your backend environment:

```bash
AUTODRAFT_DOTNET_API_URL=http://localhost:5275
```

Then the Python `/api/autodraft/*` routes will proxy `plan/execute` to this
service and fall back to local rules if unavailable.

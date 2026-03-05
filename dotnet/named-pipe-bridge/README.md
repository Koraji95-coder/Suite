# Named Pipe Server (.NET)

This project hosts a local Windows named-pipe server used by the Python backend
for AutoCAD bridge actions.

## Run

```powershell
dotnet run --project dotnet/named-pipe-bridge/NamedPipeServer.csproj
```

Optional custom pipe name:

```powershell
dotnet run --project dotnet/named-pipe-bridge/NamedPipeServer.csproj -- MyCustomPipeName
```

Backend env must match:

- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet` or `dotnet_fallback_com`
- `AUTOCAD_DOTNET_PIPE_NAME=SUITE_AUTOCAD_PIPE` (or custom name)
- `AUTOCAD_DOTNET_TIMEOUT_MS=30000`
- `AUTOCAD_DOTNET_TOKEN=` (optional, forwarded to request payload)

## Request/Response Contract

Requests are newline-delimited JSON objects.

Request:

```json
{"id":"job-123","action":"conduit_route_obstacle_scan","payload":{"canvasWidth":980},"token":"..."}
```

Response:

```json
{"id":"job-123","ok":true,"result":{"success":true,"meta":{},"warnings":[]},"error":null}
```

If routing fails internally:

```json
{"id":"job-123","ok":false,"result":null,"error":"ACTION_EXECUTION_FAILED: ..."}
```

## Implemented Actions

- `conduit_route_terminal_scan`
- `conduit_route_obstacle_scan`

These actions now perform live AutoCAD scans through COM from the .NET bridge
process and return the same normalized payload shape expected by the backend/UI.

Current implementation notes:

- Uses COM (`AutoCAD.Application*`) from .NET to read `ActiveDocument` + `ModelSpace`.
- Preserves request options (`selectionOnly`, `includeModelspace`, `maxEntities`,
  `layerNames`, `layerTypeOverrides`, canvas sizing).
- Returns `success=false` with `NO_TERMINAL_STRIPS_FOUND` or `NO_OBSTACLES_FOUND`
  when nothing matches.

Planned next step is migration from COM-backed reads to ObjectARX/AutoCAD .NET
database transactions for higher throughput and stronger write/transaction safety.

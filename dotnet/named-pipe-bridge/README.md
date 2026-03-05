# Named Pipe Server (.NET)

This project hosts a local Windows named-pipe server used by the Python backend
for AutoCAD bridge actions.

## Run

Requires .NET SDK 9.x or newer (project targets `net9.0`).

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
- `AUTOCAD_DOTNET_TOKEN=` (optional)
  - when set, requests must provide the same token in the payload
  - mismatches return `AUTH_INVALID_TOKEN`
- `AUTOCAD_DOTNET_COM_READ_RETRY_ATTEMPTS=3` (optional)
- `AUTOCAD_DOTNET_COM_READ_RETRY_DELAY_MS=35` (optional)

## Request/Response Contract

Requests are newline-delimited JSON objects.

Request:

```json
{"id":"job-123","action":"conduit_route_obstacle_scan","payload":{"canvasWidth":980,"requestId":"req-abc-123","layerPreset":"substation_default","layerNames":["S-FNDN-PRIMARY"],"layerTypeOverrides":{"S-FNDN-PRIMARY":"foundation"}},"token":"..."}
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
  `layerPreset`, `layerNames`, `layerTypeOverrides`, `terminalProfile`, canvas sizing).
- Returns `success=false` with `NO_TERMINAL_STRIPS_FOUND` or `NO_OBSTACLES_FOUND`
  when nothing matches.
- Adds bounded transient COM read retries for property/attribute/bounding-box calls.
- Terminal scan supports configurable profile fields:
  - `panelIdKeys`, `panelNameKeys`, `sideKeys`
  - `stripIdKeys`, `stripNumberKeys`, `terminalCountKeys`, `terminalTagKeys`
  - `terminalNameTokens`, `defaultPanelPrefix`, `defaultTerminalCount`
- Terminal scan also reads optional per-terminal label attributes using
  `TERM01_LABEL`, `TERM02_LABEL`, ... and returns `terminalLabels[]` per strip.

Planned next step is migration from COM-backed reads to ObjectARX/AutoCAD .NET
database transactions for higher throughput and stronger write/transaction safety.

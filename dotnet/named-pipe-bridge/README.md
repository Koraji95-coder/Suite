# Named Pipe Server (.NET)

This project hosts a local Windows named-pipe server used by the Python backend
for AutoCAD bridge actions.

## Run

Requires .NET SDK 8.x or newer (project targets `net8.0`).

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
- `AUTOCAD_DOTNET_MAX_PIPE_INSTANCES=4` (optional)
  - max simultaneous named-pipe listener instances (clamped `1..254`)
- `AUTOCAD_DOTNET_MAX_PIPE_WORKERS=2` (optional)
  - bounded concurrent request workers for accepted pipe sessions
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

`result.meta` now includes shared bridge telemetry fields on every action:

- `action`: normalized action name handled by the bridge
- `actionMs`: total action handler duration in milliseconds
- `queueWaitMs`: worker-queue wait time before request execution
- `comReadRetryCount`: transient COM-read retries consumed during the request

If routing fails internally:

```json
{"id":"job-123","ok":false,"result":null,"error":"ACTION_EXECUTION_FAILED: ..."}
```

## Implemented Actions

- `conduit_route_terminal_scan`
- `conduit_route_obstacle_scan`
- `conduit_route_terminal_routes_draw`
- `conduit_route_terminal_labels_sync`
- `etap_dxf_cleanup_run` (queues ETAP plugin cleanup commands such as `ETAPFIX`)

Action handlers are now split out of the monolithic file into dedicated partials:

- `ConduitRouteTerminalScanHandler.cs`
- `ConduitRouteObstacleScanHandler.cs`
- `ConduitRouteTerminalRouteDrawHandler.cs`
- `ConduitRouteTerminalLabelSyncHandler.cs`
- `ConduitRouteEtapCleanupHandler.cs`

For `etap_dxf_cleanup_run`, when `pluginDllPath` is omitted the bridge tries to
auto-discover `EtapDxfCleanup.dll` from common repo build locations:

- `src/components/apps/dxfer/bin/Debug/net8.0-windows/EtapDxfCleanup.dll`
- `src/components/apps/dxfer/bin/Release/net8.0-windows/EtapDxfCleanup.dll`
- `src/components/apps/dxfer/bin/Debug/net48/EtapDxfCleanup.dll`
- `src/components/apps/dxfer/bin/Release/net48/EtapDxfCleanup.dll`

You can override discovery with:

- `AUTOCAD_ETAP_PLUGIN_DLL_PATH=C:\absolute\path\EtapDxfCleanup.dll`

These actions now perform live AutoCAD scans through COM from the .NET bridge
process and return the same normalized payload shape expected by the backend/UI.

Current implementation notes:

- Uses COM (`AutoCAD.Application*`) from .NET to read `ActiveDocument` + `ModelSpace`.
- Preserves request options (`selectionOnly`, `includeModelspace`, `maxEntities`,
  `layerPreset`, `layerNames`, `layerTypeOverrides`, `terminalProfile`, canvas sizing).
- Returns `success=false` with `NO_TERMINAL_STRIPS_FOUND` or `NO_OBSTACLES_FOUND`
  when nothing matches.
- Adds bounded transient COM read retries for property/attribute/bounding-box calls.
- Adds per-request queue/action telemetry and COM retry counters in response `meta`.
- Terminal scan supports configurable profile fields:
  - `panelIdKeys`, `panelNameKeys`, `sideKeys`
  - `stripIdKeys`, `stripNumberKeys`, `terminalCountKeys`, `terminalTagKeys`
  - `terminalNameTokens`, `defaultPanelPrefix`, `defaultTerminalCount`
- Terminal scan also reads optional per-terminal label attributes using
  `TERM01_LABEL`, `TERM02_LABEL`, ... and returns `terminalLabels[]` per strip.
- Terminal label sync writes `TERM01_LABEL`, `TERM02_LABEL`, ... attributes on
  matched terminal strips (with optional target-strip filtering via `strips[]`).

Planned next step is migration from COM-backed reads to ObjectARX/AutoCAD .NET
database transactions for higher throughput and stronger write/transaction safety.

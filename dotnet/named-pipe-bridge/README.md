# Named Pipe Server (.NET)

This project hosts a local Windows named-pipe server used by the Python backend
for AutoCAD bridge diagnostics, manual validation against legacy pipe actions,
and any explicitly enabled bridge-mode AutoDraft fallback.

It is not started by `npm run dev:full` by default, and backend bridge autostart
is disabled unless `AUTOCAD_DOTNET_AUTOSTART_BRIDGE=true`.

## Run

Requires .NET SDK 8.x or newer (project targets `net8.0`).

```powershell
dotnet run --project dotnet/named-pipe-bridge/NamedPipeServer.csproj
```

Optional custom pipe name:

```powershell
dotnet run --project dotnet/named-pipe-bridge/NamedPipeServer.csproj -- MyCustomPipeName
```

Backend env must match the bridge lane you are intentionally validating:

- `AUTOCAD_DOTNET_PIPE_NAME=SUITE_AUTOCAD_PIPE` (or custom name)
- `AUTOCAD_DOTNET_TIMEOUT_MS=30000`
- `AUTOCAD_DOTNET_AUTOSTART_BRIDGE=false` (default; start manually unless you explicitly want backend autostart)
- optional AutoDraft execute bridge mode:
  - `AUTODRAFT_EXECUTE_PROVIDER=dotnet_bridge` or `dotnet_bridge_fallback_api`
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

Action handlers are now split out of the monolithic file into dedicated partials:

- `ConduitRouteTerminalScanHandler.cs`
- `ConduitRouteObstacleScanHandler.cs`
- `ConduitRouteTerminalRouteDrawHandler.cs`
- `ConduitRouteTerminalLabelSyncHandler.cs`

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
  - `blockNameAllowList`, `requireStripId`, `requireTerminalCount`, `requireSide`
  - See **Terminal Scan Profile** section below for full field reference.
- Terminal scan also reads optional per-terminal label attributes using
  `TERM01_LABEL`, `TERM02_LABEL`, ... and returns `terminalLabels[]` per strip.
- Terminal label sync writes `TERM01_LABEL`, `TERM02_LABEL`, ... attributes on
  matched terminal strips (with optional target-strip filtering via `strips[]`).

## Terminal Scan Profile

The `terminalProfile` (or `terminal_profile`) field in the `conduit_route_terminal_scan` and
`conduit_route_terminal_labels_sync` payloads controls how the bridge identifies and classifies
terminal-strip block references in the active drawing.

When the field is omitted, all defaults listed below apply. When it is present, any sub-field that
is omitted also falls back to its default.

### Attribute key arrays

Each field is an ordered array of AutoCAD block-attribute tag names. The bridge checks them
left-to-right and uses the first non-blank match found on the block.

| Field | Default | Purpose |
|---|---|---|
| `panelIdKeys` | `["PANEL_ID","PANEL","PANEL_NAME","CABINET","BOARD"]` | Identifies the parent panel. Falls back to a prefix derived from the strip ID, then `defaultPanelPrefix`. |
| `panelNameKeys` | `["PANEL_NAME","PANEL_DESC","DESCRIPTION","CABINET_NAME","BOARD_NAME"]` | Human-readable panel label. Falls back to the resolved `panelId`. |
| `sideKeys` | `["SIDE","PANEL_SIDE","SECTION","LR"]` | Panel side/section (e.g. `"LEFT"`, `"RIGHT"`). Normalised to uppercase. |
| `stripIdKeys` | `["STRIP_ID","STRIP","TERMINAL_STRIP","TB_ID","TS_ID"]` | Unique strip identifier. If blank, the bridge synthesises an ID from the block name or scan index. |
| `stripNumberKeys` | `["STRIP_NO","STRIP_NUM","STRIP_NUMBER","NUMBER","NO"]` | Numeric strip ordering hint. Used as a sort key; falls back to `0`. |
| `terminalCountKeys` | `["TERMINAL_COUNT","TERMINALS","TERM_COUNT","WAYS","POINT_COUNT"]` | Terminal (pole) count on the strip. Falls back to `defaultTerminalCount`. |
| `terminalTagKeys` | defaults to `stripIdKeys` + `terminalCountKeys` | Extra attribute tags used by block-detection heuristic to classify an unknown block as a terminal strip. |
| `terminalNameTokens` | `["TERMINAL","TERMS","TB","TS","MARSHALLING"]` | Sub-strings checked against the block name to classify it as a terminal strip. Checked case-sensitively after converting the block name to uppercase. |

### Scalar fields

| Field | Type | Default | Purpose |
|---|---|---|---|
| `defaultPanelPrefix` | `string` | `"PANEL"` | Panel ID used when no `panelIdKeys` attribute is found and no prefix can be derived from the strip ID. Normalised to uppercase. |
| `defaultTerminalCount` | `integer` | `12` | Terminal count used when no `terminalCountKeys` attribute is found. Clamped to `1`–`2000`. |

### Qualifier flags

These flags tighten block detection. When set, a block that is missing the required attribute is
silently skipped instead of being accepted by name-based heuristics.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `requireStripId` | `boolean` | `false` | Reject a block that has no `stripIdKeys` attribute value. |
| `requireTerminalCount` | `boolean` | `false` | Reject a block that has no `terminalCountKeys` attribute value. |
| `requireSide` | `boolean` | `false` | Reject a block that has no `sideKeys` attribute value. |

### Allow-list

| Field | Type | Default | Purpose |
|---|---|---|---|
| `blockNameAllowList` | `string[]` | `[]` (all allowed) | When non-empty, only block references whose `EffectiveName` (case-insensitive) appears in this list are considered. All other blocks are skipped before any attribute checks. |

### Example

```json
{
  "id": "job-456",
  "action": "conduit_route_terminal_scan",
  "payload": {
    "requestId": "req-xyz-789",
    "includeModelspace": true,
    "selectionOnly": false,
    "maxEntities": 50000,
    "terminalProfile": {
      "panelIdKeys": ["PANEL_ID", "CABINET"],
      "panelNameKeys": ["PANEL_NAME", "CABINET_NAME"],
      "sideKeys": ["SIDE"],
      "stripIdKeys": ["STRIP_ID", "TB_ID"],
      "stripNumberKeys": ["STRIP_NO"],
      "terminalCountKeys": ["TERMINAL_COUNT", "WAYS"],
      "terminalTagKeys": ["STRIP_ID", "TERMINAL_COUNT"],
      "terminalNameTokens": ["TERMINAL", "TB", "TS"],
      "blockNameAllowList": [],
      "requireStripId": false,
      "requireTerminalCount": false,
      "requireSide": false,
      "defaultPanelPrefix": "PANEL",
      "defaultTerminalCount": 12
    }
  },
  "token": "..."
}
```

The resolved profile is echoed back in `result.meta.terminalProfile` so callers can verify which
defaults were applied.

Planned next step is migration from COM-backed reads to ObjectARX/AutoCAD .NET
database transactions for higher throughput and stronger write/transaction safety.

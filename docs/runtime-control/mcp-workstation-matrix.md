# MCP Workstation Matrix

Canonical workstation profile data lives in `tools/suite-repo-mcp/workstation-profiles.json`.

Use the profile sync script to rewrite the local `suite_repo_mcp` block in `%USERPROFILE%\.codex\config.toml`:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTIN-HOME
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTIN-WORK
```

If you want to preview the generated MCP block without writing `config.toml`, use:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTIN-WORK -PrintToml
```

Restart Codex after any MCP config change.

`scripts/sync-suite-workstation-profile.ps1` is the only supported path for stamping `mcp_servers.suite_repo_mcp.env`. Avoid manual edits to the MCP env block.

## Profiles

| Workstation ID | Computer names | Label | Role |
| --- | --- | --- | --- |
| `DUSTIN-WORK` | `DUSTIN-WORK` | `Dustin Work station` | `work` |
| `DUSTIN-HOME` | `DUSTIN-HOME` | `Dustin Home station` | `home` |

If a machine is not listed in the matrix, the sync helper falls back to:

- `workstationId = COMPUTERNAME`
- `workstationLabel = "<Computer Name> workstation"`
- `workstationRole = secondary`

## Deterministic Naming Rules

- Filesystem collector id: `watchdog-fs-{slug(workstationId)}`
- Filesystem config path: `%LOCALAPPDATA%\Suite\watchdog-collector\config\{workstationId}.json`
- Filesystem startup task/run key: `SuiteWatchdogFilesystemCollector-{workstationId}`
- Filesystem startup check task: `SuiteWatchdogFilesystemCollectorCheck-{workstationId}`
- Filesystem mutex: `Local\SuiteWatchdogFilesystemCollectorDaemon-{slug(workstationId)}`
- AutoCAD collector id: `autocad-{slug(workstationId)}`
- AutoCAD config path: `%LOCALAPPDATA%\Suite\watchdog-autocad-collector\config\{workstationId}-autocad.json`
- AutoCAD state path: `%APPDATA%\CadCommandCenter\tracker-state.json`
- AutoCAD buffer dir: `%LOCALAPPDATA%\Suite\watchdog-autocad-collector\autocad-{slug(workstationId)}`
- AutoCAD startup task/run key: `SuiteWatchdogAutoCADCollector-{workstationId}`
- AutoCAD startup check task: `SuiteWatchdogAutoCADCollectorCheck-{workstationId}`
- AutoCAD mutex: `Local\SuiteWatchdogAutoCADCollectorDaemon-{slug(workstationId)}`

The sync helper also stamps the repo-local watchdog check scripts and the AutoCAD plugin bundle root into `mcp_servers.suite_repo_mcp.env`.

## Combined Workstation Doctor

Use `repo.check_suite_workstation` to run backend/filesystem collector/AutoCAD collector/plugin/readiness checks in one call. The payload is normalized as:

- `ok`
- `workstation`
- `backend`
- `filesystemCollector`
- `autocadCollector`
- `autocadPlugin`
- `autocadReadiness`
- `issues[]`
- `recommendedActions[]`

# MCP Workstation Matrix

Canonical workstation profile data lives in `tools/suite-repo-mcp/workstation-profiles.json`.

Use the profile sync script to rewrite the local `suite_repo_mcp` block in `~/.codex/config.toml`:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTIN-HOME
```

If you want to preview the generated MCP block without writing `config.toml`, use:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTINWARD -PrintToml
```

Restart Codex after any MCP config change.

## Profiles

| Workstation ID | Computer names | Label | Role |
| --- | --- | --- | --- |
| `DUSTINWARD` | `DUSTINWARD` | `Dustin workstation` | `active` |
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

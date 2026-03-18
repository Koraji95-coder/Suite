# Watchdog CAD Tracker

AutoCAD .NET plugin project for the Suite Watchdog tracker.

This project compiles the tracker source from:

- `src/components/apps/watchdog/DrawingTracker.cs`

The plugin runs inside AutoCAD and exports tracker state to:

- `%APPDATA%\CadCommandCenter\tracker-state.json`

That JSON file is consumed by the local Watchdog AutoCAD collector:

- `python scripts/run-watchdog-autocad-state-collector.py`

## Build

```powershell
dotnet build dotnet/watchdog-cad-tracker/WatchdogCadTracker.csproj -v minimal
```

AutoCAD managed references are resolved in this order:

1. `/p:AutoCadInstallDir=...`
2. `AUTOCAD_INSTALL_DIR`
3. `C:\Program Files\Autodesk\AutoCAD $(AutoCadVersion)` where `AutoCadVersion` defaults to `2026`
4. fallback probes for `2026..2022`

Framework selection follows the existing repo convention:

- `2025+` -> `net8.0-windows`
- older versions -> `net48`

## Install For AutoCAD Autoload

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-watchdog-autocad-plugin.ps1
```

That script builds the plugin and installs an Autodesk bundle under:

- `%APPDATA%\Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle`

## Tracker Commands

- `STARTTRACKER`
- `STOPTRACKER`
- `TRACKERSTATUS`
- `TRACKEREXPORT`
- `TRACKERCONFIG`

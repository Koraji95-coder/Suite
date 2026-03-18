[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$MutexName,
    [ValidateRange(1, 300)][int]$RestartDelaySeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runnerScript = (Resolve-Path (Join-Path $PSScriptRoot "run-watchdog-filesystem-collector.py")).Path
$localAppData = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
else {
    Join-Path $env:USERPROFILE "AppData\Local"
}

function Get-TomlStringValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not $Path -or -not (Test-Path $Path)) {
        return $null
    }

    $pattern = "^\s*$([Regex]::Escape($Key))\s*=\s*""([^""]*)"""
    foreach ($line in Get-Content $Path) {
        $match = [Regex]::Match($line, $pattern)
        if ($match.Success) {
            return $match.Groups[1].Value.Trim()
        }
    }

    return $null
}

function Get-WorkstationIdentity {
    param([string]$TomlPath)

    $computerName = [string]($env:COMPUTERNAME)
    $workstationId = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ID")
    if (-not $workstationId) {
        $workstationId = $computerName
    }
    if (-not $workstationId) {
        $workstationId = [System.Net.Dns]::GetHostName()
    }

    [pscustomobject]@{
        WorkstationId = $workstationId.Trim()
        WorkstationLabel = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_LABEL")
        WorkstationRole = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ROLE")
        ComputerName = $computerName.Trim()
    }
}

function Resolve-AbsolutePath {
    param([string]$PathValue)

    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $null
    }
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $PathValue))
}

function Resolve-PythonInvocation {
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) {
        return [pscustomobject]@{
            Executable = $py.Source
            PrefixArgs = @("-3")
        }
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python) {
        return [pscustomobject]@{
            Executable = $python.Source
            PrefixArgs = @()
        }
    }

    throw "Python executable was not found in PATH."
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath
if (-not $ConfigPath) {
    $ConfigPath = Join-Path `
        (Join-Path $localAppData "Suite\watchdog-collector\config") `
        "$($identity.WorkstationId).json"
}
$ConfigPath = Resolve-AbsolutePath -PathValue $ConfigPath

if (-not $MutexName) {
    $MutexName = "Local\SuiteWatchdogFilesystemCollectorDaemon-$($identity.WorkstationId)"
}

$logDir = Join-Path $localAppData "Suite\watchdog-collector\logs"
$null = New-Item -ItemType Directory -Path $logDir -Force
$daemonLogPath = Join-Path $logDir "$($identity.WorkstationId)-daemon.log"

function Write-DaemonLog {
    param([string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $daemonLogPath -Value "[$timestamp] $Message"
}

$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$hasHandle = $false

try {
    $hasHandle = $mutex.WaitOne(0, $false)
    if (-not $hasHandle) {
        Write-DaemonLog "Existing daemon instance detected for $($identity.WorkstationId); exiting."
        return
    }

    Write-DaemonLog "Daemon started for workstation $($identity.WorkstationId). Config path: $ConfigPath"

    while ($true) {
        if (-not (Test-Path $ConfigPath)) {
            Write-DaemonLog "Collector config is missing. Waiting for config file."
            Start-Sleep -Seconds 15
            continue
        }

        try {
            $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        }
        catch {
            Write-DaemonLog "Collector config could not be parsed: $($_.Exception.Message)"
            Start-Sleep -Seconds 15
            continue
        }

        $configWorkstationId = [string]$config.workstationId
        if (
            -not [string]::IsNullOrWhiteSpace($configWorkstationId) -and
            $configWorkstationId.Trim().ToLowerInvariant() -ne $identity.WorkstationId.ToLowerInvariant()
        ) {
            Write-DaemonLog (
                "Collector config workstation mismatch. Expected " +
                "'$($identity.WorkstationId)', got '$configWorkstationId'. Waiting."
            )
            Start-Sleep -Seconds 30
            continue
        }

        try {
            $python = Resolve-PythonInvocation
            $args = @()
            $args += $python.PrefixArgs
            $args += @($runnerScript, "--config", $ConfigPath)

            Write-DaemonLog "Launching filesystem collector."
            Push-Location $repoRoot
            try {
                & $python.Executable @args
                $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
            }
            finally {
                Pop-Location
            }

            Write-DaemonLog "Filesystem collector exited with code $exitCode."
        }
        catch {
            Write-DaemonLog "Filesystem collector failed: $($_.Exception.Message)"
        }

        Start-Sleep -Seconds $RestartDelaySeconds
    }
}
finally {
    if ($hasHandle) {
        try {
            $mutex.ReleaseMutex() | Out-Null
        }
        catch {
        }
    }

    $mutex.Dispose()
}

[CmdletBinding()]
param(
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [switch]$StartIfMissing,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

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
    param(
        [string]$TomlPath,
        [string]$ExplicitWorkstationId
    )

    $computerName = [string]($env:COMPUTERNAME)
    $configuredWorkstationId = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ID")
    $resolvedWorkstationId = if ($ExplicitWorkstationId) {
        $ExplicitWorkstationId
    }
    elseif ($configuredWorkstationId) {
        $configuredWorkstationId
    }
    elseif ($computerName) {
        $computerName
    }
    else {
        [System.Net.Dns]::GetHostName()
    }

    [pscustomobject]@{
        WorkstationId = $resolvedWorkstationId.Trim()
        WorkstationLabel = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_LABEL")
        WorkstationRole = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ROLE")
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

function Get-BackendProcess {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'python3.exe' OR Name = 'pythonw.exe'"
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }
        $normalized = $commandLine.ToLowerInvariant()
        if ($normalized -match "backend[\\/]+api_server\.py") {
            return $process
        }
    }
    return $null
}

function Start-Backend {
    param(
        [string]$PythonPath,
        [string]$WorkingDirectory
    )

    $arguments = @("backend/api_server.py")
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $PythonPath
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.Arguments = $arguments -join " "
    $psi.UseShellExecute = $true
    $psi.WindowStyle = "Hidden"
    Start-Process @psi | Out-Null
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonExe) {
    $pythonExe = (Get-Command python3 -ErrorAction SilentlyContinue).Source
}

$runningProcess = Get-BackendProcess
$startupResult = [pscustomobject]@{
    Running = $false
    ProcessId = $null
    CommandLine = $null
    StartAttempted = $false
    Error = $null
}

if ($runningProcess) {
    $startupResult.Running = $true
    $startupResult.ProcessId = $runningProcess.ProcessId
    $startupResult.CommandLine = $runningProcess.CommandLine
}
elseif ($StartIfMissing) {
    if (-not $pythonExe) {
        $startupResult.Error = "Python executable not available."
    }
    else {
        $startupResult.StartAttempted = $true
        try {
            Start-Backend -PythonPath $pythonExe -WorkingDirectory $repoRoot
            Start-Sleep -Seconds 2
            $runningProcess = Get-BackendProcess
            if ($runningProcess) {
                $startupResult.Running = $true
                $startupResult.ProcessId = $runningProcess.ProcessId
                $startupResult.CommandLine = $runningProcess.CommandLine
            }
            else {
                $startupResult.Error = "Backend start attempted but process not detected."
            }
        }
        catch {
            $startupResult.Error = $_.Exception.Message
        }
    }
}
else {
    $startupResult.Error = "Backend process not running."
}

$result = [pscustomobject]@{
    Workstation = $identity.WorkstationId
    Running = $startupResult.Running
    ProcessId = $startupResult.ProcessId
    CommandLine = $startupResult.CommandLine
    StartAttempted = $startupResult.StartAttempted
    Error = $startupResult.Error
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
}
else {
    Write-Host "Backend startup healthy: $($result.Running)"
    Write-Host "Process ID: $($result.ProcessId)"
    if ($result.CommandLine) {
        Write-Host "Command: $($result.CommandLine)"
    }
    if ($result.StartAttempted) {
        Write-Host "Start requested via python backend/api_server.py"
    }
    if ($result.Error) {
        Write-Host "Error: $($result.Error)"
    }
}

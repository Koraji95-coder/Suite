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
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
. $runtimeSharedScript
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
. $processUtilsScript

function Get-BackendProcess {
    $processes = Get-CimInstance Win32_Process -Filter "Name LIKE 'python%'"
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

function Convert-ToPowerShellQuotedValue {
    param([Parameter(Mandatory = $true)][string]$Value)

    return "'" + $Value.Replace("'", "''") + "'"
}

function Resolve-PythonInvocation {
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) {
        return [pscustomobject]@{
            CommandName = "py"
            PrefixArgs = @("-3")
        }
    }

    if (Get-Command python -ErrorAction SilentlyContinue) {
        return [pscustomobject]@{
            CommandName = "python"
            PrefixArgs = @()
        }
    }

    if (Get-Command python.exe -ErrorAction SilentlyContinue) {
        return [pscustomobject]@{
            CommandName = "python"
            PrefixArgs = @()
        }
    }

    if (Get-Command python3 -ErrorAction SilentlyContinue) {
        return [pscustomobject]@{
            CommandName = "python3"
            PrefixArgs = @()
        }
    }

    return $null
}

function Start-Backend {
    param(
        [Parameter(Mandatory = $true)]$PythonInvocation,
        [string]$WorkingDirectory
    )

    $launchSegments = @("&", $PythonInvocation.CommandName)
    foreach ($argument in ($PythonInvocation.PrefixArgs + @("backend/api_server.py"))) {
        $launchSegments += Convert-ToPowerShellQuotedValue -Value $argument
    }

    $launchCommand = [string]::Join(" ", $launchSegments)
    Start-SuiteDetachedProcess `
        -FilePath "PowerShell.exe" `
        -WorkingDirectory $WorkingDirectory `
        -Arguments @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            $launchCommand
        ) | Out-Null
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$pythonInvocation = Resolve-PythonInvocation

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
    if (-not $pythonInvocation) {
        $startupResult.Error = "Python executable not available."
    }
    else {
        $startupResult.StartAttempted = $true
        try {
            Start-Backend -PythonInvocation $pythonInvocation -WorkingDirectory $repoRoot
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
        Write-Host "Start requested via configured Python launcher."
    }
    if ($result.Error) {
        Write-Host "Error: $($result.Error)"
    }
}

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
$runtimeCoreComposeScript = Join-Path $PSScriptRoot "runtime-core-compose.ps1"
$runtimePaths = Get-SuiteRuntimePaths
$backendLogPath = $runtimePaths.BackendLogPath
New-Item -ItemType Directory -Path (Split-Path -Parent $backendLogPath) -Force | Out-Null

function Invoke-RuntimeCoreComposeJson {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("ps", "up")][string]$Action,
        [string[]]$Services = @()
    )

    if (-not (Test-Path -LiteralPath $runtimeCoreComposeScript -PathType Leaf)) {
        return $null
    }

    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $runtimeCoreComposeScript,
        $Action,
        "-RepoRoot",
        $repoRoot
    )
    if (@($Services).Count -gt 0) {
        $arguments += @("-Services") + @($Services)
    }
    $arguments += "-Json"

    $rawOutput = & PowerShell.exe -WindowStyle Hidden @arguments 2>$null
    $outputText = [string]::Join([Environment]::NewLine, @($rawOutput | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } })).Trim()
    if ([string]::IsNullOrWhiteSpace($outputText)) {
        return $null
    }

    try {
        return $outputText | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Get-RuntimeCoreBackendEntry {
    $composePayload = Invoke-RuntimeCoreComposeJson -Action "ps"
    if ($null -eq $composePayload -or -not $composePayload.ok -or $null -eq $composePayload.payload) {
        return $null
    }

    return @($composePayload.payload | Where-Object {
        [string]$serviceName = if ($_.PSObject.Properties.Name -contains "Service") { [string]$_.Service } elseif ($_.PSObject.Properties.Name -contains "service") { [string]$_.service } else { "" }
        $serviceName.Trim().ToLowerInvariant() -eq "backend"
    }) | Select-Object -First 1
}

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

function Test-BackendHealth {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:5000/health" -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    }
    catch {
        return $false
    }
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId

$backendContainer = Get-RuntimeCoreBackendEntry
$backendContainerRunning = $false
if ($backendContainer) {
    $containerStateText = [string]::Join(" ", @(
        if ($backendContainer.PSObject.Properties.Name -contains "State") { [string]$backendContainer.State } else { "" }
        if ($backendContainer.PSObject.Properties.Name -contains "Status") { [string]$backendContainer.Status } else { "" }
    )).Trim().ToLowerInvariant()
    $backendContainerRunning = (
        $containerStateText.Contains("running") -or
        $containerStateText.Contains("healthy")
    )
}

$runningProcess = Get-BackendProcess
$startupResult = [pscustomobject]@{
    Running = $false
    Healthy = $false
    ProcessId = $null
    CommandLine = $null
    StartAttempted = $false
    Error = $null
    StartupMode = $null
    ExpectedStartupMode = "docker_compose"
    OwnershipDrift = $false
}

if ($backendContainerRunning) {
    $startupResult.Running = $true
    $startupResult.Healthy = Test-BackendHealth
    $startupResult.CommandLine = "docker compose service backend"
    $startupResult.StartupMode = "docker_compose"
}
elseif ($runningProcess) {
    $startupResult.Running = $true
    $startupResult.ProcessId = $runningProcess.ProcessId
    $startupResult.CommandLine = $runningProcess.CommandLine
    $startupResult.StartupMode = "native_process"
    $startupResult.OwnershipDrift = $true
    $startupResult.Error = "Native backend process detected outside runtime-core Docker ownership."
}
elseif ($StartIfMissing) {
    $composeStart = Invoke-RuntimeCoreComposeJson -Action "up" -Services @("backend")
    if ($composeStart -and $composeStart.ok) {
        $startupResult.StartAttempted = $true
        Start-Sleep -Seconds 3
        $backendContainer = Get-RuntimeCoreBackendEntry
        if ($backendContainer) {
            $containerStateText = [string]::Join(" ", @(
                if ($backendContainer.PSObject.Properties.Name -contains "State") { [string]$backendContainer.State } else { "" }
                if ($backendContainer.PSObject.Properties.Name -contains "Status") { [string]$backendContainer.Status } else { "" }
            )).Trim().ToLowerInvariant()
            if ($containerStateText.Contains("running") -or $containerStateText.Contains("healthy")) {
                $startupResult.Running = $true
                $startupResult.Healthy = Test-BackendHealth
                $startupResult.CommandLine = "docker compose service backend"
                $startupResult.StartupMode = "docker_compose"
            }
        }

        if ($startupResult.Running -and -not $startupResult.Healthy) {
            $startupResult.Error = "Backend container is running but the health endpoint is not ready."
        }
        elseif (-not $startupResult.Running) {
            $startupResult.Error = if (-not [string]::IsNullOrWhiteSpace([string]$composeStart.outputText)) { [string]$composeStart.outputText } else { "Backend compose start attempted but container not detected." }
        }
    }
    else {
        $startupResult.StartAttempted = $true
        $startupResult.Error = if ($composeStart -and -not [string]::IsNullOrWhiteSpace([string]$composeStart.outputText)) {
            [string]$composeStart.outputText
        }
        else {
            "Backend compose start failed. Native backend fallback is disabled for runtime-core ownership."
        }
    }
}
else {
    $startupResult.Error = "Backend is not running."
}

if (
    -not [string]::IsNullOrWhiteSpace([string]$startupResult.StartupMode) -and
    $startupResult.StartupMode -ne "docker_compose"
) {
    $startupResult.OwnershipDrift = $true
}

$result = [pscustomobject]@{
    Workstation = $identity.WorkstationId
    Running = $startupResult.Running
    Healthy = $startupResult.Healthy
    ProcessId = $startupResult.ProcessId
    CommandLine = $startupResult.CommandLine
    LogPath = $backendLogPath
    StartAttempted = $startupResult.StartAttempted
    Error = $startupResult.Error
    StartupMode = $startupResult.StartupMode
    ExpectedStartupMode = $startupResult.ExpectedStartupMode
    OwnershipDrift = $startupResult.OwnershipDrift
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
}
else {
    Write-Host "Backend running: $($result.Running)"
    Write-Host "Managed health ready: $($result.Healthy)"
    Write-Host "Process ID: $($result.ProcessId)"
    Write-Host "Log path: $($result.LogPath)"
    Write-Host "Startup mode: $($result.StartupMode)"
    Write-Host "Ownership drift: $($result.OwnershipDrift)"
    if ($result.CommandLine) {
        Write-Host "Command: $($result.CommandLine)"
    }
    if ($result.StartAttempted) {
        Write-Host "Start requested via runtime-core Docker ownership."
    }
    if ($result.Error) {
        Write-Host "Error: $($result.Error)"
    }
}

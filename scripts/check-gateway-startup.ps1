[CmdletBinding()]
param(
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [ValidateRange(5, 300)][int]$StartupTimeoutSeconds = 90,
    [switch]$StartIfMissing,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
. $runtimeSharedScript
$gatewayLaunchScript = (Resolve-Path (Join-Path $PSScriptRoot "run-agent-gateway.mjs")).Path
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
. $processUtilsScript
$dotenvPath = Join-Path $repoRoot ".env"
$localDotenvPath = Join-Path $repoRoot ".env.local"

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not $Path -or -not (Test-Path $Path)) {
        return $null
    }

    $pattern = "^\s*$([Regex]::Escape($Key))=(.*)$"
    foreach ($line in Get-Content $Path) {
        $match = [Regex]::Match($line, $pattern)
        if ($match.Success) {
            return $match.Groups[1].Value.Trim()
        }
    }

    return $null
}

function Get-RepoEnvValue {
    param([string]$Key)

    $localValue = [string](Get-DotEnvValue -Path $localDotenvPath -Key $Key)
    if (-not [string]::IsNullOrWhiteSpace($localValue)) {
        return $localValue.Trim()
    }

    $repoValue = [string](Get-DotEnvValue -Path $dotenvPath -Key $Key)
    if (-not [string]::IsNullOrWhiteSpace($repoValue)) {
        return $repoValue.Trim()
    }

    return $null
}

function Resolve-GatewayEndpoint {
    $configuredHost = if (-not [string]::IsNullOrWhiteSpace($env:AGENT_GATEWAY_HOST)) {
        $env:AGENT_GATEWAY_HOST.Trim()
    }
    else {
        [string](Get-RepoEnvValue -Key "AGENT_GATEWAY_HOST")
    }
    if ([string]::IsNullOrWhiteSpace($configuredHost)) {
        $configuredHost = "127.0.0.1"
    }

    $configuredPort = if (-not [string]::IsNullOrWhiteSpace($env:AGENT_GATEWAY_PORT)) {
        $env:AGENT_GATEWAY_PORT.Trim()
    }
    else {
        [string](Get-RepoEnvValue -Key "AGENT_GATEWAY_PORT")
    }
    if ([string]::IsNullOrWhiteSpace($configuredPort)) {
        $configuredPort = "3000"
    }

    $port = 3000
    [int]::TryParse($configuredPort, [ref]$port) | Out-Null

    $probeHost = switch ($configuredHost.ToLowerInvariant()) {
        "0.0.0.0" { "127.0.0.1"; break }
        "::" { "127.0.0.1"; break }
        "*" { "127.0.0.1"; break }
        default { $configuredHost; break }
    }

    [pscustomobject]@{
        Host = $configuredHost
        Port = $port
        ProbeHost = $probeHost
        HealthUrl = "http://$probeHost`:$port/health"
    }
}

function Get-ListeningGatewayProcess {
    param([int]$Port)

    $command = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $connections) {
        if (-not $processId) {
            continue
        }

        try {
            return Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
        }
        catch {
            continue
        }
    }

    return $null
}

function Get-GatewayCandidateProcess {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'node' OR Name = 'powershell.exe' OR Name = 'pwsh.exe'"
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        $normalized = $commandLine.ToLowerInvariant()
        if (
            $normalized.Contains("run-agent-gateway.mjs") -or
            $normalized.Contains("suite-agent-gateway.mjs")
        ) {
            return $process
        }
    }

    return $null
}

function Get-GatewayProcessMode {
    param($Process)

    if ($null -eq $Process) {
        return $null
    }

    $commandLine = [string]$Process.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) {
        return $null
    }

    $normalized = $commandLine.ToLowerInvariant()
    if (
        $normalized.Contains("suite-agent-gateway.mjs") -or
        $normalized.Contains("run-agent-gateway.mjs")
    ) {
        return "suite_native"
    }

    return $null
}

function Stop-GatewayProcesses {
    $stoppedIds = New-Object System.Collections.Generic.List[int]
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'node' OR Name = 'powershell.exe' OR Name = 'pwsh.exe'"

    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        $normalized = $commandLine.ToLowerInvariant()
        if (
            $normalized.Contains("run-agent-gateway.mjs") -or
            $normalized.Contains("suite-agent-gateway.mjs")
        ) {
            $processId = [int]$process.ProcessId
            if ($stoppedIds.Contains($processId)) {
                continue
            }

            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                $stoppedIds.Add($processId) | Out-Null
            }
            catch {
            }
        }
    }

    return @($stoppedIds.ToArray())
}

function Test-GatewayHealth {
    param([string]$HealthUrl)

    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    }
    catch {
        return $false
    }
}

function Resolve-NodeExecutable {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) {
        return $node.Source
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        return $node.Source
    }

    return $null
}

function Start-GatewayProcess {
    param([Parameter(Mandatory = $true)][string]$NodeExecutable)

    Start-SuiteDetachedProcess `
        -FilePath $NodeExecutable `
        -WorkingDirectory $repoRoot `
        -Arguments @($gatewayLaunchScript) | Out-Null
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$endpoint = Resolve-GatewayEndpoint
$gatewayMode = Get-SuiteGatewayMode
$gatewayModeLabel = Get-SuiteGatewayModeLabel -GatewayMode $gatewayMode

$gatewayProcess = Get-ListeningGatewayProcess -Port $endpoint.Port
if (-not $gatewayProcess) {
    $gatewayProcess = Get-GatewayCandidateProcess
}
$healthy = Test-GatewayHealth -HealthUrl $endpoint.HealthUrl
$listening = $null -ne (Get-ListeningGatewayProcess -Port $endpoint.Port)
$gatewayProcessMode = Get-GatewayProcessMode -Process $gatewayProcess
$gatewayModeMatches = [string]::IsNullOrWhiteSpace([string]$gatewayProcessMode) -or ($gatewayProcessMode -eq $gatewayMode)
$runningCandidate = $healthy -or $listening -or $null -ne $gatewayProcess
$startAttempted = $false
$errorMessage = $null

if ($runningCandidate -and -not $gatewayModeMatches -and $StartIfMissing) {
    $stoppedProcessIds = Stop-GatewayProcesses
    Start-Sleep -Seconds 2
    $gatewayProcess = $null
    $healthy = $false
    $listening = $null -ne (Get-ListeningGatewayProcess -Port $endpoint.Port)
    $gatewayProcessMode = $null
    $gatewayModeMatches = $true
}

if (-not $healthy -and $StartIfMissing) {
    $nodeExecutable = Resolve-NodeExecutable
    if (-not $nodeExecutable) {
        $errorMessage = "Node executable not available."
    }
    else {
        $startAttempted = $true
        try {
            Start-GatewayProcess -NodeExecutable $nodeExecutable
            $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
            do {
                Start-Sleep -Seconds 2
                $healthy = Test-GatewayHealth -HealthUrl $endpoint.HealthUrl
                $listeningProcess = Get-ListeningGatewayProcess -Port $endpoint.Port
                $listening = $null -ne $listeningProcess
                if ($listeningProcess) {
                    $gatewayProcess = $listeningProcess
                }
                elseif (-not $gatewayProcess) {
                    $gatewayProcess = Get-GatewayCandidateProcess
                }
                $gatewayProcessMode = Get-GatewayProcessMode -Process $gatewayProcess
                $gatewayModeMatches = [string]::IsNullOrWhiteSpace([string]$gatewayProcessMode) -or ($gatewayProcessMode -eq $gatewayMode)
                if ($healthy -and -not $gatewayModeMatches) {
                    $healthy = $false
                }
            } while ((Get-Date) -lt $deadline -and -not $healthy)
        }
        catch {
            $errorMessage = $_.Exception.Message
        }
    }
}

if (-not $gatewayProcess) {
    $gatewayProcess = Get-GatewayCandidateProcess
}
if (-not $listening) {
    $listening = $null -ne (Get-ListeningGatewayProcess -Port $endpoint.Port)
}
$gatewayProcessMode = Get-GatewayProcessMode -Process $gatewayProcess
$gatewayModeMatches = [string]::IsNullOrWhiteSpace([string]$gatewayProcessMode) -or ($gatewayProcessMode -eq $gatewayMode)

if ($healthy -and -not $gatewayModeMatches) {
    $healthy = $false
}

$running = $healthy -or $listening -or $null -ne $gatewayProcess
if (-not $healthy -and [string]::IsNullOrWhiteSpace($errorMessage)) {
    if ($running -and -not $gatewayModeMatches) {
        $actualGatewayModeLabel = Get-SuiteGatewayModeLabel -GatewayMode $gatewayProcessMode
        $errorMessage = "Gateway is running in $actualGatewayModeLabel mode while $gatewayModeLabel is configured."
    }
    elseif (-not $running) {
        $errorMessage = "Gateway process not running."
    }
    elseif ($startAttempted) {
        $errorMessage = "Gateway start attempted but health check did not pass within $StartupTimeoutSeconds seconds."
    }
    else {
        $errorMessage = "Gateway process is running but the health endpoint is not ready."
    }
}

$checkedAt = (Get-Date).ToString("o")
$serviceState = if ($healthy) {
    "ready"
}
elseif ($running -or $listening) {
    "needs-attention"
}
else {
    "unavailable"
}
$serviceDetail = if ($healthy) {
    "$gatewayModeLabel gateway health endpoint is available."
}
elseif (-not [string]::IsNullOrWhiteSpace($errorMessage)) {
    $errorMessage
}
elseif ($running) {
    "$gatewayModeLabel gateway process is present but the health endpoint is not ready."
}
else {
    "$gatewayModeLabel gateway is not running."
}

$result = [pscustomobject]@{
    schemaVersion = "suite.runtime.v1"
    checkedAt = $checkedAt
    Workstation = $identity.WorkstationId
    Host = $endpoint.Host
    Port = $endpoint.Port
    ProbeHost = $endpoint.ProbeHost
    HealthUrl = $endpoint.HealthUrl
    GatewayMode = $gatewayMode
    GatewayModeLabel = $gatewayModeLabel
    GatewayProcessMode = $gatewayProcessMode
    GatewayModeMatches = $gatewayModeMatches
    Running = $running
    Listening = $listening
    Healthy = $healthy
    ProcessId = if ($gatewayProcess) { $gatewayProcess.ProcessId } else { $null }
    CommandLine = if ($gatewayProcess) { $gatewayProcess.CommandLine } else { $null }
    StartAttempted = $startAttempted
    Error = $errorMessage
    service = [pscustomobject]@{
        id = "gateway"
        label = "Gateway"
        state = $serviceState
        source = "script:check-gateway-startup.ps1"
        observedAt = $checkedAt
        actionableIssueCount = if ($serviceState -eq "ready") { 0 } else { 1 }
        checks = @(
            [pscustomobject]@{
                key = "gateway-health"
                label = "Gateway health endpoint"
                subsystem = "gateway"
                severity = $serviceState
                detail = $serviceDetail
                actionable = ($serviceState -ne "ready")
                evidence = [pscustomobject]@{
                    healthUrl = $endpoint.HealthUrl
                    listening = $listening
                    processId = if ($gatewayProcess) { $gatewayProcess.ProcessId } else { $null }
                    startAttempted = $startAttempted
                    gatewayMode = $gatewayMode
                    gatewayProcessMode = $gatewayProcessMode
                    gatewayModeMatches = $gatewayModeMatches
                }
            }
        )
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
}
else {
    Write-Host "Gateway startup healthy: $($result.Healthy)"
    Write-Host "Listening: $($result.Listening)"
    Write-Host "Process ID: $($result.ProcessId)"
    Write-Host "Health URL: $($result.HealthUrl)"
    Write-Host "Gateway mode: $($result.GatewayModeLabel)"
    if ($result.GatewayProcessMode) {
        Write-Host "Gateway process mode: $(Get-SuiteGatewayModeLabel -GatewayMode $result.GatewayProcessMode)"
    }
    if ($result.CommandLine) {
        Write-Host "Command: $($result.CommandLine)"
    }
    if ($result.StartAttempted) {
        Write-Host "Start requested via node scripts/run-agent-gateway.mjs."
    }
    if ($result.Error) {
        Write-Host "Error: $($result.Error)"
    }
}

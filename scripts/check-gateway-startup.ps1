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
$runtimeCoreComposeScript = Join-Path $PSScriptRoot "runtime-core-compose.ps1"
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
. $processUtilsScript
$runtimePaths = Get-SuiteRuntimePaths
$gatewayLogPath = $runtimePaths.GatewayLogPath
New-Item -ItemType Directory -Path (Split-Path -Parent $gatewayLogPath) -Force | Out-Null
$dotenvPath = Join-Path $repoRoot ".env"
$localDotenvPath = Join-Path $repoRoot ".env.local"

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

function Get-RuntimeCoreGatewayEntry {
    $composePayload = Invoke-RuntimeCoreComposeJson -Action "ps"
    if ($null -eq $composePayload -or -not $composePayload.ok -or $null -eq $composePayload.payload) {
        return $null
    }

    return @($composePayload.payload | Where-Object {
        $serviceName = if ($_.PSObject.Properties.Name -contains "Service") { [string]$_.Service } elseif ($_.PSObject.Properties.Name -contains "service") { [string]$_.service } else { "" }
        $serviceName.Trim().ToLowerInvariant() -eq "gateway"
    }) | Select-Object -First 1
}

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
        $configuredPort = "3001"
    }

    $port = 3001
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
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
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

function Convert-ToPowerShellQuotedValue {
    param([Parameter(Mandatory = $true)][string]$Value)

    return "'" + $Value.Replace("'", "''") + "'"
}

function Start-GatewayProcess {
    param(
        [Parameter(Mandatory = $true)][string]$NodeExecutable,
        [Parameter(Mandatory = $true)][string]$LogPath
    )

    $launchCommand = [string]::Join(
        " ",
        @(
            "&"
            (Convert-ToPowerShellQuotedValue -Value $NodeExecutable)
            (Convert-ToPowerShellQuotedValue -Value $gatewayLaunchScript)
            "*>>"
            (Convert-ToPowerShellQuotedValue -Value $LogPath)
        )
    )

    Start-SuiteDetachedProcess `
        -FilePath "PowerShell.exe" `
        -WorkingDirectory $repoRoot `
        -Arguments @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-Command",
            $launchCommand
        ) | Out-Null
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$endpoint = Resolve-GatewayEndpoint
$gatewayMode = Get-SuiteGatewayMode
$gatewayModeLabel = Get-SuiteGatewayModeLabel -GatewayMode $gatewayMode
$gatewayProcess = Get-ListeningGatewayProcess -Port $endpoint.Port
if (-not $gatewayProcess) {
    $gatewayProcess = Get-GatewayCandidateProcess
}
$gatewayContainer = Get-RuntimeCoreGatewayEntry
$gatewayContainerRunning = $false
if ($gatewayContainer) {
    $containerStateText = [string]::Join(" ", @(
        if ($gatewayContainer.PSObject.Properties.Name -contains "State") { [string]$gatewayContainer.State } else { "" }
        if ($gatewayContainer.PSObject.Properties.Name -contains "Status") { [string]$gatewayContainer.Status } else { "" }
    )).Trim().ToLowerInvariant()
    $gatewayContainerRunning = (
        $containerStateText.Contains("running") -or
        $containerStateText.Contains("healthy")
    )
}
$gatewayCommandLine = if ($gatewayContainerRunning) { "docker compose service gateway" } else { if ($gatewayProcess) { [string]$gatewayProcess.CommandLine } else { $null } }
$gatewayEndpointReady = Test-GatewayHealth -HealthUrl $endpoint.HealthUrl
$listeningProcess = Get-ListeningGatewayProcess -Port $endpoint.Port
$listening = $null -ne $listeningProcess
if ($listeningProcess) {
    $gatewayProcess = $listeningProcess
    if (-not $gatewayContainerRunning) {
        $gatewayCommandLine = [string]$listeningProcess.CommandLine
    }
}
$gatewayProcessMode = if ($gatewayContainerRunning) { "suite_native" } else { Get-GatewayProcessMode -Process $gatewayProcess }
$gatewayModeMatches = [string]::IsNullOrWhiteSpace([string]$gatewayProcessMode) -or ($gatewayProcessMode -eq $gatewayMode)
$startAttempted = $false
$ownershipDrift = $false
$healthy = $gatewayContainerRunning -and $gatewayEndpointReady -and $gatewayModeMatches
$running = $gatewayContainerRunning -or $listening -or $null -ne $gatewayProcess
$errorMessage = $null

if (-not $gatewayContainerRunning -and $StartIfMissing) {
    if ($listening -or $null -ne $gatewayProcess) {
        $ownershipDrift = $true
        $errorMessage = "Native gateway process detected outside runtime-core Docker ownership. Stop the native gateway and rerun bootstrap."
    }
    else {
        $composeStart = Invoke-RuntimeCoreComposeJson -Action "up" -Services @("gateway")
        if ($composeStart -and $composeStart.ok) {
            $startAttempted = $true
            $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
            do {
                Start-Sleep -Seconds 2
                $gatewayContainer = Get-RuntimeCoreGatewayEntry
                if ($gatewayContainer) {
                    $containerStateText = [string]::Join(" ", @(
                        if ($gatewayContainer.PSObject.Properties.Name -contains "State") { [string]$gatewayContainer.State } else { "" }
                        if ($gatewayContainer.PSObject.Properties.Name -contains "Status") { [string]$gatewayContainer.Status } else { "" }
                    )).Trim().ToLowerInvariant()
                    $gatewayContainerRunning = (
                        $containerStateText.Contains("running") -or
                        $containerStateText.Contains("healthy")
                    )
                }
                else {
                    $gatewayContainerRunning = $false
                }

                $gatewayEndpointReady = Test-GatewayHealth -HealthUrl $endpoint.HealthUrl
                $healthy = $gatewayContainerRunning -and $gatewayEndpointReady
                if ($gatewayContainerRunning) {
                    $gatewayCommandLine = "docker compose service gateway"
                    $gatewayProcessMode = "suite_native"
                    $gatewayModeMatches = $true
                }
            } while ((Get-Date) -lt $deadline -and -not $healthy)
        }
        else {
            $startAttempted = $true
            $errorMessage = if ($composeStart -and -not [string]::IsNullOrWhiteSpace([string]$composeStart.outputText)) {
                [string]$composeStart.outputText
            }
            else {
                "Gateway compose start failed. Native gateway fallback is disabled for runtime-core ownership."
            }
        }
    }
}

if (-not $gatewayProcess) {
    $gatewayProcess = Get-GatewayCandidateProcess
    if ($gatewayProcess -and -not $gatewayContainerRunning) {
        $gatewayCommandLine = [string]$gatewayProcess.CommandLine
    }
}
$listeningProcess = Get-ListeningGatewayProcess -Port $endpoint.Port
$listening = $null -ne $listeningProcess
if ($listeningProcess) {
    $gatewayProcess = $listeningProcess
    if (-not $gatewayContainerRunning) {
        $gatewayCommandLine = [string]$listeningProcess.CommandLine
    }
}
$gatewayProcessMode = if ($gatewayContainerRunning) { "suite_native" } else { Get-GatewayProcessMode -Process $gatewayProcess }
$gatewayModeMatches = [string]::IsNullOrWhiteSpace([string]$gatewayProcessMode) -or ($gatewayProcessMode -eq $gatewayMode)
$gatewayEndpointReady = Test-GatewayHealth -HealthUrl $endpoint.HealthUrl
$healthy = $gatewayContainerRunning -and $gatewayEndpointReady -and $gatewayModeMatches
$running = $gatewayContainerRunning -or $listening -or $null -ne $gatewayProcess
$ownershipDrift = $ownershipDrift -or ($running -and -not $gatewayContainerRunning)

if (-not $healthy -and [string]::IsNullOrWhiteSpace($errorMessage)) {
    if ($ownershipDrift) {
        $errorMessage = "Gateway is responding outside runtime-core Docker ownership."
    }
    elseif ($running -and -not $gatewayModeMatches) {
        $actualGatewayModeLabel = Get-SuiteGatewayModeLabel -GatewayMode $gatewayProcessMode
        $errorMessage = "Gateway is running in $actualGatewayModeLabel mode while $gatewayModeLabel is configured."
    }
    elseif (-not $running) {
        $errorMessage = "Gateway is not running."
    }
    elseif ($startAttempted) {
        $errorMessage = "Gateway compose start was requested but the health endpoint did not become ready within $StartupTimeoutSeconds seconds."
    }
    else {
        $errorMessage = "Gateway container is running but the health endpoint is not ready."
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
    CommandLine = $gatewayCommandLine
    StartAttempted = $startAttempted
    StartupMode = if ($gatewayContainerRunning) { "docker_compose" } elseif ($gatewayProcess) { "native_process" } else { $null }
    ExpectedStartupMode = "docker_compose"
    OwnershipDrift = $ownershipDrift
    LogPath = $gatewayLogPath
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
    Write-Host "Gateway running: $($result.Running)"
    Write-Host "Managed health ready: $($result.Healthy)"
    Write-Host "Listening: $($result.Listening)"
    Write-Host "Process ID: $($result.ProcessId)"
    Write-Host "Health URL: $($result.HealthUrl)"
    Write-Host "Log path: $($result.LogPath)"
    Write-Host "Gateway mode: $($result.GatewayModeLabel)"
    Write-Host "Startup mode: $($result.StartupMode)"
    Write-Host "Ownership drift: $($result.OwnershipDrift)"
    if ($result.GatewayProcessMode) {
        Write-Host "Gateway process mode: $(Get-SuiteGatewayModeLabel -GatewayMode $result.GatewayProcessMode)"
    }
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

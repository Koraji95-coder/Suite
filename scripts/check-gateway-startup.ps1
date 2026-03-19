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
$gatewayLaunchScript = (Resolve-Path (Join-Path $PSScriptRoot "run-agent-gateway.mjs")).Path
$dotenvPath = Join-Path $repoRoot ".env"

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

function Resolve-GatewayEndpoint {
    $configuredHost = if (-not [string]::IsNullOrWhiteSpace($env:AGENT_GATEWAY_HOST)) {
        $env:AGENT_GATEWAY_HOST.Trim()
    }
    else {
        [string](Get-DotEnvValue -Path $dotenvPath -Key "AGENT_GATEWAY_HOST")
    }
    if ([string]::IsNullOrWhiteSpace($configuredHost)) {
        $configuredHost = "127.0.0.1"
    }

    $configuredPort = if (-not [string]::IsNullOrWhiteSpace($env:AGENT_GATEWAY_PORT)) {
        $env:AGENT_GATEWAY_PORT.Trim()
    }
    else {
        [string](Get-DotEnvValue -Path $dotenvPath -Key "AGENT_GATEWAY_PORT")
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
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'node' OR Name = 'cargo.exe' OR Name = 'cargo' OR Name = 'zeroclaw-gateway.exe' OR Name = 'zeroclaw.exe' OR Name = 'powershell.exe' OR Name = 'pwsh.exe'"
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        $normalized = $commandLine.ToLowerInvariant()
        if (
            $normalized.Contains("run-agent-gateway.mjs") -or
            $normalized.Contains("zeroclaw-gateway") -or
            $normalized.Contains("zeroclaw gateway")
        ) {
            return $process
        }
    }

    return $null
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

    Start-Process `
        -FilePath $NodeExecutable `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -ArgumentList @($gatewayLaunchScript) | Out-Null
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$endpoint = Resolve-GatewayEndpoint

$gatewayProcess = Get-ListeningGatewayProcess -Port $endpoint.Port
if (-not $gatewayProcess) {
    $gatewayProcess = Get-GatewayCandidateProcess
}
$healthy = Test-GatewayHealth -HealthUrl $endpoint.HealthUrl
$listening = $null -ne (Get-ListeningGatewayProcess -Port $endpoint.Port)
$startAttempted = $false
$errorMessage = $null

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

$running = $healthy -or $listening -or $null -ne $gatewayProcess
if (-not $healthy -and [string]::IsNullOrWhiteSpace($errorMessage)) {
    if (-not $running) {
        $errorMessage = "Gateway process not running."
    }
    elseif ($startAttempted) {
        $errorMessage = "Gateway start attempted but health check did not pass within $StartupTimeoutSeconds seconds."
    }
    else {
        $errorMessage = "Gateway process is running but the health endpoint is not ready."
    }
}

$result = [pscustomobject]@{
    Workstation = $identity.WorkstationId
    Host = $endpoint.Host
    Port = $endpoint.Port
    ProbeHost = $endpoint.ProbeHost
    HealthUrl = $endpoint.HealthUrl
    Running = $running
    Listening = $listening
    Healthy = $healthy
    ProcessId = if ($gatewayProcess) { $gatewayProcess.ProcessId } else { $null }
    CommandLine = if ($gatewayProcess) { $gatewayProcess.CommandLine } else { $null }
    StartAttempted = $startAttempted
    Error = $errorMessage
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
}
else {
    Write-Host "Gateway startup healthy: $($result.Healthy)"
    Write-Host "Listening: $($result.Listening)"
    Write-Host "Process ID: $($result.ProcessId)"
    Write-Host "Health URL: $($result.HealthUrl)"
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

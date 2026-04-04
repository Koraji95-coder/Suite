[CmdletBinding()]
param(
    [string]$RepoRoot,
    [ValidateRange(5, 300)][int]$StartupTimeoutSeconds = 90,
    [switch]$StartIfMissing,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
. $runtimeSharedScript
$workerScriptPath = (Resolve-Path (Join-Path $PSScriptRoot "run-suite-frontend-dev.ps1")).Path
$runtimeCoreComposeScript = Join-Path $PSScriptRoot "runtime-core-compose.ps1"
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
. $processUtilsScript
$runtimePaths = Get-SuiteRuntimePaths
$runtimeStatusDir = $runtimePaths.RuntimeStatusDir
$frontendLogPath = $runtimePaths.FrontendLogPath
$bootstrapLogPath = $runtimePaths.RuntimeLogPath
$frontendUrl = "http://127.0.0.1:5173"

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
        $resolvedRepoRoot
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

function Get-RuntimeCoreFrontendEntry {
    $composePayload = Invoke-RuntimeCoreComposeJson -Action "ps"
    if ($null -eq $composePayload -or -not $composePayload.ok -or $null -eq $composePayload.payload) {
        return $null
    }

    return @($composePayload.payload | Where-Object {
        $serviceName = if ($_.PSObject.Properties.Name -contains "Service") { [string]$_.Service } elseif ($_.PSObject.Properties.Name -contains "service") { [string]$_.service } else { "" }
        $serviceName.Trim().ToLowerInvariant() -eq "frontend"
    }) | Select-Object -First 1
}

function Get-ComposeServiceHealthState {
    param($ComposeEntry)

    if ($null -eq $ComposeEntry) {
        return $null
    }

    $health = if ($ComposeEntry.PSObject.Properties.Name -contains "Health") {
        [string]$ComposeEntry.Health
    }
    else {
        $null
    }

    if (-not [string]::IsNullOrWhiteSpace($health)) {
        return $health.Trim().ToLowerInvariant()
    }

    $statusText = if ($ComposeEntry.PSObject.Properties.Name -contains "Status") {
        [string]$ComposeEntry.Status
    }
    else {
        ""
    }

    if ($statusText -match "\((?<health>[A-Za-z]+)\)") {
        return [string]$matches["health"].Trim().ToLowerInvariant()
    }

    return $null
}

function Get-ListeningFrontendProcess {
    $command = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }

    $connections = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
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

function Get-FrontendWorkerProcess {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'"
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        $normalized = $commandLine.ToLowerInvariant()
        if (
            $normalized.Contains("run-suite-frontend-dev.ps1") -and
            $normalized.Contains("-frontendlogpath") -and
            $normalized.Contains("-file")
        ) {
            return $process
        }
    }

    return $null
}

function Test-FrontendHealth {
    param(
        [ValidateRange(1, 10)][int]$Attempts = 3,
        [ValidateRange(1, 30)][int]$TimeoutSec = 2,
        [ValidateRange(0, 5000)][int]$DelayMilliseconds = 400
    )

    Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue

    function Invoke-FrontendProbeRequest {
        param(
            [Parameter(Mandatory = $true)][string]$Method,
            [Parameter(Mandatory = $true)][int]$RequestTimeoutSec
        )

        $handler = [System.Net.Http.HttpClientHandler]::new()
        $handler.UseProxy = $false
        $client = [System.Net.Http.HttpClient]::new($handler)
        $client.Timeout = [TimeSpan]::FromSeconds($RequestTimeoutSec)
        $request = $null
        try {
            $httpMethod = if ($Method -eq "HEAD") {
                [System.Net.Http.HttpMethod]::Head
            }
            else {
                [System.Net.Http.HttpMethod]::Get
            }
            $request = [System.Net.Http.HttpRequestMessage]::new($httpMethod, $frontendUrl)
            $response = $client.SendAsync(
                $request,
                [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
            ).GetAwaiter().GetResult()
            $statusCode = [int]$response.StatusCode
            return [pscustomobject]@{
                Ready = ($statusCode -ge 200 -and $statusCode -lt 500)
                StatusCode = $statusCode
                Method = $Method
                Error = $null
            }
        }
        catch {
            return [pscustomobject]@{
                Ready = $false
                StatusCode = $null
                Method = $Method
                Error = $_.Exception.Message
            }
        }
        finally {
            if ($null -ne $request) {
                $request.Dispose()
            }
            $client.Dispose()
            $handler.Dispose()
        }
    }

    function Test-FrontendTcpReachability {
        param([Parameter(Mandatory = $true)][int]$RequestTimeoutSec)

        $tcpClient = [System.Net.Sockets.TcpClient]::new()
        try {
            $asyncResult = $tcpClient.BeginConnect("127.0.0.1", 5173, $null, $null)
            if (-not $asyncResult.AsyncWaitHandle.WaitOne(([TimeSpan]::FromSeconds($RequestTimeoutSec)))) {
                throw "tcp connect timed out"
            }

            $tcpClient.EndConnect($asyncResult)
            return [pscustomobject]@{
                Ready = $true
                Method = "TCP"
                Error = $null
            }
        }
        catch {
            return [pscustomobject]@{
                Ready = $false
                Method = "TCP"
                Error = $_.Exception.Message
            }
        }
        finally {
            $tcpClient.Dispose()
        }
    }

    $tcpProbe = Test-FrontendTcpReachability -RequestTimeoutSec $TimeoutSec
    if ($tcpProbe.Ready) {
        return [pscustomobject]@{
            Ready = $true
            AttemptCount = 1
            TimeoutSec = $TimeoutSec
            Method = $tcpProbe.Method
            StatusCode = $null
            LastError = $null
            FallbackUsed = $true
        }
    }

    $lastError = $null
    $lastMethod = $null
    $lastStatusCode = $null
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        foreach ($method in @("HEAD", "GET")) {
            $probeResult = Invoke-FrontendProbeRequest -Method $method -RequestTimeoutSec $TimeoutSec
            $lastMethod = $probeResult.Method
            $lastStatusCode = $probeResult.StatusCode
            $lastError = $probeResult.Error
            if ($probeResult.Ready) {
                return [pscustomobject]@{
                    Ready = $true
                    AttemptCount = $attempt
                    TimeoutSec = $TimeoutSec
                    Method = $probeResult.Method
                    StatusCode = $probeResult.StatusCode
                    LastError = $null
                }
            }
        }

        if ($attempt -lt $Attempts -and $DelayMilliseconds -gt 0) {
            Start-Sleep -Milliseconds $DelayMilliseconds
        }
    }

    return [pscustomobject]@{
        Ready = $false
        AttemptCount = $Attempts
        TimeoutSec = $TimeoutSec
        Method = $lastMethod
        StatusCode = $lastStatusCode
        LastError = if ($lastError) { $lastError } else { $tcpProbe.Error }
        FallbackUsed = $false
    }
}

function Resolve-NpmExecutable {
    $candidates = @("npm.cmd", "npm.exe", "npm")
    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    return $null
}

function Start-FrontendWorker {
    Start-SuiteDetachedProcess `
        -FilePath "PowerShell.exe" `
        -WorkingDirectory $resolvedRepoRoot `
        -Arguments @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            $workerScriptPath,
            "-RepoRoot",
            $resolvedRepoRoot,
            "-BindHost",
            "127.0.0.1",
            "-Port",
            "5173",
            "-FrontendLogPath",
            $frontendLogPath,
            "-BootstrapLogPath",
            $bootstrapLogPath
        ) | Out-Null
}

$workerProcess = Get-FrontendWorkerProcess
$frontendContainer = Get-RuntimeCoreFrontendEntry
$frontendContainerRunning = $false
$frontendContainerHealth = $null
$frontendContainerHealthy = $false
if ($frontendContainer) {
    $containerStateText = [string]::Join(" ", @(
        if ($frontendContainer.PSObject.Properties.Name -contains "State") { [string]$frontendContainer.State } else { "" }
        if ($frontendContainer.PSObject.Properties.Name -contains "Status") { [string]$frontendContainer.Status } else { "" }
    )).Trim().ToLowerInvariant()
    $frontendContainerRunning = (
        $containerStateText.Contains("running") -or
        $containerStateText.Contains("healthy")
    )
    $frontendContainerHealth = Get-ComposeServiceHealthState -ComposeEntry $frontendContainer
    $frontendContainerHealthy = $frontendContainerRunning -and ($frontendContainerHealth -eq "healthy")
}
$listeningProcess = Get-ListeningFrontendProcess
$listening = $null -ne $listeningProcess
$frontendProbe = Test-FrontendHealth
$frontendEndpointReady = [bool]$frontendProbe.Ready
$healthy = ($frontendContainerRunning -and $frontendEndpointReady) -or $frontendContainerHealthy
$running = $frontendContainerRunning -or $listening -or $null -ne $workerProcess
$startAttempted = $false
$errorMessage = $null
$warningMessage = $null
$ownershipDrift = $false
$startupMode = if ($frontendContainerRunning) { "docker_compose" } else { $null }
$healthSource = if ($frontendContainerHealthy) {
    "docker_compose_healthcheck"
}
elseif ($frontendContainerRunning -and $frontendEndpointReady) {
    if ($frontendProbe.FallbackUsed) { "host_port_probe" } else { "host_http_probe" }
}
else {
    $null
}

if (-not $frontendContainerRunning -and $StartIfMissing) {
    if ($listening -or $null -ne $workerProcess) {
        $ownershipDrift = $true
        $errorMessage = "Native frontend process detected outside runtime-core Docker ownership. Stop the native frontend and rerun bootstrap."
    }
    else {
        $composeStart = Invoke-RuntimeCoreComposeJson -Action "up" -Services @("frontend")
        if ($composeStart -and $composeStart.ok) {
            $startAttempted = $true
            $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
            do {
                Start-Sleep -Seconds 2
                $frontendContainer = Get-RuntimeCoreFrontendEntry
                if ($frontendContainer) {
                    $containerStateText = [string]::Join(" ", @(
                        if ($frontendContainer.PSObject.Properties.Name -contains "State") { [string]$frontendContainer.State } else { "" }
                        if ($frontendContainer.PSObject.Properties.Name -contains "Status") { [string]$frontendContainer.Status } else { "" }
                    )).Trim().ToLowerInvariant()
                    $frontendContainerRunning = (
                        $containerStateText.Contains("running") -or
                        $containerStateText.Contains("healthy")
                    )
                    $frontendContainerHealth = Get-ComposeServiceHealthState -ComposeEntry $frontendContainer
                    $frontendContainerHealthy = $frontendContainerRunning -and ($frontendContainerHealth -eq "healthy")
                }
                else {
                    $frontendContainerRunning = $false
                    $frontendContainerHealth = $null
                    $frontendContainerHealthy = $false
                }

                $frontendProbe = Test-FrontendHealth
                $frontendEndpointReady = [bool]$frontendProbe.Ready
                $healthy = ($frontendContainerRunning -and $frontendEndpointReady) -or $frontendContainerHealthy
                if ($frontendContainerRunning) {
                    $startupMode = "docker_compose"
                }
            } while ((Get-Date) -lt $deadline -and -not $healthy)
        }
        else {
            $startAttempted = $true
            $errorMessage = if ($composeStart -and -not [string]::IsNullOrWhiteSpace([string]$composeStart.outputText)) {
                [string]$composeStart.outputText
            }
            else {
                "Frontend compose start failed. Native frontend fallback is disabled for runtime-core ownership."
            }
        }
    }
}

if (-not $frontendContainerRunning -and -not $listeningProcess) {
    $listeningProcess = Get-ListeningFrontendProcess
}
if (-not $frontendContainerRunning -and -not $workerProcess -and -not $listeningProcess) {
    $workerProcess = Get-FrontendWorkerProcess
}
$listening = $null -ne $listeningProcess
$frontendProbe = Test-FrontendHealth
$frontendEndpointReady = [bool]$frontendProbe.Ready
$healthy = ($frontendContainerRunning -and $frontendEndpointReady) -or $frontendContainerHealthy
$running = $frontendContainerRunning -or $listening -or $null -ne $workerProcess
if (-not $startupMode -and $frontendContainerRunning) {
    $startupMode = "docker_compose"
}
elseif (-not $startupMode -and ($listeningProcess -or $workerProcess)) {
    $startupMode = "native_process"
}
$healthSource = if ($frontendContainerHealthy) {
    "docker_compose_healthcheck"
}
elseif ($frontendContainerRunning -and $frontendEndpointReady) {
    if ($frontendProbe.FallbackUsed) { "host_port_probe" } else { "host_http_probe" }
}
else {
    $null
}
$process = if ($frontendContainerRunning) { $null } elseif ($listeningProcess) { $listeningProcess } else { $workerProcess }
$ownershipDrift = $ownershipDrift -or ($running -and -not $frontendContainerRunning)

if ($healthy -and $frontendContainerHealthy -and -not $frontendEndpointReady) {
    $probeErrorSuffix = if ([string]::IsNullOrWhiteSpace([string]$frontendProbe.LastError)) { "" } else { " Last probe error: $([string]$frontendProbe.LastError)." }
    $warningMessage = "Frontend Docker healthcheck passed even though $($frontendProbe.AttemptCount) host HTTP probe(s) to $frontendUrl did not succeed.$probeErrorSuffix"
}

if (-not $healthy -and [string]::IsNullOrWhiteSpace($errorMessage)) {
    if ($ownershipDrift) {
        $errorMessage = "Frontend is responding outside runtime-core Docker ownership."
    }
    elseif ($startAttempted) {
        $errorMessage = "Frontend compose start was requested but the managed frontend runtime did not become ready within $StartupTimeoutSeconds seconds."
    }
    elseif (-not $running) {
        $errorMessage = "Frontend web runtime is not running."
    }
    else {
        $errorMessage = "Frontend container is running but the frontend web runtime is not ready."
    }
}

$result = [pscustomobject]@{
    Url = $frontendUrl
    Port = 5173
    Running = $running
    Listening = $listening
    Healthy = $healthy
    ProcessId = if ($process) { $process.ProcessId } else { $null }
    CommandLine = if ($frontendContainerRunning) { "docker compose service frontend" } elseif ($process) { $process.CommandLine } else { $null }
    StartAttempted = $startAttempted
    Error = $errorMessage
    Warning = $warningMessage
    LogPath = $frontendLogPath
    StartupMode = $startupMode
    ExpectedStartupMode = "docker_compose"
    OwnershipDrift = $ownershipDrift
    EndpointReachable = $frontendEndpointReady
    EndpointProbeAttempts = $frontendProbe.AttemptCount
    EndpointProbeTimeoutSec = $frontendProbe.TimeoutSec
    EndpointProbeMethod = $frontendProbe.Method
    EndpointProbeStatusCode = $frontendProbe.StatusCode
    EndpointProbeLastError = $frontendProbe.LastError
    EndpointProbeFallbackUsed = [bool]$frontendProbe.FallbackUsed
    ContainerHealth = $frontendContainerHealth
    HealthSource = $healthSource
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
}
else {
    Write-Host "Frontend running: $($result.Running)"
    Write-Host "Managed health ready: $($result.Healthy)"
    Write-Host "Listening: $($result.Listening)"
    Write-Host "Process ID: $($result.ProcessId)"
    Write-Host "URL: $($result.Url)"
    Write-Host "Log path: $($result.LogPath)"
    Write-Host "Startup mode: $($result.StartupMode)"
    Write-Host "Ownership drift: $($result.OwnershipDrift)"
    Write-Host "Endpoint reachable: $($result.EndpointReachable)"
    Write-Host "Endpoint probe attempts: $($result.EndpointProbeAttempts)"
    if ($result.EndpointProbeMethod) {
        Write-Host "Endpoint probe method: $($result.EndpointProbeMethod)"
    }
    if ($null -ne $result.EndpointProbeStatusCode) {
        Write-Host "Endpoint probe status: $($result.EndpointProbeStatusCode)"
    }
    Write-Host "Container health: $($result.ContainerHealth)"
    Write-Host "Health source: $($result.HealthSource)"
    if ($result.CommandLine) {
        Write-Host "Command: $($result.CommandLine)"
    }
    if ($result.StartAttempted) {
        Write-Host "Start requested via runtime-core Docker ownership."
    }
    if ($result.Warning) {
        Write-Host "Warning: $($result.Warning)"
    }
    if ($result.Error) {
        Write-Host "Error: $($result.Error)"
    }
}

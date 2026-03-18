[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$BundleRoot,
    [string]$StateJsonPath,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [ValidateRange(1000, 86400000)][int]$TrackerFreshnessMs = 900000,
    [ValidateRange(1000, 86400000)][int]$CollectorFreshnessMs = 120000,
    [switch]$StartIfMissing,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startupCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-collector-startup.ps1")).Path
$pluginCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-plugin.ps1")).Path

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

function Get-DefaultBundleRoot {
    if ($env:APPDATA) {
        return Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
    }
    return Join-Path $env:USERPROFILE "AppData\Roaming\Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
}

function Invoke-JsonScript {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments
    )

    $processArgs = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $ScriptPath
    )
    if ($Arguments) {
        $processArgs += $Arguments
    }

    $output = & PowerShell.exe @processArgs 2>&1
    $exitCode = 0
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    if ($exitCodeVariable) {
        $exitCode = [int]$exitCodeVariable.Value
    }
    if ($exitCode -ne 0) {
        $errorText = [string]::Join([Environment]::NewLine, $output)
        throw "Script '$ScriptPath' exited with code $exitCode. $errorText"
    }

    $raw = [string]::Join([Environment]::NewLine, $output)
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "Script '$ScriptPath' returned no output."
    }
    return $raw | ConvertFrom-Json
}

function Get-TrackerStateSummary {
    param(
        [string]$Path,
        [int]$FreshnessMs
    )

    if (-not $Path) {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $null
            reason = "No tracker-state path resolved."
        }
    }

    $resolvedPath = Resolve-AbsolutePath -PathValue $Path
    if (-not (Test-Path $resolvedPath)) {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $resolvedPath
            reason = "tracker-state.json was not found."
        }
    }

    try {
        $file = Get-Item $resolvedPath -ErrorAction Stop
        $payload = Get-Content $resolvedPath -Raw | ConvertFrom-Json
    }
    catch {
        return [ordered]@{
            exists = $true
            healthy = $false
            path = $resolvedPath
            reason = "tracker-state.json could not be parsed: $($_.Exception.Message)"
        }
    }

    $now = [DateTimeOffset]::UtcNow
    $lastWriteAt = [DateTimeOffset]::new($file.LastWriteTimeUtc)
    $lastWriteAgeMs = [int][Math]::Round(($now - $lastWriteAt).TotalMilliseconds)

    $trackerUpdatedAt = $null
    $trackerUpdatedAgeMs = $null
    if ($payload.lastUpdated) {
        try {
            $trackerUpdatedAt = [DateTimeOffset]::Parse([string]$payload.lastUpdated)
            $trackerUpdatedAgeMs = [int][Math]::Round(($now - $trackerUpdatedAt.ToUniversalTime()).TotalMilliseconds)
        }
        catch {
            $trackerUpdatedAt = $null
            $trackerUpdatedAgeMs = $null
        }
    }

    $effectiveAgeMs = if ($null -ne $trackerUpdatedAgeMs) {
        $trackerUpdatedAgeMs
    }
    else {
        $lastWriteAgeMs
    }

    $currentSession = if ($payload.currentSession) { $payload.currentSession } else { $null }
    $sessionId = if ($currentSession -and $currentSession.sessionId) {
        [string]$currentSession.sessionId
    }
    else {
        $null
    }

    return [ordered]@{
        exists = $true
        healthy = ($effectiveAgeMs -le $FreshnessMs)
        path = $resolvedPath
        sizeBytes = [int64]$file.Length
        lastWriteAt = $lastWriteAt.ToString("o")
        lastWriteAgeMs = $lastWriteAgeMs
        trackerUpdatedAt = if ($trackerUpdatedAt) { $trackerUpdatedAt.ToString("o") } else { $null }
        trackerUpdatedAgeMs = $trackerUpdatedAgeMs
        effectiveAgeMs = $effectiveAgeMs
        freshnessThresholdMs = $FreshnessMs
        isTracking = [bool]$payload.isTracking
        isPaused = [bool]$payload.isPaused
        activeDrawing = [string]$payload.activeDrawing
        activeDrawingPath = [string]$payload.activeDrawingPath
        currentSessionId = $sessionId
        recentCommandCount = @($payload.recentCommands).Count
        sessionCount = @($payload.sessions).Count
    }
}

function Get-CollectorStateSummary {
    param(
        [string]$ConfigPathValue,
        [int]$FreshnessMs
    )

    if (-not $ConfigPathValue) {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $null
            reason = "No collector config path resolved."
        }
    }

    $resolvedConfigPath = Resolve-AbsolutePath -PathValue $ConfigPathValue
    if (-not (Test-Path $resolvedConfigPath)) {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $resolvedConfigPath
            reason = "Collector config was not found."
        }
    }

    try {
        $config = Get-Content $resolvedConfigPath -Raw | ConvertFrom-Json
    }
    catch {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $resolvedConfigPath
            reason = "Collector config could not be parsed: $($_.Exception.Message)"
        }
    }

    $bufferDir = [string]$config.bufferDir
    if ([string]::IsNullOrWhiteSpace($bufferDir)) {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $null
            configPath = $resolvedConfigPath
            reason = "Collector config does not include bufferDir."
        }
    }

    $statePath = Join-Path (Resolve-AbsolutePath -PathValue $bufferDir) "state.json"
    if (-not (Test-Path $statePath)) {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $statePath
            configPath = $resolvedConfigPath
            bufferDir = $bufferDir
            reason = "Collector local state.json was not found."
        }
    }

    try {
        $state = Get-Content $statePath -Raw | ConvertFrom-Json
        $file = Get-Item $statePath -ErrorAction Stop
    }
    catch {
        return [ordered]@{
            exists = $true
            healthy = $false
            path = $statePath
            configPath = $resolvedConfigPath
            bufferDir = $bufferDir
            reason = "Collector local state.json could not be parsed: $($_.Exception.Message)"
        }
    }

    $snapshot = if ($state.snapshot) { $state.snapshot } else { $null }
    $lastCheckedAt = $null
    $lastCheckedAgeMs = $null
    if ($snapshot -and $snapshot.lastCheckedAt) {
        try {
            $lastCheckedAt = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$snapshot.lastCheckedAt)
            $lastCheckedAgeMs = [int][Math]::Round(([DateTimeOffset]::UtcNow - $lastCheckedAt).TotalMilliseconds)
        }
        catch {
            $lastCheckedAt = $null
            $lastCheckedAgeMs = $null
        }
    }

    $pendingCount = @($state.pendingEvents).Count
    $nextSequence = 1
    if ($null -ne $state.nextSequence) {
        try {
            $nextSequence = [int]$state.nextSequence
        }
        catch {
            $nextSequence = 1
        }
    }

    $trackerUpdatedAtMs = 0
    if ($snapshot -and $null -ne $snapshot.lastUpdated) {
        try {
            $trackerUpdatedAtMs = [int64]$snapshot.lastUpdated
        }
        catch {
            $trackerUpdatedAtMs = 0
        }
    }

    return [ordered]@{
        exists = $true
        healthy = (
            $snapshot -and
            [bool]$snapshot.sourceAvailable -and
            $null -ne $lastCheckedAgeMs -and
            $lastCheckedAgeMs -le $FreshnessMs
        )
        path = $statePath
        configPath = $resolvedConfigPath
        bufferDir = $bufferDir
        sizeBytes = [int64]$file.Length
        pendingCount = $pendingCount
        nextSequence = $nextSequence
        lastStatus = [string]$state.lastStatus
        sourceAvailable = if ($snapshot) { [bool]$snapshot.sourceAvailable } else { $false }
        activeDrawingPath = if ($snapshot) { [string]$snapshot.activeDrawingPath } else { $null }
        currentSessionId = if ($snapshot) { [string]$snapshot.currentSessionId } else { $null }
        lastCheckedAt = if ($lastCheckedAt) { $lastCheckedAt.ToString("o") } else { $null }
        lastCheckedAgeMs = $lastCheckedAgeMs
        freshnessThresholdMs = $FreshnessMs
        trackerUpdatedAtMs = $trackerUpdatedAtMs
    }
}

function Get-BackendSummary {
    param([string]$ConfigPathValue)

    if (-not $ConfigPathValue) {
        return [ordered]@{
            configured = $false
            healthy = $false
            backendUrl = $null
            reason = "No collector config path resolved."
        }
    }

    $resolvedConfigPath = Resolve-AbsolutePath -PathValue $ConfigPathValue
    if (-not (Test-Path $resolvedConfigPath)) {
        return [ordered]@{
            configured = $false
            healthy = $false
            backendUrl = $null
            configPath = $resolvedConfigPath
            reason = "Collector config was not found."
        }
    }

    try {
        $config = Get-Content $resolvedConfigPath -Raw | ConvertFrom-Json
    }
    catch {
        return [ordered]@{
            configured = $false
            healthy = $false
            backendUrl = $null
            configPath = $resolvedConfigPath
            reason = "Collector config could not be parsed: $($_.Exception.Message)"
        }
    }

    $backendUrl = [string]$config.backendUrl
    if ([string]::IsNullOrWhiteSpace($backendUrl)) {
        return [ordered]@{
            configured = $false
            healthy = $false
            backendUrl = $null
            configPath = $resolvedConfigPath
            reason = "Collector config does not include backendUrl."
        }
    }

    try {
        $uri = [Uri]$backendUrl
    }
    catch {
        return [ordered]@{
            configured = $true
            healthy = $false
            backendUrl = $backendUrl
            configPath = $resolvedConfigPath
            reason = "Collector backendUrl is invalid: $($_.Exception.Message)"
        }
    }

    $port = if ($uri.IsDefaultPort) {
        if ($uri.Scheme -eq "https") { 443 } else { 80 }
    }
    else {
        $uri.Port
    }

    $tcpClient = New-Object System.Net.Sockets.TcpClient
    try {
        $connect = $tcpClient.ConnectAsync($uri.Host, $port)
        if (-not $connect.Wait(3000)) {
            return [ordered]@{
                configured = $true
                healthy = $false
                backendUrl = $backendUrl
                configPath = $resolvedConfigPath
                host = $uri.Host
                port = $port
                reason = "Backend TCP connection timed out."
            }
        }
        if (-not $tcpClient.Connected) {
            return [ordered]@{
                configured = $true
                healthy = $false
                backendUrl = $backendUrl
                configPath = $resolvedConfigPath
                host = $uri.Host
                port = $port
                reason = "Backend TCP connection did not establish."
            }
        }

        return [ordered]@{
            configured = $true
            healthy = $true
            backendUrl = $backendUrl
            configPath = $resolvedConfigPath
            host = $uri.Host
            port = $port
        }
    }
    catch {
        return [ordered]@{
            configured = $true
            healthy = $false
            backendUrl = $backendUrl
            configPath = $resolvedConfigPath
            host = $uri.Host
            port = $port
            reason = "Backend TCP connection failed: $($_.Exception.Message)"
        }
    }
    finally {
        $tcpClient.Dispose()
    }
}

function Get-BackendStartupSummary {
    param([string]$WorkstationId)

    $backendStartupScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-backend-startup.ps1")).Path
    if (-not (Test-Path $backendStartupScript)) {
        return [ordered]@{
            configured = $false
            healthy = $false
            reason = "Backend startup check script missing."
        }
    }

    $startupArgs = @(
        "-Json",
        "-CodexConfigPath",
        $CodexConfigPath,
        "-WorkstationId",
        $WorkstationId
    )
    if ($StartIfMissing) {
        $startupArgs += "-StartIfMissing"
    }

    try {
        $payload = Invoke-JsonScript -ScriptPath $backendStartupScript -Arguments $startupArgs
        return [ordered]@{
            configured = $true
            healthy = [bool]($payload.Running)
            running = [bool]($payload.Running)
            processId = $payload.ProcessId
            commandLine = $payload.CommandLine
            startAttempted = [bool]$payload.StartAttempted
            error = [string]($payload.Error)
            workstationId = $payload.Workstation
        }
    }
    catch {
        return [ordered]@{
            configured = $true
            healthy = $false
            error = $_.Exception.Message
            workstationId = $WorkstationId
        }
    }
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
if (-not $ConfigPath) {
    $ConfigPath = [string](Get-TomlStringValue -Path $CodexConfigPath -Key "SUITE_WATCHDOG_AUTOCAD_COLLECTOR_CONFIG")
}
if (-not $BundleRoot) {
    $BundleRoot = [string](Get-TomlStringValue -Path $CodexConfigPath -Key "SUITE_WATCHDOG_AUTOCAD_PLUGIN_BUNDLE_ROOT")
}
if (-not $BundleRoot) {
    $BundleRoot = Get-DefaultBundleRoot
}
if (-not $StateJsonPath) {
    $StateJsonPath = [string](Get-TomlStringValue -Path $CodexConfigPath -Key "SUITE_WATCHDOG_AUTOCAD_STATE_PATH")
}

$startupArgs = @(
    "-Json",
    "-CodexConfigPath", $CodexConfigPath
)
if ($ConfigPath) {
    $startupArgs += @("-ConfigPath", (Resolve-AbsolutePath -PathValue $ConfigPath))
}
if ($identity.WorkstationId) {
    $startupArgs += @("-WorkstationId", $identity.WorkstationId)
}
if ($StartIfMissing) {
    $startupArgs += "-StartIfMissing"
}
$startup = Invoke-JsonScript -ScriptPath $startupCheckScript -Arguments $startupArgs

$pluginArgs = @("-Json", "-BundleRoot", (Resolve-AbsolutePath -PathValue $BundleRoot))
$plugin = Invoke-JsonScript -ScriptPath $pluginCheckScript -Arguments $pluginArgs

if (-not $StateJsonPath -and $startup.configPath -and (Test-Path $startup.configPath)) {
    try {
        $collectorConfig = Get-Content $startup.configPath -Raw | ConvertFrom-Json
        $StateJsonPath = [string]$collectorConfig.stateJsonPath
    }
    catch {
        $StateJsonPath = $null
    }
}

$trackerState = Get-TrackerStateSummary -Path $StateJsonPath -FreshnessMs $TrackerFreshnessMs
$collectorState = Get-CollectorStateSummary -ConfigPathValue $startup.configPath -FreshnessMs $CollectorFreshnessMs
$backend = Get-BackendSummary -ConfigPathValue $startup.configPath
$backendStartup = Get-BackendStartupSummary -WorkstationId $identity.WorkstationId

$status = if (-not $startup.healthy -or -not $plugin.ok) {
    "needs_attention"
}
elseif (-not $backend.healthy) {
    "awaiting_backend"
}
elseif (-not $trackerState.exists -or -not $trackerState.healthy) {
    "awaiting_autocad"
}
elseif (-not $collectorState.exists -or -not $collectorState.healthy) {
    "awaiting_collector_sync"
}
else {
    "ready"
}

$result = [ordered]@{
    ok = $true
    status = $status
    workstationId = $identity.WorkstationId
    startup = $startup
    plugin = $plugin
    backend = $backend
    backendStartup = $backendStartup
    trackerState = $trackerState
    collectorState = $collectorState
    summary = [ordered]@{
        startupHealthy = [bool]$startup.healthy
        pluginHealthy = [bool]$plugin.ok
        backendHealthy = [bool]$backend.healthy
        trackerStateHealthy = [bool]$trackerState.healthy
        collectorStateHealthy = [bool]$collectorState.healthy
        backendStartupHealthy = [bool]($backendStartup.healthy)
        readyForTelemetry = ($status -eq "ready")
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Watchdog AutoCAD readiness: $status"
    Write-Host "Workstation: $($result.workstationId)"
    Write-Host "Startup healthy: $($result.summary.startupHealthy)"
    Write-Host "Plugin healthy: $($result.summary.pluginHealthy)"
    Write-Host "Backend healthy: $($result.summary.backendHealthy)"
    Write-Host "Tracker state healthy: $($result.summary.trackerStateHealthy)"
    Write-Host "Collector state healthy: $($result.summary.collectorStateHealthy)"
    if ($trackerState.path) {
        Write-Host "Tracker state path: $($trackerState.path)"
    }
    if ($collectorState.path) {
        Write-Host "Collector state path: $($collectorState.path)"
    }
}

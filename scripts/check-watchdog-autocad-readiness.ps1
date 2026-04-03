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
    if ($env:ProgramFiles) {
        $candidate = Join-Path $env:ProgramFiles "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    if (${env:ProgramFiles(x86)}) {
        $candidate = Join-Path ${env:ProgramFiles(x86)} "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    if ($env:APPDATA) {
        $candidate = Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    if ($env:ProgramData) {
        $candidate = Join-Path $env:ProgramData "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    if ($env:ALLUSERSPROFILE) {
        $candidate = Join-Path $env:ALLUSERSPROFILE "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    if ($env:APPDATA) {
        return Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
    }
    return Join-Path $env:USERPROFILE "AppData\Roaming\Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
}

function Get-OptionalObjectPropertyValue {
    param(
        [object]$InputObject,
        [string]$PropertyName
    )

    if ($null -eq $InputObject) {
        return $null
    }

    $property = $InputObject.PSObject.Properties[$PropertyName]
    if ($null -eq $property) {
        return $null
    }

    return $property.Value
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
            reason = "No tracker-state path resolved yet."
        }
    }

    $resolvedPath = Resolve-AbsolutePath -PathValue $Path
    if (-not (Test-Path $resolvedPath)) {
        return [ordered]@{
            exists = $false
            healthy = $false
            path = $resolvedPath
            reason = "tracker-state.json was not found yet. This is expected until AutoCAD is opened on this workstation."
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
    $trackerUpdatedValue = Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "lastUpdated"
    if ($trackerUpdatedValue) {
        try {
            $trackerUpdatedAt = [DateTimeOffset]::Parse([string]$trackerUpdatedValue)
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
    $trackerReason = $null
    if ($effectiveAgeMs -gt $FreshnessMs) {
        $trackerAgeMinutes = [Math]::Round(($effectiveAgeMs / 60000.0), 1)
        $trackerThresholdMinutes = [Math]::Round(($FreshnessMs / 60000.0), 1)
        $trackerReason = "tracker-state.json is not fresh yet ($trackerAgeMinutes min old; threshold $trackerThresholdMinutes min). This is expected until AutoCAD reports again on this workstation."
    }

    $currentSession = Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "currentSession"
    $currentSessionIdValue = Get-OptionalObjectPropertyValue -InputObject $currentSession -PropertyName "sessionId"
    $recentCommands = Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "recentCommands"
    $sessions = Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "sessions"
    $sessionId = if ($currentSessionIdValue) {
        [string]$currentSessionIdValue
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
        reason = $trackerReason
        isTracking = [bool](Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "isTracking")
        isPaused = [bool](Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "isPaused")
        activeDrawing = [string](Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "activeDrawing")
        activeDrawingPath = [string](Get-OptionalObjectPropertyValue -InputObject $payload -PropertyName "activeDrawingPath")
        currentSessionId = $sessionId
        recentCommandCount = if ($null -eq $recentCommands) { 0 } else { @($recentCommands).Count }
        sessionCount = if ($null -eq $sessions) { 0 } else { @($sessions).Count }
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
            reason = "No collector config path resolved yet."
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

    $snapshot = Get-OptionalObjectPropertyValue -InputObject $state -PropertyName "snapshot"
    $lastCheckedAt = $null
    $lastCheckedAgeMs = $null
    $lastCheckedAtValue = Get-OptionalObjectPropertyValue -InputObject $snapshot -PropertyName "lastCheckedAt"
    if ($snapshot -and $lastCheckedAtValue) {
        try {
            $lastCheckedAt = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$lastCheckedAtValue)
            $lastCheckedAgeMs = [int][Math]::Round(([DateTimeOffset]::UtcNow - $lastCheckedAt).TotalMilliseconds)
        }
        catch {
            $lastCheckedAt = $null
            $lastCheckedAgeMs = $null
        }
    }

    $pendingEvents = Get-OptionalObjectPropertyValue -InputObject $state -PropertyName "pendingEvents"
    $pendingCount = if ($null -eq $pendingEvents) { 0 } else { @($pendingEvents).Count }
    $nextSequence = 1
    $nextSequenceValue = Get-OptionalObjectPropertyValue -InputObject $state -PropertyName "nextSequence"
    if ($null -ne $nextSequenceValue) {
        try {
            $nextSequence = [int]$nextSequenceValue
        }
        catch {
            $nextSequence = 1
        }
    }

    $trackerUpdatedAtMs = 0
    $snapshotLastUpdatedValue = Get-OptionalObjectPropertyValue -InputObject $snapshot -PropertyName "lastUpdated"
    if ($snapshot -and $null -ne $snapshotLastUpdatedValue) {
        try {
            $trackerUpdatedAtMs = [int64]$snapshotLastUpdatedValue
        }
        catch {
            $trackerUpdatedAtMs = 0
        }
    }

    $sourceAvailable = if ($snapshot) {
        [bool](Get-OptionalObjectPropertyValue -InputObject $snapshot -PropertyName "sourceAvailable")
    }
    else {
        $false
    }

    $snapshotActiveDrawingPath = if ($snapshot) {
        [string](Get-OptionalObjectPropertyValue -InputObject $snapshot -PropertyName "activeDrawingPath")
    }
    else {
        $null
    }

    $snapshotCurrentSessionId = if ($snapshot) {
        [string](Get-OptionalObjectPropertyValue -InputObject $snapshot -PropertyName "currentSessionId")
    }
    else {
        $null
    }
    $collectorReason = $null
    if (-not $snapshot) {
        $collectorReason = "Collector local state.json is missing snapshot metadata."
    }
    elseif (-not $sourceAvailable) {
        $collectorReason = "Collector is waiting for a live tracker source from AutoCAD."
    }
    elseif ($null -eq $lastCheckedAgeMs) {
        $collectorReason = "Collector snapshot does not include a valid lastCheckedAt timestamp."
    }
    elseif ($lastCheckedAgeMs -gt $FreshnessMs) {
        $collectorAgeMinutes = [Math]::Round(($lastCheckedAgeMs / 60000.0), 1)
        $collectorThresholdMinutes = [Math]::Round(($FreshnessMs / 60000.0), 1)
        $collectorReason = "Collector local state.json is stale ($collectorAgeMinutes min old; threshold $collectorThresholdMinutes min)."
    }

    return [ordered]@{
        exists = $true
        healthy = (
            $snapshot -and
            $sourceAvailable -and
            $null -ne $lastCheckedAgeMs -and
            $lastCheckedAgeMs -le $FreshnessMs
        )
        path = $statePath
        configPath = $resolvedConfigPath
        bufferDir = $bufferDir
        sizeBytes = [int64]$file.Length
        pendingCount = $pendingCount
        nextSequence = $nextSequence
        lastStatus = [string](Get-OptionalObjectPropertyValue -InputObject $state -PropertyName "lastStatus")
        sourceAvailable = $sourceAvailable
        activeDrawingPath = $snapshotActiveDrawingPath
        currentSessionId = $snapshotCurrentSessionId
        lastCheckedAt = if ($lastCheckedAt) { $lastCheckedAt.ToString("o") } else { $null }
        lastCheckedAgeMs = $lastCheckedAgeMs
        freshnessThresholdMs = $FreshnessMs
        trackerUpdatedAtMs = $trackerUpdatedAtMs
        reason = $collectorReason
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
$resolvedBundleRoot = $null
if ($BundleRoot) {
    $candidateBundleRoot = Resolve-AbsolutePath -PathValue $BundleRoot
    if ($candidateBundleRoot -and (Test-Path $candidateBundleRoot)) {
        $resolvedBundleRoot = $candidateBundleRoot
    }
}
if (-not $resolvedBundleRoot) {
    $resolvedBundleRoot = Get-DefaultBundleRoot
}
if (-not $resolvedBundleRoot) {
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

$pluginArgs = @("-Json", "-BundleRoot", (Resolve-AbsolutePath -PathValue $resolvedBundleRoot))
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

$passiveAutoCadWait =
    ($status -eq "awaiting_autocad" -or $status -eq "awaiting_collector_sync") -and
    $startup.healthy -and
    $plugin.ok -and
    $backend.healthy
$guidance = if ($passiveAutoCadWait) {
    "AutoCAD appears installed and the local collector path is healthy. Open AutoCAD on this workstation when you need live tracker telemetry."
}
else {
    $null
}

$result = [ordered]@{
    ok = $true
    status = $status
    guidance = $guidance
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
        passiveAutoCadWait = [bool]$passiveAutoCadWait
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
    if ($trackerState.reason) {
        Write-Host "Tracker reason: $($trackerState.reason)"
    }
    if ($collectorState.path) {
        Write-Host "Collector state path: $($collectorState.path)"
    }
    if ($collectorState.reason) {
        Write-Host "Collector reason: $($collectorState.reason)"
    }
    if ($guidance) {
        Write-Host "Guidance: $guidance"
    }
}

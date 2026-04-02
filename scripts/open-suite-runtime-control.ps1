[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$AutoBootstrap,
    [switch]$Notify,
    [switch]$SnapshotJson,
    [ValidateRange(1000, 30000)][int]$RefreshIntervalMs = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
. $runtimeSharedScript
$runtimeStatusScriptPath = (Resolve-Path (Join-Path $PSScriptRoot "get-suite-runtime-status.ps1")).Path
$startupScript = (Resolve-Path (Join-Path $PSScriptRoot "run-suite-runtime-startup.ps1")).Path
$stopScript = (Resolve-Path (Join-Path $PSScriptRoot "stop-suite-runtime.ps1")).Path
$backendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-backend-startup.ps1")).Path
$gatewayCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-gateway-startup.ps1")).Path
$filesystemCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-filesystem-collector-startup.ps1")).Path
$autocadCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-collector-startup.ps1")).Path
$pluginCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-plugin.ps1")).Path
$cadAuthoringPluginCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-suite-cad-authoring-plugin.ps1")).Path
$runtimePaths = Get-SuiteRuntimePaths
$runtimeStatusDir = $runtimePaths.RuntimeStatusDir
$runtimeStatusPath = $runtimePaths.RuntimeStatusPath
$runtimeLogPath = $runtimePaths.RuntimeLogPath
New-Item -ItemType Directory -Path $runtimeStatusDir -Force | Out-Null

function New-ComponentStatus {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$State,
        [Parameter(Mandatory = $true)][string]$Summary,
        [string]$Details,
        [bool]$Ok = $false
    )

    [pscustomobject]@{
        key = $Key
        name = $Name
        state = $State
        ok = $Ok
        summary = $Summary
        details = if ([string]::IsNullOrWhiteSpace($Details)) { $null } else { $Details }
    }
}

function Get-FrontendStatus {
    if (Test-PortListening -Port 5173) {
        return New-ComponentStatus -Key "frontend" -Name "Frontend" -State "ready" -Ok $true -Summary "Vite is listening on 5173."
    }

    return New-ComponentStatus -Key "frontend" -Name "Frontend" -State "stopped" -Summary "Frontend is not running."
}

function Get-DockerStatus {
    if (Test-DockerReady) {
        return New-ComponentStatus -Key "docker" -Name "Docker" -State "ready" -Ok $true -Summary "Docker engine is ready."
    }

    return New-ComponentStatus -Key "docker" -Name "Docker" -State "failed" -Summary "Docker engine is not ready." -Details "Start Docker Desktop or wait for it to finish loading."
}

function Get-SupabaseStatus {
    $supabasePorts = Get-SuiteSupabaseLocalPorts -RepoRoot $resolvedRepoRoot
    $apiListening = Test-PortListening -Port $supabasePorts.api
    $dbListening = Test-PortListening -Port $supabasePorts.db

    if ($apiListening -and $dbListening) {
        return New-ComponentStatus -Key "supabase" -Name "Supabase" -State "ready" -Ok $true -Summary "API and DB ports are listening." -Details "API $($supabasePorts.api), DB $($supabasePorts.db)."
    }
    if ($apiListening -or $dbListening) {
        return New-ComponentStatus -Key "supabase" -Name "Supabase" -State "starting" -Summary "Supabase is partially online." -Details "API $($supabasePorts.api): $apiListening. DB $($supabasePorts.db): $dbListening."
    }

    return New-ComponentStatus -Key "supabase" -Name "Supabase" -State "stopped" -Summary "Local Supabase is not running."
}

function Get-BackendStatus {
    $result = Invoke-JsonPowerShellFile -ScriptPath $backendCheckScript -Arguments @("-Json")
    if ($result.Payload -and [bool]$result.Payload.Running) {
        return New-ComponentStatus -Key "backend" -Name "Backend" -State "ready" -Ok $true -Summary "Backend is running." -Details "PID $($result.Payload.ProcessId)."
    }

    $details = if ($result.Payload -and $result.Payload.Error) { [string]$result.Payload.Error } else { $result.OutputTail }
    return New-ComponentStatus -Key "backend" -Name "Backend" -State "stopped" -Summary "Backend is not running." -Details $details
}

function Get-GatewayStatus {
    $result = Invoke-JsonPowerShellFile -ScriptPath $gatewayCheckScript -Arguments @("-Json")
    if ($result.Payload -and [bool]$result.Payload.Healthy) {
        return New-ComponentStatus -Key "gateway" -Name "Gateway" -State "ready" -Ok $true -Summary "Gateway is healthy." -Details "PID $($result.Payload.ProcessId)."
    }
    if ($result.Payload -and [bool]$result.Payload.Running) {
        return New-ComponentStatus -Key "gateway" -Name "Gateway" -State "starting" -Summary "Gateway is warming up." -Details $result.OutputTail
    }

    $details = if ($result.Payload -and $result.Payload.Error) { [string]$result.Payload.Error } else { $result.OutputTail }
    return New-ComponentStatus -Key "gateway" -Name "Gateway" -State "stopped" -Summary "Gateway is not running." -Details $details
}

function Get-FilesystemCollectorStatus {
    $result = Invoke-JsonPowerShellFile -ScriptPath $filesystemCheckScript -Arguments @("-Json")
    if ($result.Payload -and [bool]$result.Payload.healthy) {
        return New-ComponentStatus -Key "watchdogFilesystem" -Name "Watchdog FS" -State "ready" -Ok $true -Summary "Filesystem collector is healthy." -Details "Startup: $($result.Payload.startupMode)."
    }

    $details = if ($result.Payload -and $result.Payload.errors) { [string]::Join("; ", @($result.Payload.errors)) } else { $result.OutputTail }
    return New-ComponentStatus -Key "watchdogFilesystem" -Name "Watchdog FS" -State "failed" -Summary "Filesystem collector needs attention." -Details $details
}

function Get-AutoCadCollectorStatus {
    $result = Invoke-JsonPowerShellFile -ScriptPath $autocadCheckScript -Arguments @("-Json")
    if ($result.Payload -and [bool]$result.Payload.healthy) {
        return New-ComponentStatus -Key "watchdogAutoCad" -Name "Watchdog AutoCAD" -State "ready" -Ok $true -Summary "AutoCAD collector is healthy." -Details "Startup: $($result.Payload.startupMode)."
    }

    $details = if ($result.Payload -and $result.Payload.errors) { [string]::Join("; ", @($result.Payload.errors)) } else { $result.OutputTail }
    return New-ComponentStatus -Key "watchdogAutoCad" -Name "Watchdog AutoCAD" -State "failed" -Summary "AutoCAD collector needs attention." -Details $details
}

function Get-PluginStatus {
    $watchdogResult = Invoke-JsonPowerShellFile -ScriptPath $pluginCheckScript -Arguments @("-Json")
    $cadAuthoringResult = Invoke-JsonPowerShellFile -ScriptPath $cadAuthoringPluginCheckScript -Arguments @("-Json")
    $watchdogHealthy = [bool]($watchdogResult.Payload -and $watchdogResult.Payload.ok)
    $cadAuthoringHealthy = [bool]($cadAuthoringResult.Payload -and $cadAuthoringResult.Payload.ok)

    if ($watchdogHealthy -and $cadAuthoringHealthy) {
        $bundleRoots = @(
            [string]$watchdogResult.Payload.bundleRoot
            [string]$cadAuthoringResult.Payload.bundleRoot
        ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        return New-ComponentStatus -Key "autocadPlugin" -Name "AutoCAD Plugin" -State "ready" -Ok $true -Summary "AutoCAD plugin bundles are healthy." -Details ([string]::Join("; ", $bundleRoots))
    }

    $details = @()
    if ($watchdogResult.Payload -and $watchdogResult.Payload.errors) {
        $details += "Watchdog: " + [string]::Join("; ", @($watchdogResult.Payload.errors))
    }
    elseif ($watchdogResult.OutputTail) {
        $details += "Watchdog: $($watchdogResult.OutputTail)"
    }
    if ($cadAuthoringResult.Payload -and $cadAuthoringResult.Payload.errors) {
        $details += "CAD authoring: " + [string]::Join("; ", @($cadAuthoringResult.Payload.errors))
    }
    elseif ($cadAuthoringResult.OutputTail) {
        $details += "CAD authoring: $($cadAuthoringResult.OutputTail)"
    }

    return New-ComponentStatus -Key "autocadPlugin" -Name "AutoCAD Plugin" -State "failed" -Summary "AutoCAD plugins need attention." -Details ([string]::Join("; ", @($details)))
}

function Get-LastBootstrapStatus {
    if (-not (Test-Path $runtimeStatusPath)) {
        return $null
    }

    try {
        return (Get-Content -Path $runtimeStatusPath -Raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Convert-RuntimeServiceStateToLegacyState {
    param([string]$State)

    switch ($State) {
        "running" { return "ready" }
        "starting" { return "starting" }
        "stopped" { return "stopped" }
        "error" { return "failed" }
        default { return "failed" }
    }
}

function Get-LegacyComponentDetails {
    param($Component)

    if ($null -eq $Component) {
        return $null
    }

    $details = New-Object System.Collections.Generic.List[string]
    if (
        $Component.PSObject.Properties.Name -contains "details" -and
        -not [string]::IsNullOrWhiteSpace([string]$Component.details)
    ) {
        $details.Add([string]$Component.details)
    }

    if ($Component.PSObject.Properties.Name -contains "notes" -and $Component.notes) {
        foreach ($note in @($Component.notes)) {
            if (
                $note -and
                $note.PSObject.Properties.Name -contains "label" -and
                $note.PSObject.Properties.Name -contains "value" -and
                -not [string]::IsNullOrWhiteSpace([string]$note.label) -and
                -not [string]::IsNullOrWhiteSpace([string]$note.value)
            ) {
                $details.Add(("{0}: {1}" -f [string]$note.label, [string]$note.value))
            }
        }
    }

    if ($details.Count -eq 0) {
        return $null
    }

    return [string]::Join("; ", @($details.ToArray()))
}

function Find-RuntimeStatusService {
    param(
        $RuntimeStatus,
        [Parameter(Mandatory = $true)][string]$Id
    )

    if ($null -eq $RuntimeStatus -or -not $RuntimeStatus.services) {
        return $null
    }

    return @(
        $RuntimeStatus.services |
            Where-Object { [string]$_.id -eq $Id } |
            Select-Object -First 1
    )[0]
}

function New-LegacyComponentFromRuntimeService {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Name,
        $Service,
        [Parameter(Mandatory = $true)][string]$FallbackSummary
    )

    $serviceState = if ($Service) { [string]$Service.state } else { "stopped" }
    $summary = if ($Service -and -not [string]::IsNullOrWhiteSpace([string]$Service.summary)) {
        [string]$Service.summary
    }
    else {
        $FallbackSummary
    }

    return [pscustomobject]@{
        key = $Key
        name = $Name
        state = Convert-RuntimeServiceStateToLegacyState -State $serviceState
        ok = ($serviceState -eq "running")
        summary = $summary
        details = Get-LegacyComponentDetails -Component $Service
    }
}

function Convert-RuntimeStatusToLegacySnapshot {
    param($RuntimeStatus)

    $supabaseService = Find-RuntimeStatusService -RuntimeStatus $RuntimeStatus -Id "supabase"
    $backendService = Find-RuntimeStatusService -RuntimeStatus $RuntimeStatus -Id "backend"
    $gatewayService = Find-RuntimeStatusService -RuntimeStatus $RuntimeStatus -Id "gateway"
    $frontendService = Find-RuntimeStatusService -RuntimeStatus $RuntimeStatus -Id "frontend"
    $filesystemService = Find-RuntimeStatusService -RuntimeStatus $RuntimeStatus -Id "watchdog-filesystem"
    $autocadService = Find-RuntimeStatusService -RuntimeStatus $RuntimeStatus -Id "watchdog-autocad"
    $pluginSubstatus = if (
        $autocadService -and
        $autocadService.PSObject.Properties.Name -contains "substatus"
    ) {
        $autocadService.substatus
    }
    else {
        $null
    }

    $dockerReady = $false
    if (
        ($supabaseService -and [string]$supabaseService.startupMode -eq "docker") -or
        ($supabaseService -and @("running", "starting") -contains ([string]$supabaseService.state))
    ) {
        $dockerReady = $true
    }
    elseif (Test-DockerReady) {
        $dockerReady = $true
    }

    $dockerState = if ($dockerReady) { "ready" } else { "failed" }
    $dockerDetails = if ($supabaseService -and $supabaseService.details) {
        [string]$supabaseService.details
    }
    else {
        "Start Docker Desktop or wait for it to finish loading."
    }

    $pluginState = if ($pluginSubstatus) { [string]$pluginSubstatus.state } else { "stopped" }
    $pluginSummary = if ($pluginSubstatus -and $pluginSubstatus.summary) {
        [string]$pluginSubstatus.summary
    }
    elseif ($autocadService -and $autocadService.summary) {
        [string]$autocadService.summary
    }
    else {
        "AutoCAD plugin status unavailable."
    }

    $components = @(
        New-LegacyComponentFromRuntimeService -Key "frontend" -Name "Frontend" -Service $frontendService -FallbackSummary "Frontend is not running."
        [pscustomobject]@{
            key = "docker"
            name = "Docker"
            state = $dockerState
            ok = ($dockerState -eq "ready")
            summary = if ($dockerReady) { "Docker engine is ready." } else { "Docker engine is not ready." }
            details = $dockerDetails
        }
        New-LegacyComponentFromRuntimeService -Key "supabase" -Name "Supabase" -Service $supabaseService -FallbackSummary "Local Supabase is not running."
        New-LegacyComponentFromRuntimeService -Key "backend" -Name "Backend" -Service $backendService -FallbackSummary "Backend is not running."
        New-LegacyComponentFromRuntimeService -Key "gateway" -Name "Gateway" -Service $gatewayService -FallbackSummary "Gateway is not running."
        New-LegacyComponentFromRuntimeService -Key "watchdogFilesystem" -Name "Watchdog FS" -Service $filesystemService -FallbackSummary "Filesystem collector needs attention."
        New-LegacyComponentFromRuntimeService -Key "watchdogAutoCad" -Name "Watchdog AutoCAD" -Service $autocadService -FallbackSummary "AutoCAD collector needs attention."
        [pscustomobject]@{
            key = "autocadPlugin"
            name = "AutoCAD Plugin"
            state = Convert-RuntimeServiceStateToLegacyState -State $pluginState
            ok = ($pluginState -eq "running")
            summary = $pluginSummary
            details = if ($pluginSubstatus) { Get-LegacyComponentDetails -Component $pluginSubstatus } else { $null }
        }
    )

    $overallState = if (
        $RuntimeStatus.PSObject.Properties.Name -contains "overall" -and
        $RuntimeStatus.overall
    ) {
        [string]$RuntimeStatus.overall.state
    }
    else {
        ""
    }

    return [ordered]@{
        ok = [bool]$RuntimeStatus.ok
        timestamp = if ($RuntimeStatus.checkedAt) { [string]$RuntimeStatus.checkedAt } else { (Get-Date).ToString("o") }
        summary = switch ($overallState) {
            "healthy" { "Runtime ready." }
            "booting" { "Runtime booting." }
            "degraded" { "Runtime needs attention." }
            "down" { "Runtime offline." }
            default { "Runtime status unavailable." }
        }
        overallState = $overallState
        components = $components
        lastBootstrap = if ($RuntimeStatus.runtime) { $RuntimeStatus.runtime.lastBootstrap } else { Get-LastBootstrapStatus }
    }
}

function Get-RuntimeSnapshot {
    $runtimeStatusResult = Invoke-JsonPowerShellFile -ScriptPath $runtimeStatusScriptPath -Arguments @("-RepoRoot", $resolvedRepoRoot, "-Json")
    if ($runtimeStatusResult.Payload) {
        return Convert-RuntimeStatusToLegacySnapshot -RuntimeStatus $runtimeStatusResult.Payload
    }

    $components = @(
        Get-FrontendStatus
        Get-DockerStatus
        Get-SupabaseStatus
        Get-BackendStatus
        Get-GatewayStatus
        Get-FilesystemCollectorStatus
        Get-AutoCadCollectorStatus
        Get-PluginStatus
    )

    $coreKeys = @("docker", "supabase", "backend", "gateway")
    $coreComponents = @($components | Where-Object { $coreKeys -contains $_.key })
    $readyCount = @($coreComponents | Where-Object { [bool]$_.ok }).Count
    $summary = if ($readyCount -eq $coreComponents.Count) {
        "Runtime ready."
    }
    elseif ($readyCount -gt 0) {
        "Runtime partially ready."
    }
    else {
        "Runtime offline."
    }

    return [ordered]@{
        ok = ($readyCount -eq $coreComponents.Count)
        timestamp = (Get-Date).ToString("o")
        summary = $summary
        overallState = if ($readyCount -eq $coreComponents.Count) { "healthy" } elseif ($readyCount -gt 0) { "booting" } else { "down" }
        components = $components
        lastBootstrap = Get-LastBootstrapStatus
    }
}

if ($SnapshotJson) {
    Get-RuntimeSnapshot | ConvertTo-Json -Depth 8
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:rowMap = @{}
$script:toolTip = New-Object System.Windows.Forms.ToolTip
$script:currentProcess = $null
$script:currentAction = $null
$script:restartQueued = $false
$script:lastLogOffset = if (Test-Path $runtimeLogPath) { (Get-Item -LiteralPath $runtimeLogPath).Length } else { 0L }
$script:isClosing = $false
$script:timerDisposed = $false

function Test-ControlAvailable {
    param($Control)

    if ($script:isClosing) {
        return $false
    }

    if ($form -and ($form.IsDisposed -or $form.Disposing)) {
        return $false
    }

    if ($null -eq $Control) {
        return $true
    }

    return -not ($Control.IsDisposed -or $Control.Disposing)
}

function Stop-UiTimerSafely {
    if ($script:timerDisposed) {
        return
    }

    if ($timer) {
        try {
            $timer.Stop()
        }
        catch {
        }

        try {
            $timer.Dispose()
        }
        catch {
        }
    }

    $script:timerDisposed = $true
}

function Get-StateColor {
    param([string]$State)

    switch ($State) {
        "ready" { [System.Drawing.ColorTranslator]::FromHtml("#2e8b57") }
        "starting" { [System.Drawing.ColorTranslator]::FromHtml("#b76e00") }
        "stopped" { [System.Drawing.ColorTranslator]::FromHtml("#6b7280") }
        "failed" { [System.Drawing.ColorTranslator]::FromHtml("#b42318") }
        default { [System.Drawing.ColorTranslator]::FromHtml("#4b5563") }
    }
}

function Append-ActivityLog {
    param([Parameter(Mandatory = $true)][string]$Message)

    if ([string]::IsNullOrWhiteSpace($Message)) {
        return
    }
    if (-not (Test-ControlAvailable -Control $logTextBox)) {
        return
    }

    $timestamp = (Get-Date).ToString("HH:mm:ss")
    $logTextBox.AppendText("[$timestamp] $Message" + [Environment]::NewLine)
    $logTextBox.SelectionStart = $logTextBox.TextLength
    $logTextBox.ScrollToCaret()
}

function Pump-RuntimeLog {
    if ($script:isClosing -or -not (Test-ControlAvailable -Control $logTextBox)) {
        return
    }
    if (-not (Test-Path $runtimeLogPath)) {
        return
    }

    $currentLength = (Get-Item -LiteralPath $runtimeLogPath).Length
    if ($currentLength -lt $script:lastLogOffset) {
        $script:lastLogOffset = 0
    }
    if ($currentLength -le $script:lastLogOffset) {
        return
    }

    $stream = $null
    $reader = $null
    try {
        $stream = [System.IO.File]::Open($runtimeLogPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        [void]$stream.Seek($script:lastLogOffset, [System.IO.SeekOrigin]::Begin)
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
    }
    finally {
        if ($reader) { $reader.Dispose() } elseif ($stream) { $stream.Dispose() }
    }

    $script:lastLogOffset = $currentLength
    foreach ($line in ($text -split "`r?`n")) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $logTextBox.AppendText($line + [Environment]::NewLine)
        }
    }
    $logTextBox.SelectionStart = $logTextBox.TextLength
    $logTextBox.ScrollToCaret()
}

function Update-RowStatus {
    param([Parameter(Mandatory = $true)]$Component)

    if ($script:isClosing) {
        return
    }

    $row = $script:rowMap[$Component.key]
    if (-not $row) {
        return
    }
    if (-not (Test-ControlAvailable -Control $row.State) -or -not (Test-ControlAvailable -Control $row.Summary)) {
        return
    }

    $row.State.Text = $Component.state.ToUpperInvariant()
    $row.State.ForeColor = Get-StateColor -State $Component.state
    $row.Summary.Text = $Component.summary
    $tooltipText = if ($Component.details) { $Component.details } else { $Component.summary }
    $script:toolTip.SetToolTip($row.State, $tooltipText)
    $script:toolTip.SetToolTip($row.Summary, $tooltipText)
}

function Refresh-RuntimeView {
    if ($script:isClosing) {
        return
    }

    $snapshot = Get-RuntimeSnapshot
    foreach ($component in $snapshot.components) {
        Update-RowStatus -Component $component
    }
    if (-not (Test-ControlAvailable -Control $summaryLabel) -or -not (Test-ControlAvailable -Control $lastBootstrapLabel)) {
        return
    }

    $summaryLabel.Text = $snapshot.summary
    $summaryLabel.ForeColor = switch ([string]$snapshot.overallState) {
        "healthy" { Get-StateColor -State "ready" }
        "booting" { Get-StateColor -State "starting" }
        "degraded" { Get-StateColor -State "failed" }
        "down" { Get-StateColor -State "stopped" }
        default { if ($snapshot.ok) { Get-StateColor -State "ready" } else { Get-StateColor -State "starting" } }
    }

    if ($snapshot.lastBootstrap) {
        $timestamp = try { ([datetime]$snapshot.lastBootstrap.timestamp).ToLocalTime().ToString("g") } catch { [string]$snapshot.lastBootstrap.timestamp }
        $lastBootstrapLabel.Text = "Last bootstrap: $timestamp  |  $($snapshot.lastBootstrap.summary)"
    }
    else {
        $lastBootstrapLabel.Text = "Last bootstrap: none yet."
    }
}

function Start-HiddenPowerShellProcess {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments
    )

    $normalizedArguments = @()
    foreach ($argument in $Arguments) {
        if ([string]::IsNullOrWhiteSpace($argument)) {
            continue
        }

        if ($argument -match "\s") {
            $normalizedArguments += ('"{0}"' -f $argument)
        }
        else {
            $normalizedArguments += $argument
        }
    }

    $argumentText = [string]::Join(" ", @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ('"{0}"' -f $ScriptPath)
    ) + $normalizedArguments)

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "PowerShell.exe"
    $startInfo.WorkingDirectory = $resolvedRepoRoot
    $startInfo.Arguments = $argumentText
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    return $process
}

function Set-ActionUiState {
    param([bool]$Busy)

    if ($script:isClosing) {
        return
    }
    if (-not (Test-ControlAvailable -Control $bootstrapButton) -or -not (Test-ControlAvailable -Control $progressBar)) {
        return
    }

    $bootstrapButton.Enabled = -not $Busy
    $refreshButton.Enabled = -not $Busy
    $stopButton.Enabled = -not $Busy
    $restartButton.Enabled = -not $Busy
    $progressBar.Visible = $Busy
    $progressBar.Style = if ($Busy) { [System.Windows.Forms.ProgressBarStyle]::Marquee } else { [System.Windows.Forms.ProgressBarStyle]::Blocks }
}

function Start-BootstrapProcess {
    if ($script:isClosing) {
        return
    }

    if ($script:currentProcess -and -not $script:currentProcess.HasExited) {
        Append-ActivityLog "Another runtime action is already in progress."
        return
    }

    $script:lastLogOffset = if (Test-Path $runtimeLogPath) { (Get-Item -LiteralPath $runtimeLogPath).Length } else { 0L }
    $script:currentAction = "bootstrap"
    Set-ActionUiState -Busy $true
    Append-ActivityLog "Starting Suite runtime bootstrap."
    $arguments = @("-Json")
    if ($Notify) {
        $arguments += "-Notify"
    }
    $script:currentProcess = Start-HiddenPowerShellProcess -ScriptPath $startupScript -Arguments $arguments
}

function Start-StopProcess {
    param([bool]$QueueRestart = $false)

    if ($script:isClosing) {
        return
    }

    if ($script:currentProcess -and -not $script:currentProcess.HasExited) {
        Append-ActivityLog "Another runtime action is already in progress."
        return
    }

    $script:restartQueued = $QueueRestart
    $script:currentAction = "stop"
    Set-ActionUiState -Busy $true
    Append-ActivityLog $(if ($QueueRestart) { "Stopping runtime before restart." } else { "Stopping runtime services." })
    $script:currentProcess = Start-HiddenPowerShellProcess -ScriptPath $stopScript -Arguments @("-Json")
}

function Update-ActionState {
    if ($script:isClosing) {
        return
    }

    if (-not $script:currentProcess -or -not $script:currentProcess.HasExited) {
        return
    }

    $exitCode = $script:currentProcess.ExitCode
    $actionName = $script:currentAction
    $script:currentProcess.Dispose()
    $script:currentProcess = $null
    $script:currentAction = $null
    Set-ActionUiState -Busy $false

    if ($actionName -eq "bootstrap") {
        Append-ActivityLog ("Bootstrap finished with exit code {0}." -f $exitCode)
    }
    elseif ($actionName -eq "stop") {
        Append-ActivityLog ("Stop finished with exit code {0}." -f $exitCode)
    }

    if ($script:restartQueued) {
        $script:restartQueued = $false
        Start-BootstrapProcess
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Suite Runtime Control"
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size(1120, 760)
$form.MinimumSize = New-Object System.Drawing.Size(980, 680)
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#f4f1ea")
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Dock = [System.Windows.Forms.DockStyle]::Top
$headerPanel.Height = 96
$headerPanel.Padding = New-Object System.Windows.Forms.Padding(18, 18, 18, 12)
$headerPanel.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#e7dfd0")
$form.Controls.Add($headerPanel)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Suite Runtime Control"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 20)
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(18, 14)
$headerPanel.Controls.Add($titleLabel)

$summaryLabel = New-Object System.Windows.Forms.Label
$summaryLabel.Text = "Loading runtime status..."
$summaryLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 12)
$summaryLabel.AutoSize = $true
$summaryLabel.Location = New-Object System.Drawing.Point(20, 52)
$headerPanel.Controls.Add($summaryLabel)

$lastBootstrapLabel = New-Object System.Windows.Forms.Label
$lastBootstrapLabel.Text = "Last bootstrap: none yet."
$lastBootstrapLabel.AutoSize = $true
$lastBootstrapLabel.Location = New-Object System.Drawing.Point(20, 74)
$headerPanel.Controls.Add($lastBootstrapLabel)

function New-ActionButton {
    param([string]$Text)

    $button = New-Object System.Windows.Forms.Button
    $button.Text = $Text
    $button.AutoSize = $true
    $button.Padding = New-Object System.Windows.Forms.Padding(10, 6, 10, 6)
    $button.Margin = New-Object System.Windows.Forms.Padding(0, 0, 10, 0)
    return $button
}

$buttonPanel = New-Object System.Windows.Forms.FlowLayoutPanel
$buttonPanel.Dock = [System.Windows.Forms.DockStyle]::Top
$buttonPanel.Height = 58
$buttonPanel.Padding = New-Object System.Windows.Forms.Padding(18, 12, 18, 8)
$form.Controls.Add($buttonPanel)

$bootstrapButton = New-ActionButton -Text "Bootstrap Runtime"
$refreshButton = New-ActionButton -Text "Refresh Status"
$stopButton = New-ActionButton -Text "Force Stop Runtime"
$restartButton = New-ActionButton -Text "Restart Runtime"
$openCommandCenterButton = New-ActionButton -Text "Open Command Center"
$openLogFolderButton = New-ActionButton -Text "Open Runtime Logs"
$buttonPanel.Controls.AddRange(@($bootstrapButton, $refreshButton, $stopButton, $restartButton, $openCommandCenterButton, $openLogFolderButton))

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Dock = [System.Windows.Forms.DockStyle]::Top
$progressBar.Height = 8
$progressBar.Visible = $false
$form.Controls.Add($progressBar)

$splitContainer = New-Object System.Windows.Forms.SplitContainer
$splitContainer.Dock = [System.Windows.Forms.DockStyle]::Fill
$splitContainer.Orientation = [System.Windows.Forms.Orientation]::Horizontal
$splitContainer.SplitterDistance = 330
$form.Controls.Add($splitContainer)

$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Dock = [System.Windows.Forms.DockStyle]::Fill
$statusPanel.Padding = New-Object System.Windows.Forms.Padding(18, 16, 18, 10)
$splitContainer.Panel1.Controls.Add($statusPanel)

$statusTable = New-Object System.Windows.Forms.TableLayoutPanel
$statusTable.Dock = [System.Windows.Forms.DockStyle]::Fill
$statusTable.ColumnCount = 3
$statusTable.RowCount = 9
$statusTable.BackColor = [System.Drawing.Color]::White
$statusTable.CellBorderStyle = [System.Windows.Forms.TableLayoutPanelCellBorderStyle]::Single
$statusTable.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 180)))
$statusTable.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 120)))
$statusTable.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 100)))
$statusPanel.Controls.Add($statusTable)

function Add-HeaderCell {
    param([string]$Text, [int]$Column)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
    $label.Dock = [System.Windows.Forms.DockStyle]::Fill
    $label.Padding = New-Object System.Windows.Forms.Padding(10, 9, 10, 9)
    $label.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#efe7db")
    $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $statusTable.Controls.Add($label, $Column, 0)
}

Add-HeaderCell -Text "Component" -Column 0
Add-HeaderCell -Text "State" -Column 1
Add-HeaderCell -Text "Summary" -Column 2

$componentRows = @(
    @{ key = "frontend"; name = "Frontend" },
    @{ key = "docker"; name = "Docker" },
    @{ key = "supabase"; name = "Supabase" },
    @{ key = "backend"; name = "Backend" },
    @{ key = "gateway"; name = "Gateway" },
    @{ key = "watchdogFilesystem"; name = "Watchdog FS" },
    @{ key = "watchdogAutoCad"; name = "Watchdog AutoCAD" },
    @{ key = "autocadPlugin"; name = "AutoCAD Plugin" }
)

for ($index = 0; $index -lt $componentRows.Count; $index += 1) {
    $rowIndex = $index + 1
    $statusTable.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 36)))

    $nameLabel = New-Object System.Windows.Forms.Label
    $nameLabel.Text = [string]$componentRows[$index].name
    $nameLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
    $nameLabel.Padding = New-Object System.Windows.Forms.Padding(10, 8, 10, 8)
    $nameLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
    $nameLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $statusTable.Controls.Add($nameLabel, 0, $rowIndex)

    $stateLabel = New-Object System.Windows.Forms.Label
    $stateLabel.Text = "..."
    $stateLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
    $stateLabel.Padding = New-Object System.Windows.Forms.Padding(10, 8, 10, 8)
    $stateLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $statusTable.Controls.Add($stateLabel, 1, $rowIndex)

    $summaryCell = New-Object System.Windows.Forms.Label
    $summaryCell.Text = "Loading..."
    $summaryCell.Dock = [System.Windows.Forms.DockStyle]::Fill
    $summaryCell.Padding = New-Object System.Windows.Forms.Padding(10, 8, 10, 8)
    $summaryCell.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $statusTable.Controls.Add($summaryCell, 2, $rowIndex)

    $script:rowMap[[string]$componentRows[$index].key] = [pscustomobject]@{
        State = $stateLabel
        Summary = $summaryCell
    }
}

$logPanel = New-Object System.Windows.Forms.Panel
$logPanel.Dock = [System.Windows.Forms.DockStyle]::Fill
$logPanel.Padding = New-Object System.Windows.Forms.Padding(18, 8, 18, 18)
$splitContainer.Panel2.Controls.Add($logPanel)

$logHeader = New-Object System.Windows.Forms.Label
$logHeader.Text = "Activity"
$logHeader.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
$logHeader.Dock = [System.Windows.Forms.DockStyle]::Top
$logHeader.Height = 28
$logPanel.Controls.Add($logHeader)

$logTextBox = New-Object System.Windows.Forms.TextBox
$logTextBox.Multiline = $true
$logTextBox.ReadOnly = $true
$logTextBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$logTextBox.WordWrap = $false
$logTextBox.Dock = [System.Windows.Forms.DockStyle]::Fill
$logTextBox.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#161616")
$logTextBox.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#f4f1ea")
$logTextBox.Font = New-Object System.Drawing.Font("Consolas", 10)
$logPanel.Controls.Add($logTextBox)

$bootstrapButton.Add_Click({ Start-BootstrapProcess })
$refreshButton.Add_Click({
    Append-ActivityLog "Refreshing runtime status."
    Refresh-RuntimeView
})
$stopButton.Add_Click({ Start-StopProcess -QueueRestart $false })
$restartButton.Add_Click({ Start-StopProcess -QueueRestart $true })
$openCommandCenterButton.Add_Click({
    Start-Process "http://localhost:5173/app/command-center" | Out-Null
})
$openLogFolderButton.Add_Click({
    Start-Process explorer.exe $runtimeStatusDir | Out-Null
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $RefreshIntervalMs
$timer.Add_Tick({
    if ($script:isClosing) {
        return
    }

    try {
        Pump-RuntimeLog
        Update-ActionState
        Refresh-RuntimeView
    }
    catch {
        if (-not $script:isClosing) {
            Add-Content -Path $runtimeLogPath -Value ("[{0}] control-panel-tick-warning: {1}" -f (Get-Date).ToString("o"), $_.Exception.Message)
        }
    }
})

$form.Add_Shown({
    if ($script:isClosing) {
        return
    }

    Append-ActivityLog "Suite runtime control panel ready."
    Refresh-RuntimeView
    Pump-RuntimeLog
    $timer.Start()
    if ($AutoBootstrap) {
        Start-BootstrapProcess
    }
})

$form.Add_FormClosing({
    $script:isClosing = $true
    $script:restartQueued = $false
    Stop-UiTimerSafely

    if ($script:currentProcess) {
        try {
            if ($script:currentProcess.HasExited) {
                $script:currentProcess.Dispose()
            }
        }
        catch {
        }
        finally {
            $script:currentProcess = $null
        }
    }
})

$form.Add_FormClosed({
    Stop-UiTimerSafely

    try {
        $script:toolTip.Dispose()
    }
    catch {
    }
})

[void]$form.ShowDialog()

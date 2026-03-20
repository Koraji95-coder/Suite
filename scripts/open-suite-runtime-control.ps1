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
$startupScript = (Resolve-Path (Join-Path $PSScriptRoot "run-suite-runtime-startup.ps1")).Path
$stopScript = (Resolve-Path (Join-Path $PSScriptRoot "stop-suite-runtime.ps1")).Path
$backendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-backend-startup.ps1")).Path
$gatewayCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-gateway-startup.ps1")).Path
$filesystemCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-filesystem-collector-startup.ps1")).Path
$autocadCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-collector-startup.ps1")).Path
$pluginCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-plugin.ps1")).Path
$statusBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } elseif ($env:TEMP) { $env:TEMP } else { $env:USERPROFILE }
$runtimeStatusDir = Join-Path $statusBase "Suite\runtime-bootstrap"
$runtimeStatusPath = Join-Path $runtimeStatusDir "last-bootstrap.json"
$runtimeLogPath = Join-Path $runtimeStatusDir "bootstrap.log"
New-Item -ItemType Directory -Path $runtimeStatusDir -Force | Out-Null

function Convert-CommandOutputToText {
    param([object[]]$Output)

    if (-not $Output) {
        return ""
    }

    return [string]::Join(
        [Environment]::NewLine,
        @(
            $Output | ForEach-Object {
                if ($null -eq $_) { "" } else { $_.ToString() }
            }
        )
    ).Trim()
}

function Get-OutputTail {
    param(
        [string]$Text,
        [int]$LineCount = 8
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $lines = $Text -split "`r?`n"
    return [string]::Join([Environment]::NewLine, ($lines | Select-Object -Last $LineCount)).Trim()
}

function Invoke-JsonPowerShellFile {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments
    )

    try {
        $rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
        $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
        $outputText = Convert-CommandOutputToText -Output $rawOutput
    }
    catch {
        $exitCode = 1
        $outputText = $_.Exception.Message
    }

    $payload = $null
    if (-not [string]::IsNullOrWhiteSpace($outputText)) {
        try {
            $payload = $outputText | ConvertFrom-Json
        }
        catch {
            $firstBrace = $outputText.IndexOf("{")
            $lastBrace = $outputText.LastIndexOf("}")
            if ($firstBrace -ge 0 -and $lastBrace -gt $firstBrace) {
                $jsonText = $outputText.Substring($firstBrace, ($lastBrace - $firstBrace) + 1)
                try {
                    $payload = $jsonText | ConvertFrom-Json
                }
                catch {
                    $payload = $null
                }
            }
        }
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Ok = ($exitCode -eq 0)
        OutputTail = Get-OutputTail -Text $outputText
        Payload = $payload
    }
}

function Test-PortListening {
    param([int]$Port)

    return ($null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1))
}

function Test-DockerReady {
    try {
        & docker version | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

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
    $apiListening = Test-PortListening -Port 54321
    $dbListening = Test-PortListening -Port 54322

    if ($apiListening -and $dbListening) {
        return New-ComponentStatus -Key "supabase" -Name "Supabase" -State "ready" -Ok $true -Summary "API and DB ports are listening." -Details "API 54321, DB 54322."
    }
    if ($apiListening -or $dbListening) {
        return New-ComponentStatus -Key "supabase" -Name "Supabase" -State "starting" -Summary "Supabase is partially online." -Details "API 54321: $apiListening. DB 54322: $dbListening."
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
    $result = Invoke-JsonPowerShellFile -ScriptPath $pluginCheckScript -Arguments @("-Json")
    if ($result.Payload -and [bool]$result.Payload.ok) {
        return New-ComponentStatus -Key "autocadPlugin" -Name "AutoCAD Plugin" -State "ready" -Ok $true -Summary "AutoCAD plugin bundle is healthy." -Details $result.Payload.bundleRoot
    }

    $details = if ($result.Payload -and $result.Payload.errors) { [string]::Join("; ", @($result.Payload.errors)) } else { $result.OutputTail }
    return New-ComponentStatus -Key "autocadPlugin" -Name "AutoCAD Plugin" -State "failed" -Summary "AutoCAD plugin needs attention." -Details $details
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

function Get-RuntimeSnapshot {
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

    [ordered]@{
        ok = ($readyCount -eq $coreComponents.Count)
        timestamp = (Get-Date).ToString("o")
        summary = $summary
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
    $summaryLabel.ForeColor = if ($snapshot.ok) { Get-StateColor -State "ready" } else { Get-StateColor -State "starting" }

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

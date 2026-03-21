[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$backendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-backend-startup.ps1")).Path
$gatewayCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-gateway-startup.ps1")).Path
$frontendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-suite-frontend-startup.ps1")).Path
$filesystemCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-filesystem-collector-startup.ps1")).Path
$autocadCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-collector-startup.ps1")).Path
$pluginCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-plugin.ps1")).Path
$statusBase = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
elseif ($env:TEMP) {
    $env:TEMP
}
else {
    $env:USERPROFILE
}
$runtimeStatusDir = Join-Path $statusBase "Suite\runtime-bootstrap"
$runtimeStatusPath = Join-Path $runtimeStatusDir "last-bootstrap.json"
$currentBootstrapPath = Join-Path $runtimeStatusDir "current-bootstrap.json"
$runtimeLogPath = Join-Path $runtimeStatusDir "bootstrap.log"
$frontendLogPath = Join-Path $runtimeStatusDir "frontend.log"

function Convert-CommandOutputToText {
    param([object[]]$Output)

    if (-not $Output) {
        return ""
    }

    return [string]::Join(
        [Environment]::NewLine,
        @(
            $Output | ForEach-Object {
                if ($null -eq $_) {
                    ""
                }
                else {
                    $_.ToString()
                }
            }
        )
    ).Trim()
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $rawOutput = & $FilePath @Arguments 2>&1
            $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
            $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
            $outputText = Convert-CommandOutputToText -Output $rawOutput
        }
        catch {
            $exitCode = 1
            $outputText = $_.Exception.Message
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
    }
    finally {
        Pop-Location
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Ok = ($exitCode -eq 0)
        OutputText = $outputText
        OutputTail = Get-OutputTail -Text $outputText
    }
}

function Get-OutputTail {
    param(
        [string]$Text,
        [int]$LineCount = 10
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

    [pscustomobject]@{
        ExitCode = $exitCode
        Ok = ($exitCode -eq 0)
        OutputText = $outputText
        OutputTail = Get-OutputTail -Text $outputText
        Payload = $payload
    }
}

function Test-PortListening {
    param([int]$Port)

    return ($null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1))
}

function Get-PortOwningProcessId {
    param([int]$Port)

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $connection) {
        return $null
    }

    return [int]$connection.OwningProcess
}

function Test-DockerReady {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $rawOutput = & docker version --format "{{.Server.Version}}" 2>&1
        $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
        $outputText = Convert-CommandOutputToText -Output $rawOutput
        return (
            $exitCode -eq 0 -and
            -not [string]::IsNullOrWhiteSpace($outputText) -and
            $outputText -notmatch "(?i)failed to connect"
        )
    }
    catch {
        return $false
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Test-SupabaseOutputIndicatesReady {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $false
    }

    if (
        $Text -match "(?im)\bcontainer is not ready\b" -or
        $Text -match "(?im)\bfailed to inspect\b" -or
        $Text -match "(?im)\btry rerunning the command with --debug\b"
    ) {
        return $false
    }

    return (
        $Text -match "(?im)\bsupabase local development setup is running\b" -or
        $Text -match "(?im)\bProject URL\b"
    )
}

function Get-ProcessUptimeSeconds {
    param([int]$ProcessId)

    if (-not $ProcessId) {
        return $null
    }

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        if ($process.StartTime) {
            return [int][Math]::Max(0, ((Get-Date) - $process.StartTime).TotalSeconds)
        }
    }
    catch {
        return $null
    }

    return $null
}

function Get-ProcessLabel {
    param([int]$ProcessId)

    if (-not $ProcessId) {
        return $null
    }

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return [string]$process.ProcessName
    }
    catch {
        return $null
    }
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

function Get-CurrentBootstrapStatus {
    if (-not (Test-Path $currentBootstrapPath)) {
        return $null
    }

    try {
        return (Get-Content -Path $currentBootstrapPath -Raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function New-ServiceStatus {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$State,
        [Parameter(Mandatory = $true)][bool]$Ok,
        [Parameter(Mandatory = $true)][string]$Summary,
        [string]$Details,
        [int]$Port,
        [Nullable[int]]$ProcessId,
        [Nullable[int]]$UptimeSeconds,
        [string]$StartupMode,
        [object[]]$Notes,
        [object]$Substatus,
        [object]$LogTarget
    )

    $resolvedDetails = if ([string]::IsNullOrWhiteSpace($Details)) { $null } else { $Details }
    $resolvedProcessLabel = if ($ProcessId) { Get-ProcessLabel -ProcessId $ProcessId } else { $null }
    $resolvedStartupMode = if ([string]::IsNullOrWhiteSpace($StartupMode)) { $null } else { $StartupMode }
    $resolvedNotes = @($Notes | Where-Object {
        $null -ne $_ -and
        -not [string]::IsNullOrWhiteSpace([string]$_.label) -and
        -not [string]::IsNullOrWhiteSpace([string]$_.value)
    })

    [pscustomobject]@{
        id = $Id
        name = $Name
        state = $State
        ok = $Ok
        summary = $Summary
        details = $resolvedDetails
        port = $Port
        processId = $ProcessId
        processLabel = $resolvedProcessLabel
        uptimeSeconds = $UptimeSeconds
        startupMode = $resolvedStartupMode
        notes = if ($resolvedNotes.Count -gt 0) { @($resolvedNotes) } else { @() }
        substatus = $Substatus
        logTarget = $LogTarget
    }
}

$services = @()

$supabaseStatusResult = Invoke-ExternalCommand -FilePath "node" -Arguments @((Join-Path $resolvedRepoRoot "scripts\run-supabase-cli.mjs"), "status") -WorkingDirectory $resolvedRepoRoot
$supabaseStatusReady = $supabaseStatusResult.Ok -and (Test-SupabaseOutputIndicatesReady -Text $supabaseStatusResult.OutputText)
$supabaseApiListening = Test-PortListening -Port 54321
$supabaseDbListening = Test-PortListening -Port 54322
$supabaseStudioListening = Test-PortListening -Port 54323
$supabaseProcessId = Get-PortOwningProcessId -Port 54321
$supabaseState = if ($supabaseStatusReady -or ($supabaseApiListening -and $supabaseDbListening)) {
    "running"
}
elseif (
    $supabaseApiListening -or
    $supabaseDbListening -or
    ($supabaseStatusResult.OutputText -match "(?im)\bcontainer is not ready\b")
) {
    "starting"
}
else {
    "stopped"
}
$supabaseSummary = switch ($supabaseState) {
    "running" { "Local Supabase is running."; break }
    "starting" { "Local Supabase is partially online."; break }
    default { "Local Supabase is not running."; break }
}
$supabaseStartupMode = if (Test-DockerReady) { "docker" } else { $null }
$supabaseDetails = if ($supabaseState -eq "running" -and $supabaseStudioListening) {
    "API 54321, DB 54322, Studio 54323."
}
elseif ($supabaseState -eq "running" -and $supabaseStatusReady) {
    "Supabase CLI reports the local stack is running."
}
elseif ($supabaseState -eq "starting") {
    "API 54321: $supabaseApiListening. DB 54322: $supabaseDbListening."
}
else {
    "Start Docker Desktop and run npm run supabase:start if the stack should be available."
}
$supabaseNotes = @()
if ($supabaseState -eq "running" -and $supabaseStudioListening) {
    $supabaseNotes += [pscustomobject]@{
        label = "Endpoints"
        value = "API 54321, DB 54322, Studio 54323"
    }
    $supabaseNotes += [pscustomobject]@{
        label = "Console"
        value = "Supabase Studio is available at http://127.0.0.1:54323."
    }
}
elseif ($supabaseState -eq "running" -and $supabaseStatusReady) {
    $supabaseNotes += [pscustomobject]@{
        label = "Status"
        value = "Supabase CLI reports the local stack is healthy even though port probes are still catching up."
    }
}
elseif ($supabaseState -eq "starting") {
    $supabaseNotes += [pscustomobject]@{
        label = "Readiness"
        value = "API 54321 listening: $supabaseApiListening. DB 54322 listening: $supabaseDbListening."
    }
}
else {
    $supabaseNotes += [pscustomobject]@{
        label = "Recovery"
        value = "Start Docker Desktop, then use Bootstrap All to bring the local stack back."
    }
}
$services += (New-ServiceStatus `
    -Id "supabase" `
    -Name "Supabase (Local)" `
    -State $supabaseState `
    -Ok ($supabaseState -eq "running") `
    -Summary $supabaseSummary `
    -Details $supabaseDetails `
    -Port 54321 `
    -ProcessId $supabaseProcessId `
    -UptimeSeconds (Get-ProcessUptimeSeconds -ProcessId $supabaseProcessId) `
    -StartupMode $supabaseStartupMode `
    -Notes $supabaseNotes `
    -Substatus $null `
    -LogTarget ([pscustomobject]@{
        kind = "url"
        label = "Supabase Studio"
        target = "http://127.0.0.1:54323"
    }))

$backendResult = Invoke-JsonPowerShellFile -ScriptPath $backendCheckScript -Arguments @("-Json")
$backendRunning = [bool]($backendResult.Payload -and $backendResult.Payload.Running)
$backendProcessId = if ($backendRunning) { [int]$backendResult.Payload.ProcessId } else { $null }
$backendState = if ($backendRunning) { "running" } else { "stopped" }
$backendSummary = if ($backendRunning) { "Backend is running." } else { "Backend is not running." }
$backendDetails = if ($backendRunning) {
    [string]$backendResult.Payload.CommandLine
}
elseif ($backendResult.Payload -and $backendResult.Payload.Error) {
    [string]$backendResult.Payload.Error
}
else {
    $backendResult.OutputTail
}
$backendNotes = @()
if ($backendRunning -and $backendResult.Payload -and $backendResult.Payload.CommandLine) {
    $backendNotes += [pscustomobject]@{
        label = "Command"
        value = [string]$backendResult.Payload.CommandLine
    }
}
elseif ($backendResult.Payload -and $backendResult.Payload.Error) {
    $backendNotes += [pscustomobject]@{
        label = "Status"
        value = [string]$backendResult.Payload.Error
    }
}
else {
    $backendNotes += [pscustomobject]@{
        label = "Recovery"
        value = "Use Bootstrap All or Start to launch the Watchdog API server."
    }
}
$services += (New-ServiceStatus `
    -Id "backend" `
    -Name "Watchdog Backend" `
    -State $backendState `
    -Ok $backendRunning `
    -Summary $backendSummary `
    -Details $backendDetails `
    -Port 5000 `
    -ProcessId $backendProcessId `
    -UptimeSeconds (Get-ProcessUptimeSeconds -ProcessId $backendProcessId) `
    -StartupMode "background" `
    -Notes $backendNotes `
    -Substatus $null `
    -LogTarget ([pscustomobject]@{
        kind = "path"
        label = "Runtime Log Folder"
        target = $runtimeStatusDir
    }))

$gatewayResult = Invoke-JsonPowerShellFile -ScriptPath $gatewayCheckScript -Arguments @("-Json")
$gatewayRunning = [bool]($gatewayResult.Payload -and $gatewayResult.Payload.Running)
$gatewayHealthy = [bool]($gatewayResult.Payload -and $gatewayResult.Payload.Healthy)
$gatewayProcessId = if ($gatewayRunning -or $gatewayHealthy) { [int]$gatewayResult.Payload.ProcessId } else { $null }
$gatewayState = if ($gatewayHealthy) {
    "running"
}
elseif ($gatewayRunning) {
    "starting"
}
else {
    "stopped"
}
$gatewayDetails = if ($gatewayHealthy -or $gatewayRunning) {
    [string]$gatewayResult.Payload.CommandLine
}
elseif ($gatewayResult.Payload -and $gatewayResult.Payload.Error) {
    [string]$gatewayResult.Payload.Error
}
else {
    $gatewayResult.OutputTail
}
$gatewaySummary = if ($gatewayHealthy) {
    "Gateway is healthy."
}
elseif ($gatewayRunning) {
    "Gateway is running but still warming up."
}
else {
    "Gateway is not running."
}
$gatewayNotes = @()
if (($gatewayHealthy -or $gatewayRunning) -and $gatewayResult.Payload -and $gatewayResult.Payload.CommandLine) {
    $gatewayNotes += [pscustomobject]@{
        label = "Command"
        value = [string]$gatewayResult.Payload.CommandLine
    }
}
elseif ($gatewayResult.Payload -and $gatewayResult.Payload.Error) {
    $gatewayNotes += [pscustomobject]@{
        label = "Status"
        value = [string]$gatewayResult.Payload.Error
    }
}
else {
    $gatewayNotes += [pscustomobject]@{
        label = "Recovery"
        value = "Use Bootstrap All or Start to restore the local gateway."
    }
}
$services += (New-ServiceStatus `
    -Id "gateway" `
    -Name "API Gateway" `
    -State $gatewayState `
    -Ok $gatewayHealthy `
    -Summary $gatewaySummary `
    -Details $gatewayDetails `
    -Port 3000 `
    -ProcessId $gatewayProcessId `
    -UptimeSeconds (Get-ProcessUptimeSeconds -ProcessId $gatewayProcessId) `
    -StartupMode "background" `
    -Notes $gatewayNotes `
    -Substatus $null `
    -LogTarget ([pscustomobject]@{
        kind = "path"
        label = "Runtime Log Folder"
        target = $runtimeStatusDir
    }))

$frontendResult = Invoke-JsonPowerShellFile -ScriptPath $frontendCheckScript -Arguments @("-Json")
$frontendRunning = [bool]($frontendResult.Payload -and $frontendResult.Payload.Running)
$frontendHealthy = [bool]($frontendResult.Payload -and $frontendResult.Payload.Healthy)
$frontendListening = [bool]($frontendResult.Payload -and $frontendResult.Payload.Listening)
$frontendProcessId = if ($frontendRunning -or $frontendHealthy) { [int]$frontendResult.Payload.ProcessId } else { $null }
$frontendState = if ($frontendHealthy) {
    "running"
}
elseif ($frontendRunning -or $frontendListening) {
    "starting"
}
else {
    "stopped"
}
$frontendDetails = if ($frontendHealthy -or $frontendRunning) {
    [string]$frontendResult.Payload.CommandLine
}
elseif ($frontendResult.Payload -and $frontendResult.Payload.Error) {
    [string]$frontendResult.Payload.Error
}
else {
    $frontendResult.OutputTail
}
$frontendSummary = if ($frontendHealthy) {
    "Frontend dev server is ready."
}
elseif ($frontendRunning -or $frontendListening) {
    "Frontend process is running and still warming up."
}
else {
    "Frontend dev server is not running."
}
$frontendNotes = @()
if ($frontendResult.Payload -and $frontendResult.Payload.Url) {
    $frontendNotes += [pscustomobject]@{
        label = "Local URL"
        value = [string]$frontendResult.Payload.Url
    }
}
if ($frontendResult.Payload -and $frontendResult.Payload.LogPath) {
    $frontendNotes += [pscustomobject]@{
        label = "Log File"
        value = [string]$frontendResult.Payload.LogPath
    }
}
if (($frontendHealthy -or $frontendRunning) -and $frontendResult.Payload -and $frontendResult.Payload.CommandLine) {
    $frontendNotes += [pscustomobject]@{
        label = "Command"
        value = [string]$frontendResult.Payload.CommandLine
    }
}
elseif ($frontendResult.Payload -and $frontendResult.Payload.Error) {
    $frontendNotes += [pscustomobject]@{
        label = "Status"
        value = [string]$frontendResult.Payload.Error
    }
}
else {
    $frontendNotes += [pscustomobject]@{
        label = "Recovery"
        value = "Use Bootstrap All or Start to launch the local Vite frontend."
    }
}
$services += (New-ServiceStatus `
    -Id "frontend" `
    -Name "Suite Frontend" `
    -State $frontendState `
    -Ok $frontendHealthy `
    -Summary $frontendSummary `
    -Details $frontendDetails `
    -Port 5173 `
    -ProcessId $frontendProcessId `
    -UptimeSeconds (Get-ProcessUptimeSeconds -ProcessId $frontendProcessId) `
    -StartupMode "background" `
    -Notes $frontendNotes `
    -Substatus $null `
    -LogTarget ([pscustomobject]@{
        kind = "path"
        label = "Frontend Log"
        target = $frontendLogPath
    }))

$filesystemResult = Invoke-JsonPowerShellFile -ScriptPath $filesystemCheckScript -Arguments @("-Json")
$filesystemHealthy = [bool]($filesystemResult.Payload -and $filesystemResult.Payload.healthy)
$filesystemDaemonRunning = [bool]($filesystemResult.Payload -and $filesystemResult.Payload.daemonRunning)
$filesystemWarnings = if ($filesystemResult.Payload -and $filesystemResult.Payload.warnings) {
    [string]::Join("; ", @($filesystemResult.Payload.warnings))
}
else {
    ""
}
$filesystemErrors = if ($filesystemResult.Payload -and $filesystemResult.Payload.errors) {
    [string]::Join("; ", @($filesystemResult.Payload.errors))
}
else {
    ""
}
$filesystemDetails = @($filesystemWarnings, $filesystemErrors) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$filesystemState = if ($filesystemHealthy) {
    "running"
}
elseif ($filesystemDaemonRunning) {
    "error"
}
else {
    "stopped"
}
$filesystemSummary = if ($filesystemHealthy) {
    "Filesystem collector is healthy."
}
elseif ($filesystemDaemonRunning) {
    "Filesystem collector is running but needs attention."
}
else {
    "Filesystem collector is not running."
}
$filesystemStartupMode = if ($filesystemResult.Payload) { [string]$filesystemResult.Payload.startupMode } else { $null }
$filesystemNotes = @()
if ($filesystemHealthy) {
    $filesystemNotes += [pscustomobject]@{
        label = "Health"
        value = "Startup registration and daemon heartbeat are both healthy."
    }
}
elseif ($filesystemDaemonRunning) {
    $filesystemNotes += [pscustomobject]@{
        label = "Health"
        value = "The daemon is running, but the startup checks reported warnings."
    }
}
else {
    $filesystemNotes += [pscustomobject]@{
        label = "Recovery"
        value = "Use Bootstrap All or Start to reinstall and launch the filesystem collector."
    }
}
if (-not [string]::IsNullOrWhiteSpace($filesystemWarnings)) {
    $filesystemNotes += [pscustomobject]@{
        label = "Warnings"
        value = $filesystemWarnings
    }
}
if (-not [string]::IsNullOrWhiteSpace($filesystemErrors)) {
    $filesystemNotes += [pscustomobject]@{
        label = "Errors"
        value = $filesystemErrors
    }
}
$services += (New-ServiceStatus `
    -Id "watchdog-filesystem" `
    -Name "Filesystem Collector" `
    -State $filesystemState `
    -Ok $filesystemHealthy `
    -Summary $filesystemSummary `
    -Details $(([string]::Join("; ", @($filesystemDetails))).Trim()) `
    -Port 0 `
    -ProcessId $null `
    -UptimeSeconds $null `
    -StartupMode $filesystemStartupMode `
    -Notes $filesystemNotes `
    -Substatus $null `
    -LogTarget ([pscustomobject]@{
        kind = "path"
        label = "Runtime Log Folder"
        target = $runtimeStatusDir
    }))

$autocadResult = Invoke-JsonPowerShellFile -ScriptPath $autocadCheckScript -Arguments @("-Json")
$autocadHealthy = [bool]($autocadResult.Payload -and $autocadResult.Payload.healthy)
$autocadDaemonRunning = [bool]($autocadResult.Payload -and $autocadResult.Payload.daemonRunning)
$pluginResult = Invoke-JsonPowerShellFile -ScriptPath $pluginCheckScript -Arguments @("-Json")
$pluginHealthy = [bool]($pluginResult.Payload -and $pluginResult.Payload.ok)
$autocadWarnings = if ($autocadResult.Payload -and $autocadResult.Payload.warnings) {
    [string]::Join("; ", @($autocadResult.Payload.warnings))
}
else {
    ""
}
$autocadErrors = if ($autocadResult.Payload -and $autocadResult.Payload.errors) {
    [string]::Join("; ", @($autocadResult.Payload.errors))
}
else {
    ""
}
$pluginDetails = if ($pluginHealthy) {
    [string]$pluginResult.Payload.bundleRoot
}
elseif ($pluginResult.Payload -and $pluginResult.Payload.errors) {
    [string]::Join("; ", @($pluginResult.Payload.errors))
}
else {
    $pluginResult.OutputTail
}
$autocadDetails = @($autocadWarnings, $autocadErrors) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$autocadState = if ($autocadHealthy) {
    "running"
}
elseif ($autocadDaemonRunning -or $pluginHealthy) {
    "error"
}
else {
    "stopped"
}
$autocadSummary = if ($autocadHealthy -and $pluginHealthy) {
    "AutoCAD collector and plugin are healthy."
}
elseif ($autocadDaemonRunning -or $pluginHealthy) {
    "AutoCAD collector needs attention."
}
else {
    "AutoCAD collector is not running."
}
$autocadStartupMode = if ($autocadResult.Payload) { [string]$autocadResult.Payload.startupMode } else { $null }
$pluginState = if ($pluginHealthy) { "running" } else { "error" }
$pluginSummary = if ($pluginHealthy) { "Plugin healthy." } else { "Plugin needs attention." }
$autocadNotes = @()
if ($autocadHealthy) {
    $autocadNotes += [pscustomobject]@{
        label = "Collector"
        value = "Startup registration and AutoCAD collector heartbeat both look healthy."
    }
}
elseif ($autocadDaemonRunning -or $pluginHealthy) {
    $autocadNotes += [pscustomobject]@{
        label = "Collector"
        value = "The collector is partially healthy. Review the plugin detail and any warnings below."
    }
}
else {
    $autocadNotes += [pscustomobject]@{
        label = "Recovery"
        value = "Use Bootstrap All or Start to restore the AutoCAD collector startup path."
    }
}
if (-not [string]::IsNullOrWhiteSpace($autocadWarnings)) {
    $autocadNotes += [pscustomobject]@{
        label = "Warnings"
        value = $autocadWarnings
    }
}
if (-not [string]::IsNullOrWhiteSpace($autocadErrors)) {
    $autocadNotes += [pscustomobject]@{
        label = "Errors"
        value = $autocadErrors
    }
}
$pluginNotes = @()
if ($pluginHealthy -and $pluginResult.Payload -and $pluginResult.Payload.bundleRoot) {
    $pluginNotes += [pscustomobject]@{
        label = "Bundle"
        value = [string]$pluginResult.Payload.bundleRoot
    }
}
elseif ($pluginResult.Payload -and $pluginResult.Payload.errors -and @($pluginResult.Payload.errors).Count -gt 0) {
    $pluginNotes += [pscustomobject]@{
        label = "Errors"
        value = [string]::Join("; ", @($pluginResult.Payload.errors))
    }
}
$services += (New-ServiceStatus `
    -Id "watchdog-autocad" `
    -Name "AutoCAD Collector" `
    -State $autocadState `
    -Ok ($autocadHealthy -and $pluginHealthy) `
    -Summary $autocadSummary `
    -Details $(([string]::Join("; ", @($autocadDetails))).Trim()) `
    -Port 0 `
    -ProcessId $null `
    -UptimeSeconds $null `
    -StartupMode $autocadStartupMode `
    -Notes $autocadNotes `
    -Substatus ([pscustomobject]@{
        id = "autocad-plugin"
        name = "Plugin"
        state = $pluginState
        summary = $pluginSummary
        details = $pluginDetails
        notes = @($pluginNotes)
    }) `
    -LogTarget ([pscustomobject]@{
        kind = "path"
        label = "Runtime Log Folder"
        target = $runtimeStatusDir
    }))

$runningCount = @($services | Where-Object { $_.state -eq "running" }).Count
$hasStarting = @($services | Where-Object { $_.state -eq "starting" }).Count -gt 0
$hasError = @($services | Where-Object { $_.state -eq "error" }).Count -gt 0

$overall = if ($runningCount -eq $services.Count) {
    [pscustomobject]@{
        state = "healthy"
        text = "ALL SYSTEMS UP"
    }
}
elseif ($hasStarting) {
    [pscustomobject]@{
        state = "booting"
        text = "BOOTING"
    }
}
elseif ($hasError) {
    [pscustomobject]@{
        state = "degraded"
        text = "DEGRADED"
    }
}
elseif ($runningCount -gt 0) {
    [pscustomobject]@{
        state = "degraded"
        text = "PARTIAL"
    }
}
else {
    [pscustomobject]@{
        state = "down"
        text = "OFFLINE"
    }
}

$result = [ordered]@{
    ok = ($runningCount -eq $services.Count)
    timestamp = (Get-Date).ToString("o")
    repoRoot = $resolvedRepoRoot
    overall = $overall
    runtime = [ordered]@{
        statusDir = $runtimeStatusDir
        statusPath = $runtimeStatusPath
        currentBootstrapPath = $currentBootstrapPath
        logPath = $runtimeLogPath
        lastBootstrap = Get-LastBootstrapStatus
        currentBootstrap = Get-CurrentBootstrapStatus
    }
    services = @($services)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    Write-Host "Suite runtime status: $($overall.text)"
    foreach ($service in $services) {
        Write-Host "- [$($service.state)] $($service.name): $($service.summary)"
        if ($service.details) {
            Write-Host "  $($service.details -replace "`r?`n", "`r`n  ")"
        }
        if ($service.substatus) {
            Write-Host "  - [$($service.substatus.state)] $($service.substatus.name): $($service.substatus.summary)"
        }
    }
}

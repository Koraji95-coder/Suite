[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("supabase", "backend", "gateway", "frontend", "watchdog-filesystem", "watchdog-autocad")]
    [string]$Service,
    [Parameter(Mandatory = $true)]
    [ValidateSet("start", "stop", "restart", "status", "logs")]
    [string]$Action,
    [string]$RepoRoot,
    [switch]$ForceUnsafeAutocadStop,
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
$statusScript = (Resolve-Path (Join-Path $PSScriptRoot "get-suite-runtime-status.ps1")).Path
$backendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-backend-startup.ps1")).Path
$gatewayCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-gateway-startup.ps1")).Path
$frontendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-suite-frontend-startup.ps1")).Path
$filesystemInstallScript = (Resolve-Path (Join-Path $PSScriptRoot "install-watchdog-filesystem-collector-startup.ps1")).Path
$autocadInstallScript = (Resolve-Path (Join-Path $PSScriptRoot "install-watchdog-autocad-collector-startup.ps1")).Path
$autocadSafetyScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-autocad-safety.ps1")).Path
$runtimePaths = Get-SuiteRuntimePaths
$runtimeStatusDir = $runtimePaths.RuntimeStatusDir
$frontendLogPath = $runtimePaths.FrontendLogPath

. $autocadSafetyScript

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

function Test-SupabaseOutputIndicatesReady {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $false
    }

    if (
        $Text -match "(?im)\bcontainer is not ready\b" -or
        $Text -match "(?im)\bstopped services\b" -or
        $Text -match "(?im)\bno active local containers\b"
    ) {
        return $false
    }

    return (
        $Text -match "(?im)\bsupabase local development setup is running\b" -or
        $Text -match "(?im)\bProject URL\b"
    )
}

function Test-SupabaseStopped {
    $apiListening = Test-PortListening -Port 54321
    $dbListening = Test-PortListening -Port 54322
    $studioListening = Test-PortListening -Port 54323

    if ($apiListening -or $dbListening -or $studioListening) {
        return $false
    }

    $statusResult = Invoke-ExternalCommand -FilePath "node" -Arguments @((Join-Path $resolvedRepoRoot "scripts\run-supabase-cli.mjs"), "status") -WorkingDirectory $resolvedRepoRoot
    return -not ($statusResult.Ok -and (Test-SupabaseOutputIndicatesReady -Text $statusResult.OutputText))
}

function Get-ServiceSnapshot {
    $statusResult = Invoke-JsonPowerShellFile -ScriptPath $statusScript -Arguments @("-Json")
    $serviceStatus = $null
    if ($statusResult.Payload -and $statusResult.Payload.services) {
        $serviceStatus = @($statusResult.Payload.services | Where-Object { $_.id -eq $Service }) | Select-Object -First 1
    }

    return [pscustomobject]@{
        Status = $serviceStatus
        Payload = $statusResult.Payload
        Result = $statusResult
    }
}

function Stop-PortListeners {
    param([int[]]$Ports)

    $stoppedIds = New-Object System.Collections.Generic.List[int]
    foreach ($port in $Ports) {
        $owningProcesses = @(
            Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique
        )

        foreach ($processId in $owningProcesses) {
            if (-not $processId -or $stoppedIds.Contains([int]$processId)) {
                continue
            }

            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                $stoppedIds.Add([int]$processId)
            }
            catch {
            }
        }
    }

    return @($stoppedIds.ToArray())
}

function Stop-ProcessesByCommandTokens {
    param([string[]]$Tokens)

    $stoppedIds = New-Object System.Collections.Generic.List[int]
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe' OR Name LIKE 'python%' OR Name = 'node.exe' OR Name = 'node' OR Name = 'dotnet.exe' OR Name = 'dotnet' OR Name = 'NamedPipeServer.exe' OR Name = 'NamedPipeServer' OR Name = '.NET Host'"

    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        $normalized = $commandLine.ToLowerInvariant()
        $matchesAll = $true
        foreach ($token in $Tokens) {
            if ([string]::IsNullOrWhiteSpace($token)) {
                continue
            }
            if (-not $normalized.Contains($token.ToLowerInvariant())) {
                $matchesAll = $false
                break
            }
        }

        if (-not $matchesAll) {
            continue
        }

        $processId = [int]$process.ProcessId
        if ($stoppedIds.Contains($processId)) {
            continue
        }

        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            $stoppedIds.Add($processId)
        }
        catch {
        }
    }

    return @($stoppedIds.ToArray())
}

function Get-ProcessesByCommandTokens {
    param([string[]]$Tokens)

    $matchedProcesses = New-Object System.Collections.Generic.List[object]
    $seenIds = @{}
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe' OR Name LIKE 'python%' OR Name = 'node.exe' OR Name = 'node' OR Name = 'dotnet.exe' OR Name = 'dotnet' OR Name = 'NamedPipeServer.exe' OR Name = 'NamedPipeServer' OR Name = '.NET Host'"

    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        $normalized = $commandLine.ToLowerInvariant()
        $matchesAll = $true
        foreach ($token in $Tokens) {
            if ([string]::IsNullOrWhiteSpace($token)) {
                continue
            }
            if (-not $normalized.Contains($token.ToLowerInvariant())) {
                $matchesAll = $false
                break
            }
        }

        if (-not $matchesAll) {
            continue
        }

        $processId = [int]$process.ProcessId
        if ($seenIds.ContainsKey($processId)) {
            continue
        }

        $seenIds[$processId] = $true
        $matchedProcesses.Add($process)
    }

    return @($matchedProcesses.ToArray())
}

function Format-StoppedProcessMessage {
    param(
        [string]$Name,
        [int[]]$StoppedIds
    )

    if (@($StoppedIds).Count -eq 0) {
        return "$Name already stopped."
    }

    return "Stopped ${Name}: $([string]::Join(', ', @($StoppedIds)))"
}

function Stop-ServiceNow {
    switch ($Service) {
        "supabase" {
            $supabaseStop = Invoke-ExternalCommand -FilePath "node" -Arguments @((Join-Path $resolvedRepoRoot "scripts\run-supabase-cli.mjs"), "stop") -WorkingDirectory $resolvedRepoRoot
            $supabaseOk = $supabaseStop.Ok -or ($supabaseStop.OutputText -match "(?im)\bno containers to stop\b")
            if (-not $supabaseOk) {
                $supabaseOk = Test-SupabaseStopped
            }

            return [pscustomobject]@{
                ExitCode = if ($supabaseOk) { 0 } else { $supabaseStop.ExitCode }
                Ok = $supabaseOk
                OutputText = $supabaseStop.OutputText
                OutputTail = $supabaseStop.OutputTail
            }
        }
        "backend" {
            $stoppedIds = Stop-ProcessesByCommandTokens -Tokens @("backend/api_server.py")
            Stop-PortListeners -Ports @(5000) | Out-Null
            $message = Format-StoppedProcessMessage -Name "backend processes" -StoppedIds $stoppedIds
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = $message
                OutputTail = $message
            }
        }
        "gateway" {
            $stoppedIds = New-Object System.Collections.Generic.List[int]
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("run-agent-gateway.mjs"))) {
                $stoppedIds.Add([int]$id)
            }
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("suite-agent-gateway.mjs"))) {
                if (-not $stoppedIds.Contains([int]$id)) {
                    $stoppedIds.Add([int]$id)
                }
            }
            Stop-PortListeners -Ports @(3000) | Out-Null
            $message = Format-StoppedProcessMessage -Name "gateway processes" -StoppedIds $stoppedIds.ToArray()
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = $message
                OutputTail = $message
            }
        }
        "frontend" {
            $stoppedIds = New-Object System.Collections.Generic.List[int]
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("run-suite-frontend-dev.ps1", "-frontendlogpath"))) {
                $stoppedIds.Add([int]$id)
            }
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("vite", "--strictport", "--port", "5173"))) {
                if (-not $stoppedIds.Contains([int]$id)) {
                    $stoppedIds.Add([int]$id)
                }
            }
            Stop-PortListeners -Ports @(5173) | Out-Null
            $message = Format-StoppedProcessMessage -Name "frontend processes" -StoppedIds $stoppedIds.ToArray()
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = $message
                OutputTail = $message
            }
        }
        "watchdog-filesystem" {
            $stoppedIds = New-Object System.Collections.Generic.List[int]
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("watchdog-filesystem-collector-daemon.ps1"))) {
                $stoppedIds.Add([int]$id)
            }
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("run-watchdog-filesystem-collector.py"))) {
                if (-not $stoppedIds.Contains([int]$id)) {
                    $stoppedIds.Add([int]$id)
                }
            }
            $message = Format-StoppedProcessMessage -Name "filesystem collector processes" -StoppedIds $stoppedIds.ToArray()
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = $message
                OutputTail = $message
            }
        }
        "watchdog-autocad" {
            $daemonMatches = @(Get-ProcessesByCommandTokens -Tokens @("watchdog-autocad-collector-daemon.ps1"))
            $workerMatches = @(Get-ProcessesByCommandTokens -Tokens @("run-watchdog-autocad-state-collector.py"))
            $targetsPresent = ($daemonMatches.Count -gt 0 -or $workerMatches.Count -gt 0)

            if ($targetsPresent -and -not $ForceUnsafeAutocadStop) {
                $autocadSafety = Get-SuiteRuntimeAutoCadStopSafety
                if ($autocadSafety.shouldSkipStop) {
                    $message = "AutoCAD collector shutdown skipped for safety."
                    return [pscustomobject]@{
                        ExitCode = 0
                        Ok = $true
                        OutputText = $message
                        OutputTail = $autocadSafety.reason
                        PreferredSummary = $message
                        PreferredDetails = $autocadSafety.reason
                        SkippedForSafety = $true
                    }
                }
            }

            $stoppedIds = New-Object System.Collections.Generic.List[int]
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("watchdog-autocad-collector-daemon.ps1"))) {
                $stoppedIds.Add([int]$id)
            }
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("run-watchdog-autocad-state-collector.py"))) {
                if (-not $stoppedIds.Contains([int]$id)) {
                    $stoppedIds.Add([int]$id)
                }
            }
            $message = Format-StoppedProcessMessage -Name "AutoCAD collector processes" -StoppedIds $stoppedIds.ToArray()
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = $message
                OutputTail = $message
            }
        }
    }
}

function Start-ServiceNow {
    switch ($Service) {
        "supabase" {
            return Invoke-ExternalCommand -FilePath "node" -Arguments @((Join-Path $resolvedRepoRoot "scripts\run-supabase-cli.mjs"), "start") -WorkingDirectory $resolvedRepoRoot
        }
        "backend" {
            return Invoke-JsonPowerShellFile -ScriptPath $backendCheckScript -Arguments @("-StartIfMissing", "-Json")
        }
        "gateway" {
            return Invoke-JsonPowerShellFile -ScriptPath $gatewayCheckScript -Arguments @("-StartIfMissing", "-Json")
        }
        "frontend" {
            return Invoke-JsonPowerShellFile -ScriptPath $frontendCheckScript -Arguments @("-StartIfMissing", "-Json")
        }
        "watchdog-filesystem" {
            return Invoke-ExternalCommand -FilePath "PowerShell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $filesystemInstallScript) -WorkingDirectory $resolvedRepoRoot
        }
        "watchdog-autocad" {
            return Invoke-ExternalCommand -FilePath "PowerShell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $autocadInstallScript) -WorkingDirectory $resolvedRepoRoot
        }
    }
}

function Get-LogTarget {
    switch ($Service) {
        "supabase" {
            return [pscustomobject]@{
                kind = "url"
                label = "Supabase Studio"
                target = "http://127.0.0.1:54323"
            }
        }
        "frontend" {
            return [pscustomobject]@{
                kind = "path"
                label = "Frontend Log"
                target = $frontendLogPath
            }
        }
        default {
            return [pscustomobject]@{
                kind = "path"
                label = "Runtime Log Folder"
                target = $runtimeStatusDir
            }
        }
    }
}

function Test-ServiceActionSucceeded {
    param(
        [string]$RequestedAction,
        [object]$StatusObject
    )

    if ($null -eq $StatusObject) {
        return $false
    }

    $state = [string]$StatusObject.state
    switch ($RequestedAction) {
        "status" {
            return $true
        }
        "logs" {
            return $true
        }
        "start" {
            return ($state -eq "running" -or $state -eq "starting")
        }
        "restart" {
            return ($state -eq "running" -or $state -eq "starting")
        }
        "stop" {
            return ($state -ne "running" -and $state -ne "starting")
        }
        default {
            return $false
        }
    }
}

$operation = $null

switch ($Action) {
    "status" {
        $operation = [pscustomobject]@{
            Ok = $true
            OutputTail = "Loaded service status."
        }
    }
    "logs" {
        $operation = [pscustomobject]@{
            Ok = $true
            OutputTail = "Resolved log target."
        }
    }
    "start" {
        $operation = Start-ServiceNow
    }
    "stop" {
        $operation = Stop-ServiceNow
    }
    "restart" {
        $stopResult = Stop-ServiceNow
        if ($stopResult.PSObject.Properties["SkippedForSafety"] -and [bool]$stopResult.SkippedForSafety) {
            $operation = $stopResult
        }
        else {
            $startResult = Start-ServiceNow
            $operation = [pscustomobject]@{
                Ok = ($stopResult.Ok -and $startResult.Ok)
                OutputTail = @($stopResult.OutputTail, $startResult.OutputTail) | Where-Object { $_ } | Select-Object -First 2 | ForEach-Object { $_ } | Out-String
            }
        }
    }
}

$snapshot = Get-ServiceSnapshot
$serviceStatus = $snapshot.Status
$logTarget = Get-LogTarget
$skippedForSafety = [bool]($operation.PSObject.Properties["SkippedForSafety"] -and $operation.SkippedForSafety)
$actionOk = if ($skippedForSafety) {
    $true
}
else {
    Test-ServiceActionSucceeded -RequestedAction $Action -StatusObject $serviceStatus
}
$summaryText = if ($operation.PSObject.Properties["PreferredSummary"] -and -not [string]::IsNullOrWhiteSpace([string]$operation.PreferredSummary)) {
    [string]$operation.PreferredSummary
}
elseif ($serviceStatus) {
    $serviceStatus.summary
}
else {
    "Service status is unavailable after the action."
}
$detailsText = if ($operation.PSObject.Properties["PreferredDetails"] -and -not [string]::IsNullOrWhiteSpace([string]$operation.PreferredDetails)) {
    [string]$operation.PreferredDetails
}
elseif (-not $operation.Ok -and -not [string]::IsNullOrWhiteSpace([string]$operation.OutputTail)) {
    [string]$operation.OutputTail
}
elseif ($serviceStatus -and $serviceStatus.details) {
    $serviceStatus.details
}
else {
    [string]$operation.OutputTail
}
$result = [ordered]@{
    ok = [bool]($operation.Ok -and $actionOk)
    service = $Service
    action = $Action
    forceUnsafeAutocadStop = [bool]$ForceUnsafeAutocadStop
    skippedForSafety = $skippedForSafety
    summary = $summaryText
    details = $detailsText
    outputTail = [string]$operation.OutputTail
    status = $serviceStatus
    logTarget = $logTarget
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    $statusText = if ($result.ok) { "ok" } else { "failed" }
    Write-Host "${Service} ${Action}: $statusText"
    Write-Host $result.summary
    if ($result.details) {
        Write-Host $result.details
    }
}

if ($result.ok) {
    exit 0
}

exit 1

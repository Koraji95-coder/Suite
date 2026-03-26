[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$IncludeFrontend,
    [switch]$ForceUnsafeAutocadStop,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$autocadSafetyScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-autocad-safety.ps1")).Path
. $autocadSafetyScript
$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$stopped = [ordered]@{}

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

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        try {
            $rawOutput = & $FilePath @Arguments 2>&1
            $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
            $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
            $outputText = Convert-CommandOutputToText -Output $rawOutput
            return [pscustomobject]@{
                ExitCode = $exitCode
                Ok = ($exitCode -eq 0)
                OutputText = $outputText
                OutputTail = Get-OutputTail -Text $outputText
            }
        }
        catch {
            $outputText = $_.Exception.Message
            return [pscustomobject]@{
                ExitCode = 1
                Ok = $false
                OutputText = $outputText
                OutputTail = Get-OutputTail -Text $outputText
            }
        }
    }
    finally {
        Pop-Location
    }
}

function Test-PortListening {
    param([int]$Port)

    return ($null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1))
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

function Set-StoppedEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [int]$Count = 0,
        [int[]]$ProcessIds = @(),
        [ValidateSet("stopped", "already_stopped", "skipped_for_safety")][string]$Status = "stopped",
        [string]$Reason
    )

    $stopped[$Label] = [pscustomobject]@{
        count = $Count
        processIds = @($ProcessIds)
        status = $Status
        reason = if ([string]::IsNullOrWhiteSpace($Reason)) { $null } else { $Reason }
    }
}

function Get-StopStateLabel {
    param([string]$Status)

    switch ($Status) {
        "stopped" { return "stopped" }
        "already_stopped" { return "already stopped" }
        "skipped_for_safety" { return "skipped for safety" }
        default { return $Status }
    }
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

function Stop-PortListeners {
    param(
        [Parameter(Mandatory = $true)][int[]]$Ports,
        [Parameter(Mandatory = $true)][string]$Label
    )

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
                $errors.Add("$Label process $processId could not be stopped: $($_.Exception.Message)")
            }
        }
    }

    Set-StoppedEntry `
        -Label $Label `
        -Count $stoppedIds.Count `
        -ProcessIds $stoppedIds.ToArray() `
        -Status $(if ($stoppedIds.Count -gt 0) { "stopped" } else { "already_stopped" })
}

function Stop-ProcessesByCommandTokens {
    param(
        [Parameter(Mandatory = $true)][string[]]$Tokens,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $stoppedIds = New-Object System.Collections.Generic.List[int]
    $processes = @(Get-ProcessesByCommandTokens -Tokens $Tokens)

    foreach ($process in $processes) {
        $processId = [int]$process.ProcessId
        if ($stoppedIds.Contains($processId)) {
            continue
        }

        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            $stoppedIds.Add($processId)
        }
        catch {
            $errors.Add("$Label process $processId could not be stopped: $($_.Exception.Message)")
        }
    }

    Set-StoppedEntry `
        -Label $Label `
        -Count $stoppedIds.Count `
        -ProcessIds $stoppedIds.ToArray() `
        -Status $(if ($stoppedIds.Count -gt 0) { "stopped" } else { "already_stopped" })
}

Stop-ProcessesByCommandTokens -Tokens @("backend/api_server.py") -Label "backend"
Stop-ProcessesByCommandTokens -Tokens @("run-agent-gateway.mjs") -Label "gateway-launcher"
Stop-ProcessesByCommandTokens -Tokens @("suite-agent-gateway.mjs") -Label "gateway-native-launcher"
Stop-PortListeners -Ports @(5000, 3000) -Label "ports"
Stop-ProcessesByCommandTokens -Tokens @("watchdog-filesystem-collector-daemon.ps1") -Label "watchdog-filesystem-daemon"
Stop-ProcessesByCommandTokens -Tokens @("run-watchdog-filesystem-collector.py") -Label "watchdog-filesystem-worker"

$autocadStopTargets = @(
    [pscustomobject]@{ Label = "watchdog-autocad-daemon"; Tokens = @("watchdog-autocad-collector-daemon.ps1") },
    [pscustomobject]@{ Label = "watchdog-autocad-worker"; Tokens = @("run-watchdog-autocad-state-collector.py") },
    [pscustomobject]@{ Label = "autocad-pipe-bridge"; Tokens = @("namedpipeserver", "suite_autocad_pipe") }
)

$autocadTargetsPresent = $false
foreach ($target in $autocadStopTargets) {
    if (@(Get-ProcessesByCommandTokens -Tokens $target.Tokens).Count -gt 0) {
        $autocadTargetsPresent = $true
        break
    }
}

if ($autocadTargetsPresent -and -not $ForceUnsafeAutocadStop) {
    $autocadSafety = Get-SuiteRuntimeAutoCadStopSafety
    if ($autocadSafety.shouldSkipStop) {
        $autocadWarning = "AutoCAD-related shutdown was skipped for safety. $($autocadSafety.reason)"
        if (-not $warnings.Contains($autocadWarning)) {
            $warnings.Add($autocadWarning)
        }

        foreach ($target in $autocadStopTargets) {
            Set-StoppedEntry -Label $target.Label -Status "skipped_for_safety" -Reason $autocadWarning
        }
    }
    else {
        foreach ($target in $autocadStopTargets) {
            Stop-ProcessesByCommandTokens -Tokens $target.Tokens -Label $target.Label
        }
    }
}
else {
    foreach ($target in $autocadStopTargets) {
        Stop-ProcessesByCommandTokens -Tokens $target.Tokens -Label $target.Label
    }
}

if ($IncludeFrontend) {
    Stop-ProcessesByCommandTokens -Tokens @("run-suite-frontend-dev.ps1", "-frontendlogpath") -Label "frontend-worker"
    Stop-PortListeners -Ports @(5173) -Label "frontend"
}

$supabaseStop = Invoke-ExternalCommand -FilePath "node" -Arguments @((Join-Path $resolvedRepoRoot "scripts\run-supabase-cli.mjs"), "stop") -WorkingDirectory $resolvedRepoRoot
$supabaseAlreadyStopped = ($supabaseStop.OutputText -match "(?im)\bno containers to stop\b")
$supabaseOk = $supabaseStop.Ok -or $supabaseAlreadyStopped
if (-not $supabaseOk) {
    $supabaseOk = Test-SupabaseStopped
}
if (-not $supabaseOk) {
    $errors.Add("Supabase stop failed: $($supabaseStop.OutputTail)")
}

$supabaseStatus = if ($supabaseOk) {
    if ($supabaseAlreadyStopped) { "already_stopped" } else { "stopped" }
}
else {
    "error"
}

$anyStopped = (@($stopped.Values | Where-Object { $_.status -eq "stopped" }).Count -gt 0) -or ($supabaseStatus -eq "stopped")
$anySkipped = @($stopped.Values | Where-Object { $_.status -eq "skipped_for_safety" }).Count -gt 0
$summary = if ($errors.Count -gt 0) {
    "Runtime stop needs attention."
}
elseif ($anySkipped) {
    "Runtime services stopped with AutoCAD safety skips."
}
elseif ($anyStopped) {
    "Runtime services stopped."
}
else {
    "Runtime services are already stopped."
}

$result = [ordered]@{
    ok = ($errors.Count -eq 0)
    summary = $summary
    repoRoot = $resolvedRepoRoot
    includeFrontend = [bool]$IncludeFrontend
    forceUnsafeAutocadStop = [bool]$ForceUnsafeAutocadStop
    stopped = $stopped
    supabase = [ordered]@{
        ok = $supabaseOk
        status = $supabaseStatus
        outputTail = $supabaseStop.OutputTail
    }
    warnings = @($warnings.ToArray())
    errors = @($errors.ToArray())
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Suite runtime stop: $(if ($result.ok) { 'ok' } else { 'needs_attention' })"
    Write-Host $result.summary
    foreach ($entry in $stopped.GetEnumerator()) {
        Write-Host "- $($entry.Key): $(Get-StopStateLabel -Status $entry.Value.status)"
        if ($entry.Value.reason) {
            Write-Host "  $($entry.Value.reason)"
        }
    }
    Write-Host "- supabase: $(Get-StopStateLabel -Status $supabaseStatus)"
    if ($supabaseStop.OutputTail) {
        Write-Host "  $($supabaseStop.OutputTail -replace "`r?`n", "`r`n  ")"
    }
    foreach ($warning in $warnings) {
        Write-Host "warning: $warning"
    }
    if ($errors.Count -gt 0) {
        foreach ($errorItem in $errors) {
            Write-Host "error: $errorItem"
        }
    }
}

if ($result.ok) {
    exit 0
}

exit 1

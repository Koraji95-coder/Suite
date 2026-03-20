[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$IncludeFrontend,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$errors = New-Object System.Collections.Generic.List[string]
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

    $stopped[$Label] = [pscustomobject]@{
        count = $stoppedIds.Count
        processIds = @($stoppedIds)
    }
}

function Stop-ProcessesByCommandTokens {
    param(
        [Parameter(Mandatory = $true)][string[]]$Tokens,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $stoppedIds = New-Object System.Collections.Generic.List[int]
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe' OR Name LIKE 'python%' OR Name = 'node.exe' OR Name = 'node'"

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
            $errors.Add("$Label process $processId could not be stopped: $($_.Exception.Message)")
        }
    }

    $stopped[$Label] = [pscustomobject]@{
        count = $stoppedIds.Count
        processIds = @($stoppedIds)
    }
}

Stop-ProcessesByCommandTokens -Tokens @("backend/api_server.py") -Label "backend"
Stop-ProcessesByCommandTokens -Tokens @("run-agent-gateway.mjs") -Label "gateway-launcher"
Stop-ProcessesByCommandTokens -Tokens @("zeroclaw-gateway") -Label "gateway-binary"
Stop-PortListeners -Ports @(5000, 3000) -Label "ports"
Stop-ProcessesByCommandTokens -Tokens @("watchdog-filesystem-collector-daemon.ps1") -Label "watchdog-filesystem-daemon"
Stop-ProcessesByCommandTokens -Tokens @("run-watchdog-filesystem-collector.py") -Label "watchdog-filesystem-worker"
Stop-ProcessesByCommandTokens -Tokens @("watchdog-autocad-collector-daemon.ps1") -Label "watchdog-autocad-daemon"
Stop-ProcessesByCommandTokens -Tokens @("run-watchdog-autocad-state-collector.py") -Label "watchdog-autocad-worker"
Stop-ProcessesByCommandTokens -Tokens @("namedpipeserver.dll", "suite_autocad_pipe") -Label "autocad-pipe-bridge"

if ($IncludeFrontend) {
    Stop-ProcessesByCommandTokens -Tokens @("run-suite-frontend-dev.ps1", "-frontendlogpath") -Label "frontend-worker"
    Stop-PortListeners -Ports @(5173) -Label "frontend"
}

$supabaseStop = Invoke-ExternalCommand -FilePath "node" -Arguments @((Join-Path $resolvedRepoRoot "scripts\run-supabase-cli.mjs"), "stop") -WorkingDirectory $resolvedRepoRoot
$supabaseOk = $supabaseStop.Ok -or ($supabaseStop.OutputText -match "(?im)\bno containers to stop\b")
if (-not $supabaseOk) {
    $errors.Add("Supabase stop failed: $($supabaseStop.OutputTail)")
}

$result = [ordered]@{
    ok = ($errors.Count -eq 0)
    repoRoot = $resolvedRepoRoot
    includeFrontend = [bool]$IncludeFrontend
    stopped = $stopped
    supabase = [ordered]@{
        ok = $supabaseOk
        outputTail = $supabaseStop.OutputTail
    }
    errors = @($errors)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Suite runtime stop: $(if ($result.ok) { 'ok' } else { 'needs_attention' })"
    foreach ($entry in $stopped.GetEnumerator()) {
        Write-Host "- $($entry.Key): stopped $($entry.Value.count)"
    }
    Write-Host "- supabase: $(if ($supabaseOk) { 'stopped' } else { 'error' })"
    if ($supabaseStop.OutputTail) {
        Write-Host "  $($supabaseStop.OutputTail -replace "`r?`n", "`r`n  ")"
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

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("supabase", "backend", "gateway", "frontend", "watchdog-filesystem", "watchdog-autocad")]
    [string]$Service,
    [Parameter(Mandatory = $true)]
    [ValidateSet("start", "stop", "restart", "status", "logs")]
    [string]$Action,
    [string]$RepoRoot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$statusScript = (Resolve-Path (Join-Path $PSScriptRoot "get-suite-runtime-status.ps1")).Path
$backendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-backend-startup.ps1")).Path
$gatewayCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-gateway-startup.ps1")).Path
$frontendCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-suite-frontend-startup.ps1")).Path
$filesystemInstallScript = (Resolve-Path (Join-Path $PSScriptRoot "install-watchdog-filesystem-collector-startup.ps1")).Path
$autocadInstallScript = (Resolve-Path (Join-Path $PSScriptRoot "install-watchdog-autocad-collector-startup.ps1")).Path
$runtimeStatusBase = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
elseif ($env:TEMP) {
    $env:TEMP
}
else {
    $env:USERPROFILE
}
$runtimeStatusDir = Join-Path $runtimeStatusBase "Suite\runtime-bootstrap"
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

function Get-OutputTail {
    param(
        [string]$Text,
        [int]$LineCount = 12
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

function Invoke-JsonPowerShellFile {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments
    )

    $result = Invoke-ExternalCommand -FilePath "PowerShell.exe" -Arguments (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath) + $Arguments) -WorkingDirectory $resolvedRepoRoot
    $payload = $null
    if (-not [string]::IsNullOrWhiteSpace($result.OutputText)) {
        try {
            $payload = $result.OutputText | ConvertFrom-Json
        }
        catch {
            $firstBrace = $result.OutputText.IndexOf("{")
            $lastBrace = $result.OutputText.LastIndexOf("}")
            if ($firstBrace -ge 0 -and $lastBrace -gt $firstBrace) {
                $jsonText = $result.OutputText.Substring($firstBrace, ($lastBrace - $firstBrace) + 1)
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
        ExitCode = $result.ExitCode
        Ok = $result.Ok
        OutputText = $result.OutputText
        OutputTail = $result.OutputTail
        Payload = $payload
    }
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

    return @($stoppedIds)
}

function Stop-ProcessesByCommandTokens {
    param([string[]]$Tokens)

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
        }
    }

    return @($stoppedIds)
}

function Stop-ServiceNow {
    switch ($Service) {
        "supabase" {
            return Invoke-ExternalCommand -FilePath "node" -Arguments @((Join-Path $resolvedRepoRoot "scripts\run-supabase-cli.mjs"), "stop") -WorkingDirectory $resolvedRepoRoot
        }
        "backend" {
            $stoppedIds = Stop-ProcessesByCommandTokens -Tokens @("backend/api_server.py")
            Stop-PortListeners -Ports @(5000) | Out-Null
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = "Stopped backend processes: $([string]::Join(', ', $stoppedIds))"
                OutputTail = "Stopped backend processes: $([string]::Join(', ', $stoppedIds))"
            }
        }
        "gateway" {
            $stoppedIds = New-Object System.Collections.Generic.List[int]
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("run-agent-gateway.mjs"))) {
                $stoppedIds.Add([int]$id)
            }
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("zeroclaw-gateway"))) {
                if (-not $stoppedIds.Contains([int]$id)) {
                    $stoppedIds.Add([int]$id)
                }
            }
            Stop-PortListeners -Ports @(3000) | Out-Null
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = "Stopped gateway processes: $([string]::Join(', ', @($stoppedIds)))"
                OutputTail = "Stopped gateway processes: $([string]::Join(', ', @($stoppedIds)))"
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
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = "Stopped frontend processes: $([string]::Join(', ', @($stoppedIds)))"
                OutputTail = "Stopped frontend processes: $([string]::Join(', ', @($stoppedIds)))"
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
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = "Stopped filesystem collector processes: $([string]::Join(', ', @($stoppedIds)))"
                OutputTail = "Stopped filesystem collector processes: $([string]::Join(', ', @($stoppedIds)))"
            }
        }
        "watchdog-autocad" {
            $stoppedIds = New-Object System.Collections.Generic.List[int]
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("watchdog-autocad-collector-daemon.ps1"))) {
                $stoppedIds.Add([int]$id)
            }
            foreach ($id in (Stop-ProcessesByCommandTokens -Tokens @("run-watchdog-autocad-state-collector.py"))) {
                if (-not $stoppedIds.Contains([int]$id)) {
                    $stoppedIds.Add([int]$id)
                }
            }
            return [pscustomobject]@{
                ExitCode = 0
                Ok = $true
                OutputText = "Stopped AutoCAD collector processes: $([string]::Join(', ', @($stoppedIds)))"
                OutputTail = "Stopped AutoCAD collector processes: $([string]::Join(', ', @($stoppedIds)))"
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
        $startResult = Start-ServiceNow
        $operation = [pscustomobject]@{
            Ok = ($stopResult.Ok -and $startResult.Ok)
            OutputTail = @($stopResult.OutputTail, $startResult.OutputTail) | Where-Object { $_ } | Select-Object -First 2 | ForEach-Object { $_ } | Out-String
        }
    }
}

$snapshot = Get-ServiceSnapshot
$serviceStatus = $snapshot.Status
$logTarget = Get-LogTarget
$actionOk = Test-ServiceActionSucceeded -RequestedAction $Action -StatusObject $serviceStatus
$summaryText = if ($serviceStatus) {
    $serviceStatus.summary
}
else {
    "Service status is unavailable after the action."
}
$detailsText = if ($serviceStatus -and $serviceStatus.details) {
    $serviceStatus.details
}
else {
    [string]$operation.OutputTail
}
$result = [ordered]@{
    ok = [bool]($operation.Ok -and $actionOk)
    service = $Service
    action = $Action
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

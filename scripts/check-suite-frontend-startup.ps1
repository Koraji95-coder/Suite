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
$workerScriptPath = (Resolve-Path (Join-Path $PSScriptRoot "run-suite-frontend-dev.ps1")).Path
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
$frontendLogPath = Join-Path $runtimeStatusDir "frontend.log"
$bootstrapLogPath = Join-Path $runtimeStatusDir "bootstrap.log"
$frontendUrl = "http://127.0.0.1:5173"

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
    try {
        $response = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    }
    catch {
        return $false
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
    Start-Process `
        -FilePath "PowerShell.exe" `
        -WorkingDirectory $resolvedRepoRoot `
        -WindowStyle Hidden `
        -ArgumentList @(
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
$listeningProcess = Get-ListeningFrontendProcess
$listening = $null -ne $listeningProcess
$healthy = $listening -or (Test-FrontendHealth)
$running = $healthy -or $listening -or $null -ne $workerProcess
$startAttempted = $false
$errorMessage = $null

if (-not $running -and $StartIfMissing) {
    $npmExecutable = Resolve-NpmExecutable
    if (-not $npmExecutable) {
        $errorMessage = "npm is not available on PATH."
    }
    else {
        $startAttempted = $true
        try {
            Start-FrontendWorker
            $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
            do {
                Start-Sleep -Seconds 2
                $listeningProcess = Get-ListeningFrontendProcess
                $workerProcess = if ($listeningProcess) { $null } else { Get-FrontendWorkerProcess }
                $listening = $null -ne $listeningProcess
                $healthy = $listening -or (Test-FrontendHealth)
                $running = $healthy -or $listening -or $null -ne $workerProcess
            } while ((Get-Date) -lt $deadline -and -not $healthy -and $running)
        }
        catch {
            $errorMessage = $_.Exception.Message
        }
    }
}

if (-not $listeningProcess) {
    $listeningProcess = Get-ListeningFrontendProcess
}
if (-not $workerProcess -and -not $listeningProcess) {
    $workerProcess = Get-FrontendWorkerProcess
}
if (-not $healthy) {
    $healthy = $listening -or (Test-FrontendHealth)
}
$listening = $null -ne $listeningProcess
$running = $healthy -or $listening -or $null -ne $workerProcess
$process = if ($listeningProcess) { $listeningProcess } else { $workerProcess }

if (-not $healthy -and [string]::IsNullOrWhiteSpace($errorMessage)) {
    if (-not $running) {
        $errorMessage = "Frontend dev server is not running."
    }
    elseif ($startAttempted) {
        $errorMessage = "Frontend start attempted but the Vite server did not become ready within $StartupTimeoutSeconds seconds."
    }
    else {
        $errorMessage = "Frontend process is running but the dev server is not ready."
    }
}

$result = [pscustomobject]@{
    Url = $frontendUrl
    Port = 5173
    Running = $running
    Listening = $listening
    Healthy = $healthy
    ProcessId = if ($process) { $process.ProcessId } else { $null }
    CommandLine = if ($process) { $process.CommandLine } else { $null }
    StartAttempted = $startAttempted
    Error = $errorMessage
    LogPath = $frontendLogPath
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
}
else {
    Write-Host "Frontend startup healthy: $($result.Healthy)"
    Write-Host "Listening: $($result.Listening)"
    Write-Host "Process ID: $($result.ProcessId)"
    Write-Host "URL: $($result.Url)"
    Write-Host "Log path: $($result.LogPath)"
    if ($result.CommandLine) {
        Write-Host "Command: $($result.CommandLine)"
    }
    if ($result.StartAttempted) {
        Write-Host "Start requested via the Suite frontend worker."
    }
    if ($result.Error) {
        Write-Host "Error: $($result.Error)"
    }
}

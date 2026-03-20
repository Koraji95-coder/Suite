[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$BindHost = "127.0.0.1",
    [ValidateRange(1, 65535)][int]$Port = 5173,
    [string]$FrontendLogPath,
    [string]$BootstrapLogPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
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
if ([string]::IsNullOrWhiteSpace($FrontendLogPath)) {
    $FrontendLogPath = Join-Path $runtimeStatusDir "frontend.log"
}
if ([string]::IsNullOrWhiteSpace($BootstrapLogPath)) {
    $BootstrapLogPath = Join-Path $runtimeStatusDir "bootstrap.log"
}

New-Item -ItemType Directory -Path (Split-Path -Parent $FrontendLogPath) -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $BootstrapLogPath) -Force | Out-Null

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

function Strip-AnsiCodes {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $withoutAnsi = [Regex]::Replace($Text, "\x1B\[[0-9;?]*[ -/]*[@-~]", "")
    return [Regex]::Replace($withoutAnsi, "[^\u0009\u000A\u000D\u0020-\u007E]", "").TrimEnd()
}

function Write-FrontendLogLine {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("INFO", "WARN", "ERR", "START", "OK")][string]$Tag = "INFO"
    )

    $timestamp = (Get-Date).ToString("o")
    $sanitized = Strip-AnsiCodes -Text $Message
    if ([string]::IsNullOrWhiteSpace($sanitized)) {
        return
    }

    Add-Content -Path $FrontendLogPath -Value "[$timestamp] $sanitized"
    Add-Content -Path $BootstrapLogPath -Value "[$timestamp] [$Tag] frontend: $sanitized"
}

function Resolve-FrontendLogTag {
    param([string]$Text)

    $normalized = [string](Strip-AnsiCodes -Text $Text)
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return "INFO"
    }

    $lowered = $normalized.ToLowerInvariant()
    if ($lowered.Contains("error") -or $lowered.Contains("failed")) {
        return "ERR"
    }
    if ($lowered.Contains("warn")) {
        return "WARN"
    }
    if ($lowered.Contains("ready in") -or $lowered.Contains("local:") -or $lowered.Contains("network:")) {
        return "OK"
    }

    return "INFO"
}

$npmExecutable = Resolve-NpmExecutable
if (-not $npmExecutable) {
    throw "npm is not available on PATH."
}

$commandArgs = @("run", "dev", "--", "--host", $BindHost, "--port", [string]$Port, "--strictPort")

Write-FrontendLogLine -Tag "START" -Message "Launching Suite frontend dev server."
Write-FrontendLogLine -Tag "INFO" -Message ("Command: {0} {1}" -f $npmExecutable, ([string]::Join(" ", $commandArgs)))

Push-Location $resolvedRepoRoot
try {
    & $npmExecutable @commandArgs 2>&1 | ForEach-Object {
        if ($null -eq $_) {
            return
        }

        $text = $_.ToString()
        if ([string]::IsNullOrWhiteSpace($text)) {
            return
        }

        Write-FrontendLogLine -Tag (Resolve-FrontendLogTag -Text $text) -Message $text
    }

    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
    if ($exitCode -eq 0) {
        Write-FrontendLogLine -Tag "WARN" -Message "Frontend worker exited."
    }
    else {
        Write-FrontendLogLine -Tag "ERR" -Message "Frontend worker exited with code $exitCode."
    }
}
finally {
    Pop-Location
}

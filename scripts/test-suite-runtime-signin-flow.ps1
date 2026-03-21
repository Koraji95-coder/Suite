[CmdletBinding()]
param(
    [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
$launcherScript = (Resolve-Path (Join-Path $PSScriptRoot "launch-suite-runtime-control.ps1")).Path

. $processUtilsScript

Start-SuiteDetachedProcess `
    -FilePath "PowerShell.exe" `
    -WorkingDirectory $resolvedRepoRoot `
    -Arguments @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $launcherScript,
        "-AutoBootstrap"
    ) | Out-Null

Write-Host "Started Suite Runtime Control in auto-bootstrap mode."

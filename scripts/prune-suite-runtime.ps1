[CmdletBinding()]
param(
    [string]$BaseDirectory,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$retentionScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-retention.ps1")).Path
. $retentionScript

$result = Invoke-SuiteRuntimeArtifactRetention -BaseDirectory $BaseDirectory

if ($Json) {
    $result | ConvertTo-Json -Depth 10
    exit 0
}

$trimmedLogs = @($result.LogResults | Where-Object { $_.Trimmed })
$removedStageDirectories = @($result.RemovedStageDirectories)

Write-Host "Suite runtime prune: ok"
Write-Host "- bootstrap dir: $($result.RuntimeBootstrapDirectory)"
Write-Host "- control dir: $($result.RuntimeControlDirectory)"
Write-Host "- logs trimmed: $($trimmedLogs.Count)"
Write-Host "- staged builds removed: $($removedStageDirectories.Count)"

foreach ($entry in $trimmedLogs) {
    Write-Host "  trimmed: $($entry.Path) -> kept $($entry.KeptLines) lines"
}

foreach ($entry in $removedStageDirectories) {
    Write-Host "  removed: $entry"
}

foreach ($warning in @($result.Warnings)) {
    Write-Warning $warning
}

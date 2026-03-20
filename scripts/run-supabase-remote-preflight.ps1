[CmdletBinding()]
param(
    [switch]$NotifyOnFailure,
    [switch]$SilentSuccess
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $repoRoot
try {
    $arguments = @(
        "scripts/run-supabase-remote-workflow.mjs",
        "preflight"
    )
    if ($NotifyOnFailure) {
        $arguments += "--notify-on-failure"
    }
    if ($SilentSuccess) {
        $arguments += "--silent-success"
    }

    & node @arguments
    if ($LASTEXITCODE -is [int]) {
        exit $LASTEXITCODE
    }
    exit 0
}
finally {
    Pop-Location
}

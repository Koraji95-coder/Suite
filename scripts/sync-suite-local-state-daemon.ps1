[CmdletBinding()]
param(
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror"),
    [ValidateRange(5, 1440)][int]$IntervalMinutes = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

$syncScript = (Resolve-Path (Join-Path $PSScriptRoot "sync-suite-local-state.ps1")).Path
$mutex = New-Object System.Threading.Mutex($false, "Local\SuiteLocalStateMirrorDaemon")
$hasHandle = $false

try {
    $hasHandle = $mutex.WaitOne(0, $false)
    if (-not $hasHandle) {
        Write-Host "SuiteLocalStateMirror daemon is already running."
        exit 0
    }

    while ($true) {
        try {
            & $syncScript -MirrorRoot $MirrorRoot
        }
        catch {
            Ensure-Directory -Path $MirrorRoot
            $logPath = Join-Path $MirrorRoot "daemon-errors.log"
            $message = "{0} {1}" -f (Get-Date -Format o), $_.Exception.Message
            Add-Content -LiteralPath $logPath -Value $message -Encoding UTF8
        }

        Start-Sleep -Seconds ($IntervalMinutes * 60)
    }
}
finally {
    if ($hasHandle) {
        $mutex.ReleaseMutex() | Out-Null
    }

    $mutex.Dispose()
}

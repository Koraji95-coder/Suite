[CmdletBinding()]
param(
    [string]$RepoRoot,
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

$runtimeStatusScript = (Resolve-Path (Join-Path $PSScriptRoot "get-suite-runtime-status.ps1")).Path
$runtimePaths = Get-SuiteRuntimePaths
$statusBase = $runtimePaths.StatusBase
$roamingBase = Get-SuiteRoamingBasePath
$supportRoot = $runtimePaths.SupportRoot
$timestampToken = (Get-Date).ToString("yyyyMMdd-HHmmss")
$bundleName = "suite-support-$timestampToken"
$bundleDir = Join-Path $supportRoot $bundleName
$archivePath = Join-Path $supportRoot "$bundleName.zip"

New-Item -ItemType Directory -Path $supportRoot -Force | Out-Null
if (Test-Path -LiteralPath $bundleDir) {
    Remove-Item -LiteralPath $bundleDir -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

$entries = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-BundleEntryRecord {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Kind,
        [Parameter(Mandatory = $true)][string]$State,
        [string]$SourcePath,
        [string]$BundlePath,
        [string]$Detail
    )

    $entries.Add([pscustomobject]@{
        label = $Label
        kind = $Kind
        state = $State
        sourcePath = if ([string]::IsNullOrWhiteSpace($SourcePath)) { $null } else { $SourcePath }
        bundlePath = if ([string]::IsNullOrWhiteSpace($BundlePath)) { $null } else { $BundlePath }
        detail = if ([string]::IsNullOrWhiteSpace($Detail)) { $null } else { $Detail }
    })
}

function Add-WarningRecord {
    param([string]$Message)

    if (-not [string]::IsNullOrWhiteSpace($Message)) {
        $warnings.Add($Message)
    }
}

function Copy-PathIntoBundle {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$BundleRelativePath
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        Add-BundleEntryRecord -Label $Label -Kind "path" -State "missing" -SourcePath $SourcePath -BundlePath $BundleRelativePath -Detail "Source path was not present."
        return
    }

    $bundlePath = Join-Path $bundleDir $BundleRelativePath
    $bundleParent = Split-Path -Parent $bundlePath
    if (-not [string]::IsNullOrWhiteSpace($bundleParent)) {
        New-Item -ItemType Directory -Path $bundleParent -Force | Out-Null
    }

    try {
        Copy-Item -LiteralPath $SourcePath -Destination $bundlePath -Recurse -Force
        $item = Get-Item -LiteralPath $SourcePath -ErrorAction Stop
        $kind = if ($item.PSIsContainer) { "directory" } else { "file" }
        Add-BundleEntryRecord -Label $Label -Kind $kind -State "included" -SourcePath $SourcePath -BundlePath $BundleRelativePath -Detail "Copied into support bundle."
    }
    catch {
        Add-WarningRecord -Message ("{0}: {1}" -f $Label, $_.Exception.Message)
        Add-BundleEntryRecord -Label $Label -Kind "path" -State "error" -SourcePath $SourcePath -BundlePath $BundleRelativePath -Detail $_.Exception.Message
    }
}

function Write-BundleTextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$BundleRelativePath,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $bundlePath = Join-Path $bundleDir $BundleRelativePath
    $bundleParent = Split-Path -Parent $bundlePath
    if (-not [string]::IsNullOrWhiteSpace($bundleParent)) {
        New-Item -ItemType Directory -Path $bundleParent -Force | Out-Null
    }

    Set-Content -LiteralPath $bundlePath -Value $Content -Encoding UTF8
    Add-BundleEntryRecord -Label $Label -Kind "generated-file" -State "included" -SourcePath "" -BundlePath $BundleRelativePath -Detail "Generated for this support bundle."
}

function Invoke-RuntimeStatusCapture {
    try {
        $rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $runtimeStatusScript -RepoRoot $resolvedRepoRoot -Json 2>&1
        $outputText = [string]::Join(
            [Environment]::NewLine,
            @(
                $rawOutput | ForEach-Object {
                    if ($null -eq $_) { "" } else { $_.ToString() }
                }
            )
        ).Trim()

        if ([string]::IsNullOrWhiteSpace($outputText)) {
            throw "Runtime status script returned no output."
        }

        $jsonText = $outputText
        try {
            $null = $jsonText | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            $firstBrace = $outputText.IndexOf("{")
            $lastBrace = $outputText.LastIndexOf("}")
            if ($firstBrace -lt 0 -or $lastBrace -le $firstBrace) {
                throw "Runtime status output did not contain JSON."
            }

            $jsonText = $outputText.Substring($firstBrace, ($lastBrace - $firstBrace) + 1)
            $null = $jsonText | ConvertFrom-Json -ErrorAction Stop
        }

        return $jsonText
    }
    catch {
        Add-WarningRecord -Message ("Runtime status capture failed: {0}" -f $_.Exception.Message)
        return $null
    }
}

$runtimeStatusJson = Invoke-RuntimeStatusCapture
$runtimeStatusObject = $null
if (-not [string]::IsNullOrWhiteSpace($runtimeStatusJson)) {
    Write-BundleTextFile -Label "Runtime status JSON" -BundleRelativePath "runtime\runtime-status.json" -Content $runtimeStatusJson
    try {
        $runtimeStatusObject = $runtimeStatusJson | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        $runtimeStatusObject = $null
    }
}

if ($runtimeStatusObject -and $runtimeStatusObject.doctor) {
    Write-BundleTextFile -Label "Doctor report JSON" -BundleRelativePath "runtime\doctor-report.json" -Content ($runtimeStatusObject.doctor | ConvertTo-Json -Depth 8)
}

if ($runtimeStatusObject -and $runtimeStatusObject.support) {
    Write-BundleTextFile -Label "Support summary JSON" -BundleRelativePath "runtime\support-summary.json" -Content ($runtimeStatusObject.support | ConvertTo-Json -Depth 8)

    if ($runtimeStatusObject.support.workstation) {
        Write-BundleTextFile -Label "Workstation identity" -BundleRelativePath "runtime\workstation-identity.json" -Content ($runtimeStatusObject.support.workstation | ConvertTo-Json -Depth 6)
    }

    if ($runtimeStatusObject.support.config) {
        Write-BundleTextFile -Label "Config snapshot" -BundleRelativePath "runtime\config-snapshot.json" -Content ($runtimeStatusObject.support.config | ConvertTo-Json -Depth 8)
    }

    if ($runtimeStatusObject.support.paths) {
        Write-BundleTextFile -Label "Runtime path snapshot" -BundleRelativePath "runtime\path-snapshot.json" -Content ($runtimeStatusObject.support.paths | ConvertTo-Json -Depth 6)
    }
}

$runtimeSummaryLines = New-Object System.Collections.Generic.List[string]
$runtimeSummaryLines.Add("Suite Support Bundle Summary")
$runtimeSummaryLines.Add(("Generated: {0}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")))
$runtimeSummaryLines.Add(("Repo root: {0}" -f $resolvedRepoRoot))
$runtimeSummaryLines.Add(("Bundle directory: {0}" -f $bundleDir))
$runtimeSummaryLines.Add(("Archive path: {0}" -f $archivePath))

if ($runtimeStatusObject) {
    $sharedSupportSummary = if ($runtimeStatusObject.support -and $runtimeStatusObject.support.lines) {
        @($runtimeStatusObject.support.lines)
    }
    else {
        @(Convert-ToSuiteSupportSummaryLines -RuntimeStatus $runtimeStatusObject -RepoRoot $resolvedRepoRoot)
    }

    if ($sharedSupportSummary.Count -gt 0) {
        $runtimeSummaryLines.Add("")
        foreach ($line in $sharedSupportSummary) {
            if (-not [string]::IsNullOrWhiteSpace([string]$line)) {
                $runtimeSummaryLines.Add([string]$line)
            }
        }
    }
}

$runtimeBootstrapDir = Join-Path $statusBase "Suite\runtime-bootstrap"
$watchdogLedgerPath = Join-Path $statusBase "Suite\watchdog\watchdog.sqlite3"
$watchdogAutoCadCollectorDir = Join-Path $statusBase "Suite\watchdog-autocad-collector"
$cadCommandCenterDir = Join-Path $roamingBase "CadCommandCenter"
$trackerPluginLogPath = Join-Path $cadCommandCenterDir "tracker-plugin.log"
$trackerStatePath = Join-Path $cadCommandCenterDir "tracker-state.json"
$autodeskPluginBundleDir = Join-Path $roamingBase "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
$autodeskPluginManifestPath = Join-Path $autodeskPluginBundleDir "PackageContents.xml"
$runtimeShellLogPath = Join-Path $runtimeBootstrapDir "runtime-shell.log"

Copy-PathIntoBundle -Label "Runtime bootstrap directory" -SourcePath $runtimeBootstrapDir -BundleRelativePath "runtime\runtime-bootstrap"
Copy-PathIntoBundle -Label "Runtime shell log" -SourcePath $runtimeShellLogPath -BundleRelativePath "runtime\runtime-shell.log"
Copy-PathIntoBundle -Label "Watchdog ledger" -SourcePath $watchdogLedgerPath -BundleRelativePath "watchdog\watchdog.sqlite3"
Copy-PathIntoBundle -Label "Watchdog AutoCAD collector" -SourcePath $watchdogAutoCadCollectorDir -BundleRelativePath "watchdog\watchdog-autocad-collector"
Copy-PathIntoBundle -Label "CAD command center log" -SourcePath $trackerPluginLogPath -BundleRelativePath "watchdog\cad-command-center\tracker-plugin.log"
Copy-PathIntoBundle -Label "CAD tracker snapshot" -SourcePath $trackerStatePath -BundleRelativePath "watchdog\cad-command-center\tracker-state.json"
Copy-PathIntoBundle -Label "AutoCAD plugin manifest" -SourcePath $autodeskPluginManifestPath -BundleRelativePath "watchdog\SuiteWatchdogCadTracker.bundle\PackageContents.xml"

$environmentSummary = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    machineName = $env:COMPUTERNAME
    userName = $env:USERNAME
    repoRoot = $resolvedRepoRoot
    statusBase = $statusBase
    roamingBase = $roamingBase
}
Write-BundleTextFile -Label "Environment summary" -BundleRelativePath "runtime\environment.json" -Content ($environmentSummary | ConvertTo-Json -Depth 5)
Write-BundleTextFile -Label "Support summary" -BundleRelativePath "runtime\support-summary.txt" -Content ([string]::Join([Environment]::NewLine, $runtimeSummaryLines))

$entryArray = [object[]]$entries.ToArray()
$warningArray = [string[]]$warnings.ToArray()

$manifest = [ordered]@{
    schemaVersion = "suite.support-bundle.v1"
    generatedAt = (Get-Date).ToString("o")
    repoRoot = $resolvedRepoRoot
    bundleName = $bundleName
    bundleDirectory = $bundleDir
    archivePath = $archivePath
    entries = $entryArray
    warnings = $warningArray
}
Write-BundleTextFile -Label "Bundle manifest" -BundleRelativePath "bundle-manifest.json" -Content ($manifest | ConvertTo-Json -Depth 8)

try {
    Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $archivePath -Force
}
catch {
    Add-WarningRecord -Message ("Bundle archive creation failed: {0}" -f $_.Exception.Message)
}

$result = [ordered]@{
    ok = (Test-Path -LiteralPath $archivePath)
    generatedAt = (Get-Date).ToString("o")
    bundleName = $bundleName
    bundleDir = $bundleDir
    archivePath = if (Test-Path -LiteralPath $archivePath) { $archivePath } else { $null }
    entryCount = $entryArray.Count
    warningCount = $warningArray.Count
    entries = $entryArray
    warnings = $warningArray
    summary = if (Test-Path -LiteralPath $archivePath) {
        "Support bundle exported."
    }
    else {
        "Support bundle export completed with warnings."
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host $result.summary
    Write-Host ("Bundle directory: {0}" -f $bundleDir)
    if ($result.archivePath) {
        Write-Host ("Archive: {0}" -f $result.archivePath)
    }
    foreach ($warning in @($warnings)) {
        Write-Warning $warning
    }
}

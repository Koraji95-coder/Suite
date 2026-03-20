[CmdletBinding()]
param(
    [string]$ProjectPath,
    [ValidateSet("Debug", "Release")][string]$Configuration = "Debug",
    [string]$AutoCadVersion,
    [string]$AutoCadInstallDir,
    [string]$BundleRoot,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $ProjectPath) {
    $ProjectPath = Join-Path $repoRoot "dotnet\watchdog-cad-tracker\WatchdogCadTracker.csproj"
}
$ProjectPath = (Resolve-Path $ProjectPath).Path
$projectDir = Split-Path -Parent $ProjectPath
$packageProductCode = "{E2F5A7D0-2A43-4A5C-9AA2-1F6B5D889A11}"
$packageUpgradeCode = "{38ED5D1A-8A7A-4D47-B927-4A5C4B0F67C2}"

function Resolve-AutoCadInstallDir {
    param(
        [string]$ExplicitInstallDir,
        [string]$VersionHint
    )

    $candidates = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($ExplicitInstallDir)) {
        $candidates.Add($ExplicitInstallDir)
    }
    if (-not [string]::IsNullOrWhiteSpace($env:AUTOCAD_INSTALL_DIR)) {
        $candidates.Add($env:AUTOCAD_INSTALL_DIR)
    }
    if (-not [string]::IsNullOrWhiteSpace($VersionHint)) {
        $candidates.Add("C:\Program Files\Autodesk\AutoCAD $VersionHint")
    }
    $candidates.Add("C:\Program Files\Autodesk\AutoCAD 2026")
    $candidates.Add("C:\Program Files\Autodesk\AutoCAD 2025")
    $candidates.Add("C:\Program Files\Autodesk\AutoCAD 2024")
    $candidates.Add("C:\Program Files\Autodesk\AutoCAD 2023")
    $candidates.Add("C:\Program Files\Autodesk\AutoCAD 2022")

    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }
        $normalized = [System.IO.Path]::GetFullPath($candidate)
        if (Test-Path (Join-Path $normalized "accoremgd.dll")) {
            return $normalized
        }
    }

    throw "Unable to locate AutoCAD managed DLLs. Set AutoCadInstallDir or AUTOCAD_INSTALL_DIR."
}

function Resolve-TargetFramework {
    param([string]$VersionText)

    $versionNumber = 2026
    if (-not [string]::IsNullOrWhiteSpace($VersionText)) {
        $parsed = 0
        if ([int]::TryParse($VersionText, [ref]$parsed)) {
            $versionNumber = $parsed
        }
    }
    if ($versionNumber -ge 2025) {
        return "net8.0-windows"
    }
    return "net48"
}

function Resolve-AutoCadSeries {
    param([string]$VersionText)

    switch ($VersionText) {
        "2026" { return "R25.1" }
        "2025" { return "R25.0" }
        default { return $null }
    }
}

function Get-CandidateBundleRoots {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:ProgramFiles) {
        $candidates.Add((Join-Path $env:ProgramFiles "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates.Add((Join-Path ${env:ProgramFiles(x86)} "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if ($env:APPDATA) {
        $candidates.Add((Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if ($env:ProgramData) {
        $candidates.Add((Join-Path $env:ProgramData "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if ($env:ALLUSERSPROFILE) {
        $candidates.Add((Join-Path $env:ALLUSERSPROFILE "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if ($env:USERPROFILE) {
        $candidates.Add((Join-Path $env:USERPROFILE "AppData\Roaming\Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }

    return @(
        $candidates |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            ForEach-Object { [System.IO.Path]::GetFullPath($_) } |
            Select-Object -Unique
    )
}

function Get-RunningAutoCadProcessSummary {
    $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -match "^acad$|^autocad$"
    }
    if (-not $processes) {
        return $null
    }

    return ($processes | ForEach-Object {
        "$($_.ProcessName) ($($_.Id))"
    }) -join ", "
}

function Test-DirectoryWriteAccess {
    param([string]$DirectoryPath)

    if ([string]::IsNullOrWhiteSpace($DirectoryPath)) {
        return $false
    }

    try {
        $null = New-Item -ItemType Directory -Path $DirectoryPath -Force
        $probePath = Join-Path $DirectoryPath (".suite-write-test-" + [Guid]::NewGuid().ToString("N") + ".tmp")
        Set-Content -Path $probePath -Value "ok" -Encoding ASCII
        Remove-Item -Path $probePath -Force
        return $true
    }
    catch {
        return $false
    }
}

function Get-DefaultBundleRoot {
    $candidates = Get-CandidateBundleRoots
    foreach ($candidate in $candidates) {
        $parentPath = Split-Path -Parent $candidate
        if (Test-DirectoryWriteAccess -DirectoryPath $parentPath) {
            return $candidate
        }
    }

    if ($candidates.Count -gt 0) {
        return $candidates[0]
    }

    return Join-Path $env:USERPROFILE "AppData\Roaming\Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
}

function Get-AutoCadTrustedBundlePaths {
    param([string]$ResolvedBundleRoot)

    $bundleRootPath = [System.IO.Path]::GetFullPath($ResolvedBundleRoot).TrimEnd("\")
    $bundleContentsPath = (Join-Path $bundleRootPath "Contents\Win64").TrimEnd("\")
    return @(
        "$bundleRootPath\..."
        "$bundleContentsPath\..."
    ) | Select-Object -Unique
}

function Get-AutoCadTrustedPathRegistryKeys {
    $registryRoots = New-Object System.Collections.Generic.List[string]
    $autoCadRoot = "HKCU:\Software\Autodesk\AutoCAD"
    if (-not (Test-Path $autoCadRoot)) {
        return @()
    }

    $candidateKeys = Get-ChildItem -Path $autoCadRoot -Recurse -ErrorAction SilentlyContinue | Where-Object {
        $_.PSPath -match "\\Profiles\\[^\\]+\\Variables$" -or
        $_.PSPath -match "\\R[^\\]+\\[^\\]+\\Variables$"
    }
    foreach ($candidateKey in $candidateKeys) {
        $registryRoots.Add($candidateKey.PSPath)
    }

    return @($registryRoots | Select-Object -Unique)
}

function Ensure-AutoCadTrustedPaths {
    param([string]$ResolvedBundleRoot)

    $trustedEntries = Get-AutoCadTrustedBundlePaths -ResolvedBundleRoot $ResolvedBundleRoot
    $updatedKeys = New-Object System.Collections.Generic.List[string]

    foreach ($registryPath in (Get-AutoCadTrustedPathRegistryKeys)) {
        $currentEntries = New-Object System.Collections.Generic.List[string]
        try {
            $currentTrustedPaths = [string](Get-ItemPropertyValue -Path $registryPath -Name TRUSTEDPATHS -ErrorAction Stop)
        }
        catch {
            $currentTrustedPaths = ""
        }

        foreach ($existingEntry in ($currentTrustedPaths -split ";")) {
            $trimmedEntry = $existingEntry.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmedEntry)) {
                continue
            }
            if (-not ($currentEntries.Contains($trimmedEntry))) {
                $currentEntries.Add($trimmedEntry)
            }
        }

        $didChange = $false
        foreach ($trustedEntry in $trustedEntries) {
            $alreadyPresent = $false
            foreach ($currentEntry in $currentEntries) {
                if ([string]::Equals($currentEntry, $trustedEntry, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $alreadyPresent = $true
                    break
                }
            }
            if (-not $alreadyPresent) {
                $currentEntries.Add($trustedEntry)
                $didChange = $true
            }
        }

        if ($didChange) {
            $newValue = [string]::Join(";", @($currentEntries))
            if (Get-ItemProperty -Path $registryPath -Name TRUSTEDPATHS -ErrorAction SilentlyContinue) {
                Set-ItemProperty -Path $registryPath -Name TRUSTEDPATHS -Value $newValue -Force
            }
            else {
                New-ItemProperty -Path $registryPath -Name TRUSTEDPATHS -PropertyType String -Value $newValue -Force | Out-Null
            }
            $updatedKeys.Add($registryPath)
        }
    }

    return [pscustomobject]@{
        trustedEntries = @($trustedEntries)
        updatedRegistryKeys = @($updatedKeys)
    }
}

function Invoke-DotNetBuildWithRetry {
    param(
        [string]$ProjectFilePath,
        [string]$BuildConfiguration,
        [string]$VersionText,
        [string]$InstallDir
    )

    $attempts = 0
    while ($attempts -lt 3) {
        $attempts += 1
        & dotnet build $ProjectFilePath `
            -c $BuildConfiguration `
            -v minimal `
            /p:AutoCadVersion=$VersionText `
            /p:AutoCadInstallDir=$InstallDir
        if ($LASTEXITCODE -eq 0) {
            return
        }
        if ($attempts -ge 3) {
            throw "dotnet build failed for WatchdogCadTracker."
        }
        Start-Sleep -Seconds 3
    }
}

function Invoke-DotNetPublishWithRetry {
    param(
        [string]$ProjectFilePath,
        [string]$BuildConfiguration,
        [string]$VersionText,
        [string]$InstallDir
    )

    $attempts = 0
    while ($attempts -lt 3) {
        $attempts += 1
        & dotnet publish $ProjectFilePath `
            -c $BuildConfiguration `
            -v minimal `
            /p:AutoCadVersion=$VersionText `
            /p:AutoCadInstallDir=$InstallDir
        if ($LASTEXITCODE -eq 0) {
            return
        }
        if ($attempts -ge 3) {
            throw "dotnet publish failed for WatchdogCadTracker."
        }
        Start-Sleep -Seconds 3
    }
}

$resolvedInstallDir = Resolve-AutoCadInstallDir -ExplicitInstallDir $AutoCadInstallDir -VersionHint $AutoCadVersion
if (-not $AutoCadVersion) {
    if ($resolvedInstallDir -match "AutoCAD\s+(\d{4})") {
        $AutoCadVersion = $Matches[1]
    }
    else {
        $AutoCadVersion = "2026"
    }
}
$targetFramework = Resolve-TargetFramework -VersionText $AutoCadVersion
$autoCadSeries = Resolve-AutoCadSeries -VersionText $AutoCadVersion

if (-not $BundleRoot) {
    $BundleRoot = Get-DefaultBundleRoot
}
$BundleRoot = [System.IO.Path]::GetFullPath($BundleRoot)
$bundleContentsDir = Join-Path $BundleRoot "Contents\Win64"
$bundleDllPath = Join-Path $bundleContentsDir "WatchdogCadTracker.dll"
$bundleDepsPath = Join-Path $bundleContentsDir "WatchdogCadTracker.deps.json"
$bundleRuntimeConfigPath = Join-Path $bundleContentsDir "WatchdogCadTracker.runtimeconfig.json"
$bundlePdbPath = Join-Path $bundleContentsDir "WatchdogCadTracker.pdb"
$packageContentsPath = Join-Path $BundleRoot "PackageContents.xml"
$knownAlternateRoots = New-Object System.Collections.Generic.List[string]
foreach ($candidateRoot in (Get-CandidateBundleRoots)) {
    $knownAlternateRoots.Add($candidateRoot)
}

if (-not $SkipBuild) {
    Invoke-DotNetBuildWithRetry `
        -ProjectFilePath $ProjectPath `
        -BuildConfiguration $Configuration `
        -VersionText $AutoCadVersion `
        -InstallDir $resolvedInstallDir

    if ($targetFramework -eq "net8.0-windows") {
        Invoke-DotNetPublishWithRetry `
            -ProjectFilePath $ProjectPath `
            -BuildConfiguration $Configuration `
            -VersionText $AutoCadVersion `
            -InstallDir $resolvedInstallDir
    }
}

$buildOutputDir = Join-Path $projectDir "bin\$Configuration\$targetFramework"
$publishOutputDir = Join-Path $buildOutputDir "publish"
$resolvedOutputDir = if (
    ($targetFramework -eq "net8.0-windows") -and
    (Test-Path $publishOutputDir)
) {
    $publishOutputDir
}
else {
    $buildOutputDir
}
$builtDllPath = Join-Path $resolvedOutputDir "WatchdogCadTracker.dll"
if (-not (Test-Path $builtDllPath)) {
    throw "Built plugin DLL not found at $builtDllPath"
}

$null = New-Item -ItemType Directory -Path $bundleContentsDir -Force
$copiedArtifacts = New-Object System.Collections.Generic.List[string]
$outputFiles = Get-ChildItem -Path $resolvedOutputDir -File
$existingBundleFiles = Get-ChildItem -Path $bundleContentsDir -File -ErrorAction SilentlyContinue

foreach ($existingFile in $existingBundleFiles) {
    if (-not ($outputFiles.Name -contains $existingFile.Name)) {
        Remove-Item -Path $existingFile.FullName -Force
    }
}

foreach ($outputFile in $outputFiles) {
    $destinationPath = Join-Path $bundleContentsDir $outputFile.Name
    try {
        Copy-Item -Path $outputFile.FullName -Destination $destinationPath -Force
    }
    catch [System.IO.IOException] {
        $runningAutoCad = Get-RunningAutoCadProcessSummary
        $processHint = if ($runningAutoCad) {
            " Running AutoCAD process(es): $runningAutoCad."
        }
        else {
            ""
        }
        throw "AutoCAD plugin bundle file is locked at '$destinationPath'. Close AutoCAD, then rerun `npm run watchdog:autocad:plugin:install`.$processHint"
    }
    try {
        Unblock-File -Path $destinationPath -ErrorAction Stop
    }
    catch {
    }
    $copiedArtifacts.Add($destinationPath)
}

$packageContents = @'
<?xml version="1.0" encoding="utf-8"?>
<ApplicationPackage
    SchemaVersion="1.0"
    AutodeskProduct="AutoCAD"
    Name="Suite Watchdog CAD Tracker"
    Description="Suite Watchdog drawing and activity tracker for AutoCAD."
    AppVersion="0.1.0"
    FriendlyVersion="0.1.0"
    ProductType="Application"
    Author="Suite"
    ProductCode="__PRODUCT_CODE__"
    UpgradeCode="__UPGRADE_CODE__">
  <CompanyDetails Name="Suite" Url="local" Email="local" />
  <RuntimeRequirements OS="Win64" Platform="AutoCAD*" __SERIES_REQUIREMENTS__ />
  <Components Description="Suite Watchdog AutoCAD tracker">
    <RuntimeRequirements OS="Win64" Platform="AutoCAD*" __SERIES_REQUIREMENTS__ />
    <ComponentEntry AppName="SuiteWatchdogCadTracker" AppDescription="Suite Watchdog drawing and activity tracker for AutoCAD." AppType=".Net" Version="0.1.0" ModuleName="./Contents/Win64/WatchdogCadTracker.dll" LoadOnAutoCADStartup="True">
      <Commands GroupName="SUITE_WATCHDOG_TRACKER">
        <Command Local="STARTTRACKER" Global="STARTTRACKER" />
        <Command Local="STOPTRACKER" Global="STOPTRACKER" />
        <Command Local="TRACKERSTATUS" Global="TRACKERSTATUS" />
        <Command Local="TRACKEREXPORT" Global="TRACKEREXPORT" />
        <Command Local="TRACKERCONFIG" Global="TRACKERCONFIG" />
      </Commands>
    </ComponentEntry>
  </Components>
</ApplicationPackage>
'@
$seriesRequirements = ""
if (-not [string]::IsNullOrWhiteSpace($autoCadSeries)) {
    $seriesRequirements = "SeriesMin=""$autoCadSeries"" SeriesMax=""$autoCadSeries"""
}
$packageContents = $packageContents.
    Replace("__PRODUCT_CODE__", $packageProductCode).
    Replace("__UPGRADE_CODE__", $packageUpgradeCode).
    Replace("__SERIES_REQUIREMENTS__", $seriesRequirements)
$packageContents | Set-Content -Path $packageContentsPath -Encoding UTF8
try {
    Unblock-File -Path $packageContentsPath -ErrorAction Stop
}
catch {
}

$trustedPathResult = Ensure-AutoCadTrustedPaths -ResolvedBundleRoot $BundleRoot
$skippedAlternateRoots = New-Object System.Collections.Generic.List[string]
foreach ($alternateRoot in $knownAlternateRoots) {
    if (
        -not [string]::IsNullOrWhiteSpace($alternateRoot) -and
        ($alternateRoot -ne $BundleRoot) -and
        (Test-Path $alternateRoot)
    ) {
        try {
            Remove-Item -Path $alternateRoot -Recurse -Force
        }
        catch {
            $skippedAlternateRoots.Add($alternateRoot)
        }
    }
}

[pscustomobject]@{
    ok = $true
    projectPath = $ProjectPath
    autoCadInstallDir = $resolvedInstallDir
    autoCadVersion = $AutoCadVersion
    autoCadSeries = $autoCadSeries
    targetFramework = $targetFramework
    builtDllPath = $builtDllPath
    bundleRoot = $BundleRoot
    bundleDllPath = $bundleDllPath
    bundleDepsPath = $bundleDepsPath
    bundleRuntimeConfigPath = $bundleRuntimeConfigPath
    packageContentsPath = $packageContentsPath
    copiedArtifacts = @($copiedArtifacts)
    trustedPathEntries = @($trustedPathResult.trustedEntries)
    trustedPathRegistryKeys = @($trustedPathResult.updatedRegistryKeys)
    skippedAlternateRoots = @($skippedAlternateRoots)
} | ConvertTo-Json -Depth 4

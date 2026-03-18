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

if (-not $BundleRoot) {
    $BundleRoot = Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
}
$BundleRoot = [System.IO.Path]::GetFullPath($BundleRoot)
$bundleContentsDir = Join-Path $BundleRoot "Contents\Win64"
$bundleDllPath = Join-Path $bundleContentsDir "WatchdogCadTracker.dll"
$packageContentsPath = Join-Path $BundleRoot "PackageContents.xml"

if (-not $SkipBuild) {
    Invoke-DotNetBuildWithRetry `
        -ProjectFilePath $ProjectPath `
        -BuildConfiguration $Configuration `
        -VersionText $AutoCadVersion `
        -InstallDir $resolvedInstallDir
}

$builtDllPath = Join-Path $projectDir "bin\$Configuration\$targetFramework\WatchdogCadTracker.dll"
if (-not (Test-Path $builtDllPath)) {
    throw "Built plugin DLL not found at $builtDllPath"
}

$null = New-Item -ItemType Directory -Path $bundleContentsDir -Force
Copy-Item -Path $builtDllPath -Destination $bundleDllPath -Force

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
    Author="Suite">
  <CompanyDetails Name="Suite" Url="local" Email="local" />
  <Components Description="Suite Watchdog AutoCAD tracker">
    <RuntimeRequirements OS="Win64" Platform="AutoCAD*" />
    <ComponentEntry AppName="SuiteWatchdogCadTracker" Version="0.1.0" ModuleName="./Contents/Win64/WatchdogCadTracker.dll" LoadOnAutoCADStartup="True">
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
$packageContents | Set-Content -Path $packageContentsPath -Encoding UTF8

[pscustomobject]@{
    ok = $true
    projectPath = $ProjectPath
    autoCadInstallDir = $resolvedInstallDir
    autoCadVersion = $AutoCadVersion
    targetFramework = $targetFramework
    builtDllPath = $builtDllPath
    bundleRoot = $BundleRoot
    bundleDllPath = $bundleDllPath
    packageContentsPath = $packageContentsPath
} | ConvertTo-Json -Depth 4

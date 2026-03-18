[CmdletBinding()]
param(
    [string]$BundleRoot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $BundleRoot) {
    $BundleRoot = Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
}
$BundleRoot = [System.IO.Path]::GetFullPath($BundleRoot)
$bundleDllPath = Join-Path $BundleRoot "Contents\Win64\WatchdogCadTracker.dll"
$packageContentsPath = Join-Path $BundleRoot "PackageContents.xml"

$packageExists = Test-Path $packageContentsPath
$dllExists = Test-Path $bundleDllPath
$commands = @()
$loadOnStartup = $false
$errors = New-Object System.Collections.Generic.List[string]

if ($packageExists) {
    try {
        [xml]$xml = Get-Content $packageContentsPath -Raw
        $entry = $xml.ApplicationPackage.Components.ComponentEntry
        if ($entry) {
            $loadOnStartup = [string]$entry.LoadOnAutoCADStartup -eq "True"
            foreach ($command in $entry.Commands.Command) {
                $globalCommand = [string]$command.Global
                if (-not [string]::IsNullOrWhiteSpace($globalCommand)) {
                    $commands += $globalCommand
                }
            }
        }
    }
    catch {
        $errors.Add("PackageContents.xml could not be parsed: $($_.Exception.Message)")
    }
}
else {
    $errors.Add("PackageContents.xml not found.")
}

if (-not $dllExists) {
    $errors.Add("Plugin DLL not found.")
}

$result = [ordered]@{
    ok = ($errors.Count -eq 0)
    bundleRoot = $BundleRoot
    packageContentsExists = $packageExists
    dllExists = $dllExists
    loadOnAutoCadStartup = $loadOnStartup
    commands = $commands
    errors = @($errors)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 4
}
else {
    $result
}

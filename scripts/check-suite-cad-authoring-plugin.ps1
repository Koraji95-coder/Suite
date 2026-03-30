[CmdletBinding()]
param(
    [string]$BundleRoot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DefaultBundleRoot {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:ProgramFiles) {
        $candidates.Add((Join-Path $env:ProgramFiles "Autodesk\ApplicationPlugins\SuiteCadAuthoring.bundle"))
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates.Add((Join-Path ${env:ProgramFiles(x86)} "Autodesk\ApplicationPlugins\SuiteCadAuthoring.bundle"))
    }
    if ($env:APPDATA) {
        $candidates.Add((Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\SuiteCadAuthoring.bundle"))
    }
    if ($env:ProgramData) {
        $candidates.Add((Join-Path $env:ProgramData "Autodesk\ApplicationPlugins\SuiteCadAuthoring.bundle"))
    }
    if ($env:ALLUSERSPROFILE) {
        $candidates.Add((Join-Path $env:ALLUSERSPROFILE "Autodesk\ApplicationPlugins\SuiteCadAuthoring.bundle"))
    }
    if ($env:USERPROFILE) {
        $candidates.Add((Join-Path $env:USERPROFILE "AppData\Roaming\Autodesk\ApplicationPlugins\SuiteCadAuthoring.bundle"))
    }

    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $candidates[0]
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
    $autoCadRoot = "HKCU:\Software\Autodesk\AutoCAD"
    if (-not (Test-Path $autoCadRoot)) {
        return @()
    }

    return @(
        Get-ChildItem -Path $autoCadRoot -Recurse -ErrorAction SilentlyContinue |
            Where-Object {
                $_.PSPath -match "\\Profiles\\[^\\]+\\Variables$" -or
                $_.PSPath -match "\\R[^\\]+\\[^\\]+\\Variables$"
            } |
            Select-Object -ExpandProperty PSPath -Unique
    )
}

function Get-TrustedPathSummary {
    param([string]$ResolvedBundleRoot)

    $trustedEntries = Get-AutoCadTrustedBundlePaths -ResolvedBundleRoot $ResolvedBundleRoot
    $matchingKeys = New-Object System.Collections.Generic.List[string]

    foreach ($registryPath in (Get-AutoCadTrustedPathRegistryKeys)) {
        try {
            $currentTrustedPaths = [string](Get-ItemPropertyValue -Path $registryPath -Name TRUSTEDPATHS -ErrorAction Stop)
        }
        catch {
            continue
        }

        $pathEntries = @(
            $currentTrustedPaths -split ";" |
                ForEach-Object { $_.Trim() } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        )

        foreach ($trustedEntry in $trustedEntries) {
            if ($pathEntries -contains $trustedEntry) {
                $matchingKeys.Add($registryPath)
                break
            }
        }
    }

    return [pscustomobject]@{
        registered = ($matchingKeys.Count -gt 0)
        trustedEntries = @($trustedEntries)
        registryKeys = @($matchingKeys | Select-Object -Unique)
    }
}

function Add-UniqueError {
    param(
        [System.Collections.Generic.List[string]]$ErrorList,
        [string]$Message
    )

    if ([string]::IsNullOrWhiteSpace($Message)) {
        return
    }
    if (-not $ErrorList.Contains($Message)) {
        $ErrorList.Add($Message)
    }
}

if (-not $BundleRoot) {
    $BundleRoot = Get-DefaultBundleRoot
}
$BundleRoot = [System.IO.Path]::GetFullPath($BundleRoot)
$bundleDllPath = Join-Path $BundleRoot "Contents\Win64\SuiteCadAuthoring.dll"
$bundleDepsPath = Join-Path $BundleRoot "Contents\Win64\SuiteCadAuthoring.deps.json"
$bundleRuntimeConfigPath = Join-Path $BundleRoot "Contents\Win64\SuiteCadAuthoring.runtimeconfig.json"
$packageContentsPath = Join-Path $BundleRoot "PackageContents.xml"

$packageExists = Test-Path $packageContentsPath
$dllExists = Test-Path $bundleDllPath
$depsExists = Test-Path $bundleDepsPath
$runtimeConfigExists = Test-Path $bundleRuntimeConfigPath
$commands = @()
$loadOnStartup = $false
$productCode = $null
$upgradeCode = $null
$errors = New-Object System.Collections.Generic.List[string]
$trustedPathSummary = Get-TrustedPathSummary -ResolvedBundleRoot $BundleRoot

if ($packageExists) {
    try {
        [xml]$xml = Get-Content $packageContentsPath -Raw
        $applicationPackage = $xml.DocumentElement
        $productCode = [string]$applicationPackage.GetAttribute("ProductCode")
        $upgradeCode = [string]$applicationPackage.GetAttribute("UpgradeCode")
        $entry = $applicationPackage.SelectSingleNode("//ComponentEntry")
        if ($entry) {
            $loadOnStartup = [string]$entry.GetAttribute("LoadOnAutoCADStartup") -eq "True"
            foreach ($command in $entry.SelectNodes("Commands/Command")) {
                $globalCommand = [string]$command.GetAttribute("Global")
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
    Add-UniqueError -ErrorList $errors -Message "Plugin DLL not found."
}
if (-not $depsExists) {
    Add-UniqueError -ErrorList $errors -Message "Plugin dependency manifest (.deps.json) not found."
}
if (-not $runtimeConfigExists) {
    Add-UniqueError -ErrorList $errors -Message "Plugin runtime config (.runtimeconfig.json) not found."
}
if ($packageExists -and [string]::IsNullOrWhiteSpace($productCode)) {
    Add-UniqueError -ErrorList $errors -Message "PackageContents.xml is missing ProductCode."
}
if ($packageExists -and [string]::IsNullOrWhiteSpace($upgradeCode)) {
    Add-UniqueError -ErrorList $errors -Message "PackageContents.xml is missing UpgradeCode."
}
if (-not $trustedPathSummary.registered) {
    Add-UniqueError -ErrorList $errors -Message "AutoCAD trusted path registration is missing for the plugin bundle."
}

$expectedCommands = @(
    "SUITETERMINALAUTHORAPPLY"
)
$missingCommands = @(
    $expectedCommands |
        Where-Object { $commands -notcontains $_ }
)
if ($missingCommands.Count -gt 0) {
    Add-UniqueError `
        -ErrorList $errors `
        -Message ("PackageContents.xml is missing commands: " + ($missingCommands -join ", "))
}

$result = [ordered]@{
    ok = ($errors.Count -eq 0)
    bundleRoot = $BundleRoot
    bundleDllPath = $bundleDllPath
    packageContentsExists = $packageExists
    dllExists = $dllExists
    depsExists = $depsExists
    runtimeConfigExists = $runtimeConfigExists
    loadOnAutoCadStartup = $loadOnStartup
    trustedPathRegistered = [bool]$trustedPathSummary.registered
    trustedPathEntries = @($trustedPathSummary.trustedEntries)
    trustedPathRegistryKeys = @($trustedPathSummary.registryKeys)
    productCode = $productCode
    upgradeCode = $upgradeCode
    commands = $commands
    errors = @($errors)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 4
}
else {
    $result
}

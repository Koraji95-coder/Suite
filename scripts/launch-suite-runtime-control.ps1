[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$AutoBootstrap,
    [switch]$LegacyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms | Out-Null

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$hostProjectPath = Join-Path $resolvedRepoRoot "dotnet\Suite.RuntimeControl\Suite.RuntimeControl.csproj"
$hostProjectRoot = Split-Path -Parent $hostProjectPath
$hostBuildOutputDirectory = Join-Path $hostProjectRoot "bin\Debug\net8.0-windows"
$hostOutputPath = Join-Path $hostBuildOutputDirectory "Suite.RuntimeControl.exe"
$legacyScriptPath = (Resolve-Path (Join-Path $PSScriptRoot "open-suite-runtime-control.ps1")).Path
$runtimeStatusBase = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([string]::IsNullOrWhiteSpace($runtimeStatusBase)) {
    $runtimeStatusBase = $env:TEMP
}
$runtimeStatusDir = Join-Path $runtimeStatusBase "Suite\runtime-bootstrap"
$launcherLogPath = Join-Path $runtimeStatusDir "runtime-launcher.log"
$hostStageRoot = Join-Path $runtimeStatusBase "Suite\runtime-control"
New-Item -ItemType Directory -Path $runtimeStatusDir -Force | Out-Null
New-Item -ItemType Directory -Path $hostStageRoot -Force | Out-Null

function Write-LauncherLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("INFO", "WARN", "ERR")][string]$Tag = "INFO"
    )

    try {
        $timestamp = (Get-Date).ToString("o")
        Add-Content -Path $launcherLogPath -Value "[$timestamp] [$Tag] $Message"
    }
    catch {
    }
}

function Show-LauncherMessage {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Title = "Suite Runtime Control"
    )

    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        [System.Windows.Forms.MessageBox]::Show(
            $Message,
            $Title,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
    }
    catch {
    }
}

function Get-DotNetExecutable {
    $dotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
    if ($dotnet) {
        return $dotnet.Source
    }

    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($dotnet) {
        return $dotnet.Source
    }

    return $null
}

function Test-WebView2RuntimeInstalled {
    $clientIds = @(
        "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "{2CD8A007-E189-409D-A2C8-9AF4EF3C72AA}"
    )
    $registryRoots = @(
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients"
    )

    foreach ($root in $registryRoots) {
        foreach ($clientId in $clientIds) {
            $candidate = Join-Path $root $clientId
            try {
                $version = Get-ItemPropertyValue -Path $candidate -Name "pv" -ErrorAction Stop
                if (-not [string]::IsNullOrWhiteSpace([string]$version)) {
                    return $true
                }
            }
            catch {
            }
        }
    }

    return $false
}

function Get-SmartAppControlState {
    try {
        $policy = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy" -ErrorAction Stop
        return [int]($policy.VerifiedAndReputablePolicyState)
    }
    catch {
        return 0
    }
}

function Get-HostSourceTimestampUtc {
    if (-not (Test-Path $hostProjectRoot)) {
        return [datetime]::MinValue
    }

    $sourceFiles = Get-ChildItem -Path $hostProjectRoot -Recurse -File |
        Where-Object {
            $_.FullName -notlike "*\bin\*" -and
            $_.FullName -notlike "*\obj\*"
        }

    if (-not $sourceFiles) {
        return [datetime]::MinValue
    }

    return ($sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
}

function Build-HostIfNeeded {
    param([string]$DotNetExecutable)

    $needsBuild = -not (Test-Path $hostOutputPath)
    if (-not $needsBuild) {
        $hostTimestamp = (Get-Item -LiteralPath $hostOutputPath).LastWriteTimeUtc
        $sourceTimestamp = Get-HostSourceTimestampUtc
        $needsBuild = $sourceTimestamp -gt $hostTimestamp
    }

    if (-not $needsBuild) {
        Write-LauncherLog -Message "Desktop shell build is current."
        return
    }

    Write-Host "Building Suite Runtime Control..."
    Write-LauncherLog -Message "Building desktop shell host."
    & $DotNetExecutable build $hostProjectPath -c Debug -v quiet /nologo
    $exitCode = if (Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue) { [int]$LASTEXITCODE } else { 0 }
    if ($exitCode -ne 0) {
        throw "dotnet build failed for the runtime control shell."
    }

    Write-LauncherLog -Message "Desktop shell host build completed."
}

function Start-LegacyControlPanel {
    $arguments = @(
        "-NoProfile",
        "-Sta",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $legacyScriptPath,
        "-RepoRoot",
        $resolvedRepoRoot
    )

    if ($AutoBootstrap) {
        $arguments += "-AutoBootstrap"
    }

    $process = Start-Process -FilePath "PowerShell.exe" -WorkingDirectory $resolvedRepoRoot -ArgumentList $arguments -PassThru -ErrorAction Stop
    Write-LauncherLog -Message "Legacy runtime control panel launched. PID=$($process.Id)." -Tag "WARN"
    return $process
}

function Start-DesktopControlPanel {
    param(
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string[]]$Arguments
    )

    Write-Host "Launching Suite Runtime Control..."
    $process = Start-Process -FilePath $ExecutablePath -WorkingDirectory $WorkingDirectory -ArgumentList $Arguments -PassThru -ErrorAction Stop
    Write-LauncherLog -Message "Desktop shell process created. PID=$($process.Id). Path=$ExecutablePath"

    try {
        $null = $process.WaitForInputIdle(7000)
    }
    catch {
        Write-LauncherLog -Message "WaitForInputIdle warning: $($_.Exception.Message)" -Tag "WARN"
    }

    Start-Sleep -Milliseconds 900
    try {
        $process.Refresh()
    }
    catch {
    }

    if ($process.HasExited) {
        throw "The desktop shell exited before opening a window."
    }

    Write-LauncherLog -Message "Desktop shell is running. PID=$($process.Id)."
    Write-Host "Suite Runtime Control started."
    return $process
}

function Sync-HostToStagingDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDirectory,
        [Parameter(Mandatory = $true)][string]$SourceExecutablePath
    )

    if (-not (Test-Path $SourceExecutablePath)) {
        throw "The desktop shell executable was not produced."
    }

    $buildStamp = (Get-Item -LiteralPath $SourceExecutablePath).LastWriteTimeUtc.ToString("yyyyMMddHHmmssfff", [System.Globalization.CultureInfo]::InvariantCulture)
    $stageDirectory = Join-Path $hostStageRoot $buildStamp
    $stageExecutablePath = Join-Path $stageDirectory "Suite.RuntimeControl.exe"

    if (-not (Test-Path $stageExecutablePath)) {
        New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
        Copy-Item -Path (Join-Path $SourceDirectory "*") -Destination $stageDirectory -Recurse -Force
        Get-ChildItem -Path $stageDirectory -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
        }
        Write-LauncherLog -Message "Staged desktop shell build to $stageDirectory."
    }
    else {
        Write-LauncherLog -Message "Reusing staged desktop shell build at $stageDirectory."
    }

    Get-ChildItem -Path $hostStageRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -Skip 3 |
        ForEach-Object {
            try {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
            }
            catch {
                Write-LauncherLog -Message "Stale stage cleanup warning for $($_.FullName): $($_.Exception.Message)" -Tag "WARN"
            }
        }

    return [pscustomobject]@{
        Directory = $stageDirectory
        ExecutablePath = $stageExecutablePath
    }
}

if ($LegacyOnly -or -not (Test-Path $hostProjectPath)) {
    Write-Host "Opening legacy Suite runtime control panel..."
    Write-LauncherLog -Message "LegacyOnly requested or desktop host project missing. Opening legacy panel." -Tag "WARN"
    Start-LegacyControlPanel | Out-Null
    exit 0
}

$dotNetExecutable = Get-DotNetExecutable
if (-not $dotNetExecutable) {
    Write-Warning "dotnet was not found on PATH; falling back to the legacy runtime control panel."
    Write-LauncherLog -Message "dotnet was not found on PATH. Falling back to legacy panel." -Tag "WARN"
    Write-Host "dotnet was not found. Opening legacy runtime control panel..."
    Start-LegacyControlPanel | Out-Null
    exit 0
}

if (-not (Test-WebView2RuntimeInstalled)) {
    Write-Warning "WebView2 runtime is not installed; falling back to the legacy runtime control panel."
    Write-LauncherLog -Message "WebView2 runtime was not detected. Falling back to legacy panel." -Tag "WARN"
    Write-Host "WebView2 runtime was not detected. Opening legacy runtime control panel..."
    Start-LegacyControlPanel | Out-Null
    exit 0
}

$smartAppControlState = Get-SmartAppControlState
if ($smartAppControlState -eq 1) {
    $message = "Smart App Control is currently enforcing verified/reputable app policy on this workstation and is blocking the unsigned Suite desktop shell DLL. Opening the legacy runtime control panel instead."
    Write-Warning $message
    Write-LauncherLog -Message $message -Tag "WARN"
    Write-Host "To allow the HTML desktop shell: Windows Security > App & browser control > Smart App Control > Off"
    Write-Host "Note: turning Smart App Control off is effectively one-way unless Windows is reset or reinstalled."
    Start-LegacyControlPanel | Out-Null
    exit 0
}

try {
    Build-HostIfNeeded -DotNetExecutable $dotNetExecutable
    $stagedHost = Sync-HostToStagingDirectory -SourceDirectory $hostBuildOutputDirectory -SourceExecutablePath $hostOutputPath

    $hostArguments = @("--repo-root", $resolvedRepoRoot)
    if ($AutoBootstrap) {
        $hostArguments += "--auto-bootstrap"
    }

    Start-DesktopControlPanel -ExecutablePath $stagedHost.ExecutablePath -WorkingDirectory $stagedHost.Directory -Arguments $hostArguments | Out-Null
}
catch {
    Write-Warning "Runtime control shell launch failed; falling back to the legacy control panel. $($_.Exception.Message)"
    Write-LauncherLog -Message "Desktop shell launch failed: $($_.Exception.Message)" -Tag "ERR"
    try {
        Write-Host "Desktop shell did not stay open. Opening legacy runtime control panel..."
        Start-LegacyControlPanel | Out-Null
    }
    catch {
        Write-LauncherLog -Message "Legacy control panel fallback failed: $($_.Exception.Message)" -Tag "ERR"
        Show-LauncherMessage -Message "Suite Runtime Control could not start.`r`n`r`nDesktop shell error: $($_.Exception.Message)"
        throw
    }
}

[CmdletBinding()]
param(
    [string]$TaskName = "SuiteRuntimeBootstrap",
    [bool]$RunNow = $true,
    [switch]$Headless
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startupLauncherScript = if ($Headless) {
    (Resolve-Path (Join-Path $PSScriptRoot "run-suite-runtime-startup.vbs")).Path
}
else {
    (Resolve-Path (Join-Path $PSScriptRoot "launch-suite-runtime-control.vbs")).Path
}
$runtimeControlExecutable = Join-Path $repoRoot "dotnet\Suite.RuntimeControl\bin\Debug\net8.0-windows\Suite.RuntimeControl.exe"
$useDirectDesktopShell = (-not $Headless) -and (Test-Path $runtimeControlExecutable)
$userId = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$startupMode = if ($Headless) {
    "headless"
}
elseif ($useDirectDesktopShell) {
    "desktop_shell_direct"
}
else {
    "desktop_shell"
}
$actionExecute = if ($useDirectDesktopShell) { $runtimeControlExecutable } else { "WScript.exe" }
$actionArgs = if ($useDirectDesktopShell) {
    "--repo-root `"$repoRoot`" --auto-bootstrap"
}
else {
    "`"$startupLauncherScript`""
}
$actionWorkingDirectory = if ($useDirectDesktopShell) {
    Split-Path -Parent $runtimeControlExecutable
}
else {
    $null
}
$statusBase = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
elseif ($env:TEMP) {
    $env:TEMP
}
else {
    $env:USERPROFILE
}
$statusRoot = Join-Path $statusBase "Suite\runtime-bootstrap"
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
. $runtimeSharedScript

function Invoke-BootstrapNow {
    if ($useDirectDesktopShell) {
        Start-Process `
            -FilePath $runtimeControlExecutable `
            -WorkingDirectory $actionWorkingDirectory `
            -ArgumentList @("--repo-root", $repoRoot, "--auto-bootstrap") | Out-Null
        return
    }

    Start-Process -FilePath "WScript.exe" -ArgumentList @($startupLauncherScript) | Out-Null
}

function Install-RunKeyFallback {
    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $runValue = if ($useDirectDesktopShell) {
        "`"$runtimeControlExecutable`" --repo-root `"$repoRoot`" --auto-bootstrap"
    }
    else {
        "WScript.exe $actionArgs"
    }

    if (-not (Test-Path $runKeyPath)) {
        New-Item -Path $runKeyPath -Force | Out-Null
    }
    New-ItemProperty -Path $runKeyPath -Name $TaskName -Value $runValue -PropertyType String -Force | Out-Null

    if ($RunNow) {
        Invoke-BootstrapNow
    }

    Write-Host "Installed HKCU Run runtime bootstrap '$TaskName' for $userId"
    Write-Host "Status artifacts: $statusRoot"
    Write-Host "Startup mode: $startupMode"
}

function Remove-RunKeyFallback {
    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    if (-not (Test-Path $runKeyPath)) {
        return
    }

    try {
        $existingValue = Get-ItemPropertyValue -Path $runKeyPath -Name $TaskName -ErrorAction Stop
        if (-not [string]::IsNullOrWhiteSpace([string]$existingValue)) {
            Remove-ItemProperty -Path $runKeyPath -Name $TaskName -ErrorAction Stop
            Write-Host "Removed HKCU Run runtime bootstrap '$TaskName' because scheduled startup is available."
        }
    }
    catch {
    }
}

function Get-ExistingScheduledBootstrapTask {
    try {
        return Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    }
    catch {
        return $null
    }
}

function Test-ScheduledTaskMatchesStartup {
    param(
        [Parameter(Mandatory = $true)]$Task
    )

    foreach ($candidateAction in @($Task.Actions)) {
        $execute = [string]$candidateAction.Execute
        $arguments = [string]$candidateAction.Arguments
        if ($useDirectDesktopShell) {
            if (
                [string]::Equals(
                    ([string]$execute).Trim(),
                    $runtimeControlExecutable,
                    [System.StringComparison]::OrdinalIgnoreCase
                ) -and
                $arguments -like "*--repo-root*" -and
                $arguments -like "*$repoRoot*" -and
                $arguments -like "*--auto-bootstrap*"
            ) {
                return $true
            }

            continue
        }

        if (
            $execute -match "(?i)wscript(?:\.exe)?$" -and
            $arguments -like "*$startupLauncherScript*"
        ) {
            return $true
        }
    }

    return $false
}

try {
    $action = if ($useDirectDesktopShell) {
        New-ScheduledTaskAction -Execute $actionExecute -Argument $actionArgs -WorkingDirectory $actionWorkingDirectory
    }
    else {
        New-ScheduledTaskAction -Execute $actionExecute -Argument $actionArgs
    }
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description $(if ($Headless) { "Start the Suite local runtime after Windows sign-in and show readiness notifications." } else { "Open the Suite HTML runtime control shell after Windows sign-in and auto-bootstrap local services." }) `
        -ErrorAction Stop `
        -Force | Out-Null

    Remove-RunKeyFallback
    Remove-SuiteCompanionAppRunKeyEntry -CompanionAppId "office" | Out-Null

    if ($RunNow) {
        Invoke-BootstrapNow
    }

    Write-Host "Installed scheduled runtime bootstrap '$TaskName' for $userId"
    Write-Host "Status artifacts: $statusRoot"
    Write-Host "Startup mode: $startupMode"
}
catch {
    $existingTask = Get-ExistingScheduledBootstrapTask
    if ($existingTask -and (Test-ScheduledTaskMatchesStartup -Task $existingTask)) {
        Write-Warning "Scheduled task registration failed, but a matching runtime bootstrap task already exists. Skipping HKCU Run fallback. $($_.Exception.Message)"
        Remove-RunKeyFallback
        Remove-SuiteCompanionAppRunKeyEntry -CompanionAppId "office" | Out-Null

        if ($RunNow) {
            Invoke-BootstrapNow
        }

        Write-Host "Scheduled runtime bootstrap '$TaskName' is already available for $userId"
        Write-Host "Status artifacts: $statusRoot"
        Write-Host "Startup mode: $startupMode"
    }
    else {
        Write-Warning "Scheduled task install failed; falling back to HKCU Run runtime bootstrap. $($_.Exception.Message)"
        Install-RunKeyFallback
        Remove-SuiteCompanionAppRunKeyEntry -CompanionAppId "office" | Out-Null
    }
}

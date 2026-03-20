[CmdletBinding()]
param(
    [string]$TaskName = "SuiteRuntimeBootstrap",
    [bool]$RunNow = $true,
    [switch]$Headless
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$startupScript = if ($Headless) {
    (Resolve-Path (Join-Path $PSScriptRoot "run-suite-runtime-startup.ps1")).Path
}
else {
    (Resolve-Path (Join-Path $PSScriptRoot "launch-suite-runtime-control.ps1")).Path
}
$userId = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$actionArgs = if ($Headless) {
    "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$startupScript`" -Notify"
}
else {
    "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$startupScript`" -AutoBootstrap"
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

function Invoke-BootstrapNow {
    $arguments = if ($Headless) {
        @("-WindowStyle", "Hidden", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $startupScript, "-Notify")
    }
    else {
        @("-WindowStyle", "Hidden", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $startupScript, "-AutoBootstrap")
    }

    Start-Process -FilePath "PowerShell.exe" -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}

function Install-RunKeyFallback {
    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $runValue = "PowerShell.exe $actionArgs"

    if (-not (Test-Path $runKeyPath)) {
        New-Item -Path $runKeyPath -Force | Out-Null
    }
    New-ItemProperty -Path $runKeyPath -Name $TaskName -Value $runValue -PropertyType String -Force | Out-Null

    if ($RunNow) {
        Invoke-BootstrapNow
    }

    Write-Host "Installed HKCU Run runtime bootstrap '$TaskName' for $userId"
    Write-Host "Status artifacts: $statusRoot"
    if (-not $Headless) {
        Write-Host "Startup mode: desktop_shell"
    }
}

try {
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $actionArgs
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

    if ($RunNow) {
        Invoke-BootstrapNow
    }

    Write-Host "Installed scheduled runtime bootstrap '$TaskName' for $userId"
    Write-Host "Status artifacts: $statusRoot"
    if (-not $Headless) {
        Write-Host "Startup mode: desktop_shell"
    }
}
catch {
    Write-Warning "Scheduled task install failed; falling back to HKCU Run runtime bootstrap. $($_.Exception.Message)"
    Install-RunKeyFallback
}

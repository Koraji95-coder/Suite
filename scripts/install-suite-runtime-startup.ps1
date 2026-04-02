[CmdletBinding()]
param(
    [string]$TaskName = "SuiteRuntimeBootstrap",
    [object]$RunNow = $true,
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
$userId = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$startupMode = if ($Headless) {
    "headless"
}
else {
    "login_orchestrator"
}
$actionExecute = "WScript.exe"
$actionArgs = "`"$startupLauncherScript`""
$actionWorkingDirectory = $null
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

function Resolve-BooleanArgument {
    param(
        [AllowNull()][object]$Value,
        [bool]$Default = $true,
        [string]$ParameterName = "value"
    )

    if ($null -eq $Value) {
        return $Default
    }

    if ($Value -is [bool]) {
        return [bool]$Value
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $Default
    }

    switch -Regex ($text.Trim().ToLowerInvariant()) {
        "^(1|true|yes|y|on)$" { return $true }
        "^(0|false|no|n|off)$" { return $false }
        default { throw "Parameter '$ParameterName' expects a boolean value (true/false/1/0)." }
    }
}

$RunNow = Resolve-BooleanArgument -Value $RunNow -Default $true -ParameterName "RunNow"

function Invoke-BootstrapNow {
    Start-Process -FilePath "WScript.exe" -ArgumentList @($startupLauncherScript) | Out-Null
}

function Remove-SecondaryStartupOwners {
    $officeRemoved = $false
    try {
        $officeRemoved = Remove-SuiteCompanionAppRunKeyEntry -CompanionAppId "office"
    }
    catch {
        $officeRemoved = $false
    }

    $preflightResult = $null
    try {
        $preflightResult = Remove-SuiteSupabaseRemotePreflightStartup
    }
    catch {
        $preflightResult = [pscustomobject]@{
            taskName = "SuiteSupabaseRemotePreflight"
            removedScheduledTask = $false
            removedRunKey = $false
            removed = $false
        }
    }

    return [pscustomobject]@{
        officeRemoved = $officeRemoved
        supabaseRemotePreflight = $preflightResult
    }
}

function Write-StartupInstallManifest {
    param(
        [Parameter(Mandatory = $true)][string]$Owner,
        [string]$FallbackReason,
        [bool]$UsedExistingTask = $false,
        [object]$SecondaryOwnerCleanup
    )

    $manifest = [ordered]@{
        generatedAt = (Get-Date).ToString("o")
        taskName = $TaskName
        preferredOwner = "scheduled_task"
        owner = $Owner
        startupMode = $startupMode
        launcherPath = $startupLauncherScript
        runNow = [bool]$RunNow
        usedExistingTask = $UsedExistingTask
        fallbackReason = if ([string]::IsNullOrWhiteSpace($FallbackReason)) { $null } else { $FallbackReason }
        secondaryOwnerCleanup = $SecondaryOwnerCleanup
    }

    Write-SuiteRuntimeStartupManifest -Manifest $manifest -StatusBase $statusBase | Out-Null
}

function Install-RunKeyFallback {
    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $runValue = "WScript.exe $actionArgs"

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
    $action = New-ScheduledTaskAction -Execute $actionExecute -Argument $actionArgs
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
    $secondaryOwnerCleanup = Remove-SecondaryStartupOwners
    Write-StartupInstallManifest -Owner "scheduled_task" -SecondaryOwnerCleanup $secondaryOwnerCleanup

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
        $secondaryOwnerCleanup = Remove-SecondaryStartupOwners
        Write-StartupInstallManifest `
            -Owner "scheduled_task" `
            -FallbackReason $_.Exception.Message `
            -UsedExistingTask $true `
            -SecondaryOwnerCleanup $secondaryOwnerCleanup

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
        $secondaryOwnerCleanup = Remove-SecondaryStartupOwners
        Write-StartupInstallManifest `
            -Owner "hkcu_run" `
            -FallbackReason $_.Exception.Message `
            -SecondaryOwnerCleanup $secondaryOwnerCleanup
    }
}

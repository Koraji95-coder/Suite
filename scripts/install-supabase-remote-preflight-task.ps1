[CmdletBinding()]
param(
    [string]$TaskName = "SuiteSupabaseRemotePreflight",
    [object]$RunNow = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$preflightScript = (Resolve-Path (Join-Path $PSScriptRoot "run-supabase-remote-preflight.ps1")).Path
$userId = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$actionArgs = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$preflightScript`" -NotifyOnFailure -SilentSuccess"
$statusBase = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
elseif ($env:TEMP) {
    $env:TEMP
}
else {
    $env:USERPROFILE
}
$statusRoot = Join-Path $statusBase "Suite\supabase-sync"

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

function Invoke-PreflightNow {
    & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $preflightScript -NotifyOnFailure
}

function Install-RunKeyFallback {
    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $runValue = "PowerShell.exe $actionArgs"

    if (-not (Test-Path $runKeyPath)) {
        New-Item -Path $runKeyPath -Force | Out-Null
    }
    New-ItemProperty -Path $runKeyPath -Name $TaskName -Value $runValue -PropertyType String -Force | Out-Null

    if ($RunNow) {
        Invoke-PreflightNow
    }

    Write-Host "Installed HKCU Run preflight '$TaskName' for $userId"
    Write-Host "Status artifacts: $statusRoot"
}

try {
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $actionArgs
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description "Run the Suite hosted Supabase preflight at Windows sign-in and notify on failure." `
        -ErrorAction Stop `
        -Force | Out-Null

    if ($RunNow) {
        Invoke-PreflightNow
    }

    Write-Host "Installed scheduled task '$TaskName' for $userId"
    Write-Host "Status artifacts: $statusRoot"
}
catch {
    Write-Warning "Scheduled task install failed; falling back to HKCU Run preflight. $($_.Exception.Message)"
    Install-RunKeyFallback
}

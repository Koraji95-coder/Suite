[CmdletBinding()]
param(
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror"),
    [string]$TaskName = "SuiteLocalStateMirror",
    [ValidateRange(5, 1440)][int]$IntervalMinutes = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$syncScript = (Resolve-Path (Join-Path $PSScriptRoot "sync-suite-local-state.ps1")).Path
$daemonScript = (Resolve-Path (Join-Path $PSScriptRoot "sync-suite-local-state-daemon.ps1")).Path
$userId = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$syncScript`" -MirrorRoot `"$MirrorRoot`""

function Install-RunKeyFallback {
    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $runValue = "PowerShell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$daemonScript`" -MirrorRoot `"$MirrorRoot`" -IntervalMinutes $IntervalMinutes"

    New-Item -Path $runKeyPath -Force | Out-Null
    New-ItemProperty -Path $runKeyPath -Name $TaskName -Value $runValue -PropertyType String -Force | Out-Null

    & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -MirrorRoot $MirrorRoot
    Start-Process PowerShell.exe -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $daemonScript,
        "-MirrorRoot",
        $MirrorRoot,
        "-IntervalMinutes",
        "$IntervalMinutes"
    ) | Out-Null

    Write-Host "Installed HKCU startup sync '$TaskName' for $userId"
    Write-Host "Mirror root: $MirrorRoot"
}

try {
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $actionArgs
    $repeatTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger @($repeatTrigger, $logonTrigger) `
        -Principal $principal `
        -Settings $settings `
        -Description "Mirror Suite local Codex/ZeroClaw/backend learning state into Dropbox." `
        -Force | Out-Null

    & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -MirrorRoot $MirrorRoot
    Start-ScheduledTask -TaskName $TaskName

    Write-Host "Installed scheduled task '$TaskName' for $userId"
    Write-Host "Mirror root: $MirrorRoot"
}
catch {
    Write-Warning "Scheduled task install failed; falling back to HKCU startup sync. $($_.Exception.Message)"
    Install-RunKeyFallback
}

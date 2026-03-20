[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet("Info", "Warning", "Error")][string]$Level = "Info",
    [ValidateRange(1, 30)][int]$DurationSeconds = 8
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
    $notifyIcon.Visible = $true
    $notifyIcon.BalloonTipTitle = $Title
    $notifyIcon.BalloonTipText = $Message
    $notifyIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::$Level
    $notifyIcon.Icon = switch ($Level) {
        "Error" { [System.Drawing.SystemIcons]::Error }
        "Warning" { [System.Drawing.SystemIcons]::Warning }
        default { [System.Drawing.SystemIcons]::Information }
    }

    $notifyIcon.ShowBalloonTip($DurationSeconds * 1000)
    Start-Sleep -Seconds $DurationSeconds
    $notifyIcon.Dispose()
}
catch {
    Write-Warning "Windows notification failed: $($_.Exception.Message)"
}

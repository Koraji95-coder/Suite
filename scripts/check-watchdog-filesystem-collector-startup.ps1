[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [string]$TaskName,
    [string]$CheckTaskName,
    [string]$RunKeyName,
    [string]$MutexName,
    [switch]$StartIfMissing,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$daemonScript = (Resolve-Path (Join-Path $PSScriptRoot "watchdog-filesystem-collector-daemon.ps1")).Path
$localAppData = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
else {
    Join-Path $env:USERPROFILE "AppData\Local"
}

function Get-TomlStringValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not $Path -or -not (Test-Path $Path)) {
        return $null
    }

    $pattern = "^\s*$([Regex]::Escape($Key))\s*=\s*""([^""]*)"""
    foreach ($line in Get-Content $Path) {
        $match = [Regex]::Match($line, $pattern)
        if ($match.Success) {
            return $match.Groups[1].Value.Trim()
        }
    }

    return $null
}

function Get-WorkstationIdentity {
    param(
        [string]$TomlPath,
        [string]$ExplicitWorkstationId
    )

    $computerName = [string]($env:COMPUTERNAME)
    $configuredWorkstationId = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ID")
    $resolvedWorkstationId = if ($ExplicitWorkstationId) {
        $ExplicitWorkstationId
    }
    elseif ($configuredWorkstationId) {
        $configuredWorkstationId
    }
    elseif ($computerName) {
        $computerName
    }
    else {
        [System.Net.Dns]::GetHostName()
    }

    [pscustomobject]@{
        WorkstationId = $resolvedWorkstationId.Trim()
        WorkstationLabel = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_LABEL")
        WorkstationRole = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ROLE")
        ComputerName = $computerName.Trim()
    }
}

function Convert-ToSlug {
    param([string]$Value)

    $slug = [Regex]::Replace(([string]$Value).ToLowerInvariant(), "[^a-z0-9]+", "-")
    return $slug.Trim("-")
}

function Resolve-AbsolutePath {
    param([string]$PathValue)

    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $null
    }
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $PathValue))
}

function Get-CollectorScheduledTask {
    param([string]$Name)

    if ([string]::IsNullOrWhiteSpace($Name)) {
        return $null
    }

    $command = Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }

    try {
        return Get-ScheduledTask -TaskName $Name -ErrorAction Stop
    }
    catch {
        return $null
    }
}

function Get-RunKeyValue {
    param([string]$Name)

    if ([string]::IsNullOrWhiteSpace($Name)) {
        return $null
    }

    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    try {
        return [string](Get-ItemPropertyValue -Path $runKeyPath -Name $Name -ErrorAction Stop)
    }
    catch {
        return $null
    }
}

function Test-DaemonRunning {
    param(
        [string]$DaemonScriptPath,
        [string]$CollectorConfigPath
    )

    $daemonToken = [System.IO.Path]::GetFileName($DaemonScriptPath).ToLowerInvariant()
    $configToken = [string]$CollectorConfigPath
    if ($configToken) {
        $configToken = $configToken.ToLowerInvariant()
    }

    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'"
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        $normalized = $commandLine.ToLowerInvariant()
        if (-not $normalized.Contains($daemonToken)) {
            continue
        }
        if ($configToken -and -not $normalized.Contains($configToken)) {
            continue
        }

        return $true
    }

    return $false
}

function Start-CollectorDaemonProcess {
    param(
        [string]$DaemonScriptPath,
        [string]$CollectorConfigPath,
        [string]$TomlPath,
        [string]$NamedMutex
    )

    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        $DaemonScriptPath,
        "-ConfigPath",
        $CollectorConfigPath,
        "-CodexConfigPath",
        $TomlPath,
        "-MutexName",
        $NamedMutex
    )

    Start-Process PowerShell.exe -WindowStyle Hidden -ArgumentList $arguments | Out-Null
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$slug = Convert-ToSlug -Value $identity.WorkstationId

if (-not $ConfigPath) {
    $ConfigPath = Join-Path `
        (Join-Path $localAppData "Suite\watchdog-collector\config") `
        "$($identity.WorkstationId).json"
}
$ConfigPath = Resolve-AbsolutePath -PathValue $ConfigPath

if (-not $TaskName) {
    $TaskName = "SuiteWatchdogFilesystemCollector-$($identity.WorkstationId)"
}
if (-not $CheckTaskName) {
    $CheckTaskName = "SuiteWatchdogFilesystemCollectorCheck-$($identity.WorkstationId)"
}
if (-not $RunKeyName) {
    $RunKeyName = $TaskName
}
if (-not $MutexName) {
    $MutexName = "Local\SuiteWatchdogFilesystemCollectorDaemon-$slug"
}

$task = Get-CollectorScheduledTask -Name $TaskName
$checkTask = Get-CollectorScheduledTask -Name $CheckTaskName
$runKeyValue = Get-RunKeyValue -Name $RunKeyName
$configExists = Test-Path $ConfigPath
$configWorkstationId = $null
$configCollectorId = $null
$configMatchesWorkstation = $false
$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

if ($configExists) {
    try {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        $configWorkstationId = [string]$config.workstationId
        $configCollectorId = [string]$config.collectorId
        $configMatchesWorkstation =
            -not [string]::IsNullOrWhiteSpace($configWorkstationId) -and
            $configWorkstationId.Trim().ToLowerInvariant() -eq $identity.WorkstationId.ToLowerInvariant()
    }
    catch {
        $errors.Add("Collector config could not be parsed: $($_.Exception.Message)")
    }
}
else {
    $errors.Add("Collector config was not found.")
}

$daemonRunning = Test-DaemonRunning -DaemonScriptPath $daemonScript -CollectorConfigPath $ConfigPath
$startedNow = $false
$startupMode = if ($task) {
    "scheduled_task"
}
elseif ($runKeyValue) {
    "run_key"
}
else {
    "none"
}

if (-not $task -and -not $runKeyValue) {
    $warnings.Add("No collector startup registration was found.")
}
if ($task -and -not $checkTask) {
    $warnings.Add("Collector startup task exists, but the periodic health-check task is missing.")
}
if ($configExists -and -not $configMatchesWorkstation) {
    $warnings.Add(
        "Collector config workstation '$configWorkstationId' does not match current workstation '$($identity.WorkstationId)'."
    )
}

if (
    $StartIfMissing -and
    $configExists -and
    $configMatchesWorkstation -and
    -not $daemonRunning
) {
    if ($task) {
        try {
            Start-ScheduledTask -TaskName $TaskName | Out-Null
            $startedNow = $true
        }
        catch {
            $warnings.Add("Scheduled task start failed: $($_.Exception.Message). Falling back to direct launch.")
        }
    }

    if (-not $startedNow) {
        Start-CollectorDaemonProcess `
            -DaemonScriptPath $daemonScript `
            -CollectorConfigPath $ConfigPath `
            -TomlPath $CodexConfigPath `
            -NamedMutex $MutexName
        $startedNow = $true
    }

    Start-Sleep -Seconds 2
    $daemonRunning = Test-DaemonRunning -DaemonScriptPath $daemonScript -CollectorConfigPath $ConfigPath
}

$result = [ordered]@{
    ok = $true
    workstationId = $identity.WorkstationId
    workstationLabel = $identity.WorkstationLabel
    workstationRole = $identity.WorkstationRole
    computerName = $identity.ComputerName
    configPath = $ConfigPath
    collectorId = $configCollectorId
    configExists = $configExists
    configWorkstationId = $configWorkstationId
    configMatchesWorkstation = $configMatchesWorkstation
    startupMode = $startupMode
    startupTaskName = $TaskName
    startupTaskExists = [bool]$task
    startupTaskState = if ($task) { [string]$task.State } else { $null }
    startupCheckTaskName = $CheckTaskName
    startupCheckTaskExists = [bool]$checkTask
    runKeyName = $RunKeyName
    runKeyExists = -not [string]::IsNullOrWhiteSpace($runKeyValue)
    daemonScript = $daemonScript
    daemonRunning = $daemonRunning
    startedNow = $startedNow
    mutexName = $MutexName
    healthy = (
        $configExists -and
        $configMatchesWorkstation -and
        $daemonRunning -and
        ($task -or $runKeyValue)
    )
    warnings = $warnings
    errors = $errors
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $status = if ($result.healthy) { "healthy" } else { "needs_attention" }
    Write-Host "Watchdog collector startup: $status"
    Write-Host "Workstation: $($result.workstationId)"
    Write-Host "Config: $($result.configPath)"
    Write-Host "Startup mode: $($result.startupMode)"
    Write-Host "Daemon running: $($result.daemonRunning)"
    if ($warnings.Count -gt 0) {
        Write-Host "Warnings:"
        foreach ($warning in $warnings) {
            Write-Host " - $warning"
        }
    }
    if ($errors.Count -gt 0) {
        Write-Host "Errors:"
        foreach ($errorMessage in $errors) {
            Write-Host " - $errorMessage"
        }
    }
}

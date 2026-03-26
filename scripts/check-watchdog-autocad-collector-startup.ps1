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
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
. $runtimeSharedScript
$daemonScript = (Resolve-Path (Join-Path $PSScriptRoot "watchdog-autocad-collector-daemon.ps1")).Path
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
. $processUtilsScript
$localAppData = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
else {
    Join-Path $env:USERPROFILE "AppData\Local"
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$slug = Convert-ToSlug -Value $identity.WorkstationId

if (-not $ConfigPath) {
    $ConfigPath = Join-Path `
        (Join-Path $localAppData "Suite\watchdog-autocad-collector\config") `
        "$($identity.WorkstationId)-autocad.json"
}
$ConfigPath = Resolve-AbsolutePath -PathValue $ConfigPath -RepoRoot $repoRoot

if (-not $TaskName) {
    $TaskName = "SuiteWatchdogAutoCADCollector-$($identity.WorkstationId)"
}
if (-not $CheckTaskName) {
    $CheckTaskName = "SuiteWatchdogAutoCADCollectorCheck-$($identity.WorkstationId)"
}
if (-not $RunKeyName) {
    $RunKeyName = $TaskName
}
if (-not $MutexName) {
    $MutexName = "Local\SuiteWatchdogAutoCADCollectorDaemon-$slug"
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
            -WorkingDirectory $repoRoot `
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
    Write-Host "Watchdog AutoCAD collector startup: $status"
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

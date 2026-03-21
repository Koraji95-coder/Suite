[CmdletBinding()]
param(
    [string]$BackendUrl,
    [string]$ApiKey,
    [string]$BearerToken,
    [string[]]$Roots,
    [string]$ConfigPath,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [string]$CollectorId,
    [string]$TaskName,
    [string]$CheckTaskName,
    [string]$RunKeyName,
    [ValidateRange(5, 1440)][int]$CheckIntervalMinutes = 15,
    [switch]$ForceRunKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$daemonScript = (Resolve-Path (Join-Path $PSScriptRoot "watchdog-filesystem-collector-daemon.ps1")).Path
$checkScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-filesystem-collector-startup.ps1")).Path
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
. $processUtilsScript
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

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not $Path -or -not (Test-Path $Path)) {
        return $null
    }

    $pattern = "^\s*$([Regex]::Escape($Key))=(.*)$"
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

function Install-RunKeyFallback {
    param(
        [string]$RunKeyEntryName,
        [string]$DaemonConfigPath,
        [string]$TomlPath,
        [string]$NamedMutex
    )

    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $runValue = (
        "PowerShell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass " +
        "-File `"$daemonScript`" -ConfigPath `"$DaemonConfigPath`" " +
        "-CodexConfigPath `"$TomlPath`" -MutexName `"$NamedMutex`""
    )

    if (-not (Test-Path $runKeyPath)) {
        New-Item -Path $runKeyPath -Force | Out-Null
    }
    New-ItemProperty -Path $runKeyPath -Name $RunKeyEntryName -Value $runValue -PropertyType String -Force | Out-Null

    Start-SuiteDetachedProcess -FilePath "PowerShell.exe" -WorkingDirectory $repoRoot -Arguments @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        $daemonScript,
        "-ConfigPath",
        $DaemonConfigPath,
        "-CodexConfigPath",
        $TomlPath,
        "-MutexName",
        $NamedMutex
    ) | Out-Null

    Write-Host "Installed HKCU Run startup entry '$RunKeyEntryName'."
}

$identity = Get-WorkstationIdentity -TomlPath $CodexConfigPath -ExplicitWorkstationId $WorkstationId
$slug = Convert-ToSlug -Value $identity.WorkstationId
$dotenvPath = Join-Path $repoRoot ".env"

if (-not $BackendUrl) {
    $BackendUrl =
        [string](Get-DotEnvValue -Path $dotenvPath -Key "VITE_BACKEND_URL")
}
if (-not $BackendUrl) {
    $BackendUrl =
        [string](Get-DotEnvValue -Path $dotenvPath -Key "VITE_COORDINATES_BACKEND_URL")
}
if (-not $BackendUrl) {
    $BackendUrl = "http://127.0.0.1:5000"
}

if (-not $ApiKey) {
    $ApiKey = [string](Get-DotEnvValue -Path $dotenvPath -Key "API_KEY")
}

if ((-not $ApiKey) -and (-not $BearerToken)) {
    throw "Collector startup requires API_KEY or BearerToken. No credential was provided or found in .env."
}

if (-not $Roots -or $Roots.Count -eq 0) {
    $Roots = @($repoRoot)
}
$normalizedRoots = @()
foreach ($root in $Roots) {
    $resolved = Resolve-AbsolutePath -PathValue $root
    if ($resolved) {
        $normalizedRoots += $resolved
    }
}

if (-not $CollectorId) {
    $CollectorId = "watchdog-fs-$slug"
}
if (-not $ConfigPath) {
    $ConfigPath = Join-Path `
        (Join-Path $localAppData "Suite\watchdog-collector\config") `
        "$($identity.WorkstationId).json"
}
if (-not $TaskName) {
    $TaskName = "SuiteWatchdogFilesystemCollector-$($identity.WorkstationId)"
}
if (-not $CheckTaskName) {
    $CheckTaskName = "SuiteWatchdogFilesystemCollectorCheck-$($identity.WorkstationId)"
}
if (-not $RunKeyName) {
    $RunKeyName = $TaskName
}

$ConfigPath = Resolve-AbsolutePath -PathValue $ConfigPath
$configDir = Split-Path -Parent $ConfigPath
$stateDir = Join-Path (Join-Path $localAppData "Suite\watchdog-collector\state") $CollectorId
$mutexName = "Local\SuiteWatchdogFilesystemCollectorDaemon-$slug"
$null = New-Item -ItemType Directory -Path $configDir -Force
$null = New-Item -ItemType Directory -Path $stateDir -Force

$configPayload = [ordered]@{
    backendUrl = $BackendUrl
    apiKey = if ($ApiKey) { $ApiKey } else { $null }
    bearerToken = if ($BearerToken) { $BearerToken } else { $null }
    collectorId = $CollectorId
    collectorName = if ($identity.WorkstationLabel) {
        "$($identity.WorkstationLabel) Filesystem Collector"
    }
    else {
        "$($identity.WorkstationId) Filesystem Collector"
    }
    collectorType = "filesystem"
    workstationId = $identity.WorkstationId
    roots = $normalizedRoots
    includeGlobs = @()
    excludeGlobs = @(
        "**/.git/**",
        "**/node_modules/**",
        "**/.venv/**",
        "**/__pycache__/**",
        "**/coverage/**",
        "**/dist/**"
    )
    heartbeatMs = 15000
    scanIntervalMs = 5000
    batchSize = 100
    bufferDir = $stateDir
    capabilities = @("filesystem")
    metadata = [ordered]@{
        workstationLabel = $identity.WorkstationLabel
        workstationRole = $identity.WorkstationRole
        repoRoot = $repoRoot
        installedAt = (Get-Date).ToString("o")
    }
}
$configPayload | ConvertTo-Json -Depth 8 | Set-Content -Path $ConfigPath -Encoding UTF8

if (-not $ForceRunKey) {
    $userId = if ($env:USERDOMAIN) {
        "$($env:USERDOMAIN)\$($env:USERNAME)"
    }
    else {
        $env:USERNAME
    }

    $daemonArgs = (
        "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass " +
        "-File `"$daemonScript`" -ConfigPath `"$ConfigPath`" " +
        "-CodexConfigPath `"$CodexConfigPath`" -MutexName `"$mutexName`""
    )
    $checkArgs = (
        "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass " +
        "-File `"$checkScript`" -ConfigPath `"$ConfigPath`" " +
        "-CodexConfigPath `"$CodexConfigPath`" -TaskName `"$TaskName`" " +
        "-CheckTaskName `"$CheckTaskName`" -RunKeyName `"$RunKeyName`" " +
        "-MutexName `"$mutexName`" -StartIfMissing"
    )

    try {
        $daemonAction = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $daemonArgs
        $daemonTrigger = New-ScheduledTaskTrigger -AtLogOn
        $daemonPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
        $daemonSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $daemonAction `
            -Trigger $daemonTrigger `
            -Principal $daemonPrincipal `
            -Settings $daemonSettings `
            -Description "Start the Suite Watchdog filesystem collector daemon for this workstation." `
            -ErrorAction Stop `
            -Force | Out-Null

        $repeatTrigger = New-ScheduledTaskTrigger `
            -Once `
            -At ((Get-Date).AddMinutes(1)) `
            -RepetitionInterval (New-TimeSpan -Minutes $CheckIntervalMinutes) `
            -RepetitionDuration (New-TimeSpan -Days 3650)
        $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
        $checkAction = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $checkArgs
        $checkSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

        Register-ScheduledTask `
            -TaskName $CheckTaskName `
            -Action $checkAction `
            -Trigger @($repeatTrigger, $logonTrigger) `
            -Principal $daemonPrincipal `
            -Settings $checkSettings `
            -Description "Verify the Suite Watchdog filesystem collector daemon is healthy and restart it if needed." `
            -ErrorAction Stop `
            -Force | Out-Null

        $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
        Remove-ItemProperty -Path $runKeyPath -Name $RunKeyName -ErrorAction SilentlyContinue

        Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        Start-ScheduledTask -TaskName $CheckTaskName -ErrorAction Stop

        Write-Host "Installed scheduled startup task '$TaskName'."
        Write-Host "Installed scheduled health-check task '$CheckTaskName'."
    }
    catch {
        Write-Warning "Scheduled task install failed; falling back to HKCU Run startup. $($_.Exception.Message)"
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $CheckTaskName -Confirm:$false -ErrorAction SilentlyContinue
        Install-RunKeyFallback `
            -RunKeyEntryName $RunKeyName `
            -DaemonConfigPath $ConfigPath `
            -TomlPath $CodexConfigPath `
            -NamedMutex $mutexName
    }
}
else {
    Install-RunKeyFallback `
        -RunKeyEntryName $RunKeyName `
        -DaemonConfigPath $ConfigPath `
        -TomlPath $CodexConfigPath `
        -NamedMutex $mutexName
}

& $checkScript `
    -ConfigPath $ConfigPath `
    -CodexConfigPath $CodexConfigPath `
    -TaskName $TaskName `
    -CheckTaskName $CheckTaskName `
    -RunKeyName $RunKeyName `
    -MutexName $mutexName `
    -StartIfMissing `
    -Json

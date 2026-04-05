[CmdletBinding()]
param(
    [string]$BackendUrl,
    [string]$ApiKey,
    [string]$BearerToken,
    [string]$ConfigPath,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [string]$CollectorId,
    [string]$TaskName,
    [string]$CheckTaskName,
    [string]$RunKeyName,
    [string]$StateJsonPath,
    [string]$BufferDir,
    [int]$HeartbeatMs = 15000,
    [int]$PollIntervalMs = 5000,
    [int]$BatchSize = 100,
    [ValidateRange(5, 1440)][int]$CheckIntervalMinutes = 15,
    [ValidateSet("Debug", "Release")][string]$PluginConfiguration = "Debug",
    [string]$AutoCadVersion,
    [string]$AutoCadInstallDir,
    [switch]$SkipPluginInstall,
    [switch]$ForceRunKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$daemonScript = (Resolve-Path (Join-Path $PSScriptRoot "watchdog-autocad-collector-daemon.ps1")).Path
$checkScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-collector-startup.ps1")).Path
$pluginInstallScript = (Resolve-Path (Join-Path $PSScriptRoot "install-watchdog-autocad-plugin.ps1")).Path
$pluginCheckScript = (Resolve-Path (Join-Path $PSScriptRoot "check-watchdog-autocad-plugin.ps1")).Path
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

function Invoke-JsonScript {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments
    )

    $processArgs = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $ScriptPath
    )
    if ($Arguments) {
        $processArgs += $Arguments
    }

    $output = & PowerShell.exe @processArgs 2>&1
    $exitCode = 0
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    if ($exitCodeVariable) {
        $exitCode = [int]$exitCodeVariable.Value
    }
    if ($exitCode -ne 0) {
        $errorText = [string]::Join([Environment]::NewLine, $output)
        throw "Script '$ScriptPath' exited with code $exitCode. $errorText"
    }

    $raw = [string]::Join([Environment]::NewLine, $output)
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "Script '$ScriptPath' returned no output."
    }
    return $raw | ConvertFrom-Json
}

function Invoke-PluginInstall {
    param(
        [string]$ScriptPath,
        [string]$BuildConfiguration,
        [string]$ResolvedAutoCadVersion,
        [string]$ResolvedAutoCadInstallDir
    )

    $processArgs = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $ScriptPath,
        "-Configuration",
        $BuildConfiguration
    )
    if (-not [string]::IsNullOrWhiteSpace($ResolvedAutoCadVersion)) {
        $processArgs += @("-AutoCadVersion", $ResolvedAutoCadVersion)
    }
    if (-not [string]::IsNullOrWhiteSpace($ResolvedAutoCadInstallDir)) {
        $processArgs += @("-AutoCadInstallDir", $ResolvedAutoCadInstallDir)
    }

    & PowerShell.exe @processArgs
    $exitCode = 0
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    if ($exitCodeVariable) {
        $exitCode = [int]$exitCodeVariable.Value
    }
    if ($exitCode -ne 0) {
        throw "Script '$ScriptPath' exited with code $exitCode."
    }
}

function Get-AutoCadStateJsonPath {
    if ($StateJsonPath) {
        return Resolve-AbsolutePath -PathValue $StateJsonPath
    }

    $appData = if ($env:APPDATA) {
        $env:APPDATA
    }
    else {
        Join-Path $env:USERPROFILE "AppData\Roaming"
    }
    $cadDir = Join-Path $appData "CadCommandCenter"
    return Resolve-AbsolutePath -PathValue (Join-Path $cadDir "tracker-state.json")
}

function Install-RunKeyFallback {
    param(
        [string]$RunKeyEntryName,
        [string]$LauncherPath,
        [string]$DaemonConfigPath,
        [string]$TomlPath,
        [string]$NamedMutex
    )

    $runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $runValue = (ConvertTo-SuiteProcessArgument -Value (Get-SuiteWindowsScriptHostExecutablePath)) + " " +
        (ConvertTo-SuiteProcessArgument -Value $LauncherPath)

    if (-not (Test-Path $runKeyPath)) {
        New-Item -Path $runKeyPath -Force | Out-Null
    }
    New-ItemProperty -Path $runKeyPath -Name $RunKeyEntryName -Value $runValue -PropertyType String -Force | Out-Null

    Start-SuiteDetachedProcess -FilePath (Get-SuiteWindowsScriptHostExecutablePath) -WorkingDirectory $repoRoot -Arguments @(
        $LauncherPath
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

$stateJsonPath = Get-AutoCadStateJsonPath

if (-not $CollectorId) {
    $CollectorId = if ($slug) { "autocad-$slug" } else { "autocad-collector" }
}
if (-not $ConfigPath) {
    $ConfigPath = Join-Path `
        (Join-Path $localAppData "Suite\watchdog-autocad-collector\config") `
        "$($identity.WorkstationId)-autocad.json"
}
if (-not $TaskName) {
    $TaskName = "SuiteWatchdogAutoCADCollector-$($identity.WorkstationId)"
}
if (-not $CheckTaskName) {
    $CheckTaskName = "SuiteWatchdogAutoCADCollectorCheck-$($identity.WorkstationId)"
}
if (-not $RunKeyName) {
    $RunKeyName = $TaskName
}
if (-not $BufferDir) {
    $BufferDir = Join-Path `
        (Join-Path $localAppData "Suite\watchdog-autocad-collector") `
        "$CollectorId"
}
if (-not $HeartbeatMs) {
    $HeartbeatMs = 15000
}
if (-not $PollIntervalMs) {
    $PollIntervalMs = 5000
}
if (-not $BatchSize) {
    $BatchSize = 100
}
$ConfigPath = Resolve-AbsolutePath -PathValue $ConfigPath
$bufferDir = Resolve-AbsolutePath -PathValue $BufferDir
$stateJsonPath = Resolve-AbsolutePath -PathValue $stateJsonPath
$configDir = Split-Path -Parent $ConfigPath
$mutexName = "Local\SuiteWatchdogAutoCADCollectorDaemon-$slug"
$null = New-Item -ItemType Directory -Path $configDir -Force
$null = New-Item -ItemType Directory -Path $bufferDir -Force

$configPayload = [ordered]@{
    backendUrl = $BackendUrl
    apiKey = if ($ApiKey) { $ApiKey } else { $null }
    bearerToken = if ($BearerToken) { $BearerToken } else { $null }
    collectorId = $CollectorId
    collectorName = if ($identity.WorkstationLabel) {
        "$($identity.WorkstationLabel) AutoCAD Collector"
    }
    else {
        "$($identity.WorkstationId) AutoCAD Collector"
    }
    collectorType = "autocad_state"
    workstationId = $identity.WorkstationId
    stateJsonPath = $stateJsonPath
    heartbeatMs = [int]$HeartbeatMs
    pollIntervalMs = [int]$PollIntervalMs
    batchSize = [int]$BatchSize
    bufferDir = $bufferDir
    capabilities = @("autocad", "drawing_sessions", "commands")
    metadata = [ordered]@{
        workstationLabel = $identity.WorkstationLabel
        workstationRole = $identity.WorkstationRole
        repoRoot = $repoRoot
        stateJsonPath = $stateJsonPath
        installedAt = (Get-Date).ToString("o")
    }
}
$configPayload | ConvertTo-Json -Depth 8 | Set-Content -Path $ConfigPath -Encoding UTF8

$launcherDir = Join-Path (Join-Path $localAppData "Suite\watchdog-autocad-collector") "launchers"
$daemonLauncherPath = Write-SuiteHiddenPowerShellLauncher `
    -LauncherPath (Join-Path $launcherDir "$TaskName.vbs") `
    -PowerShellScriptPath $daemonScript `
    -WorkingDirectory $repoRoot `
    -Arguments @(
        "-ConfigPath",
        $ConfigPath,
        "-CodexConfigPath",
        $CodexConfigPath,
        "-MutexName",
        $mutexName
    )
$checkLauncherPath = Write-SuiteHiddenPowerShellLauncher `
    -LauncherPath (Join-Path $launcherDir "$CheckTaskName.vbs") `
    -PowerShellScriptPath $checkScript `
    -WorkingDirectory $repoRoot `
    -Arguments @(
        "-ConfigPath",
        $ConfigPath,
        "-CodexConfigPath",
        $CodexConfigPath,
        "-TaskName",
        $TaskName,
        "-CheckTaskName",
        $CheckTaskName,
        "-RunKeyName",
        $RunKeyName,
        "-MutexName",
        $mutexName,
        "-StartIfMissing"
    )

$staleLauncherRepairs = Repair-SuiteStaleLauncherTasks `
    -TaskNamePrefixes @("SuiteWatchdogAutoCADCollector-", "SuiteWatchdogAutoCADCollectorCheck-") `
    -KeepTaskNames @($TaskName, $CheckTaskName) `
    -LauncherDirectory $launcherDir `
    -Comment "Neutralized stale Suite Watchdog AutoCAD startup task launcher."

foreach ($repair in @($staleLauncherRepairs)) {
    Write-Warning "Neutralized stale AutoCAD watchdog startup launcher '$($repair.launcherPath)' still referenced by task '$($repair.taskName)'."
}

if (-not $ForceRunKey) {
    $userId = if ($env:USERDOMAIN) {
        "$($env:USERDOMAIN)\$($env:USERNAME)"
    }
    else {
        $env:USERNAME
    }

    try {
        $daemonAction = New-ScheduledTaskAction `
            -Execute (Get-SuiteWindowsScriptHostExecutablePath) `
            -Argument (ConvertTo-SuiteProcessArgument -Value $daemonLauncherPath)
        $daemonTrigger = New-ScheduledTaskTrigger -AtLogOn
        $daemonPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
        $daemonSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $daemonAction `
            -Trigger $daemonTrigger `
            -Principal $daemonPrincipal `
            -Settings $daemonSettings `
            -Description "Start the Suite Watchdog AutoCAD collector daemon for this workstation." `
            -ErrorAction Stop `
            -Force | Out-Null

        $repeatTrigger = New-ScheduledTaskTrigger `
            -Once `
            -At ((Get-Date).AddMinutes(1)) `
            -RepetitionInterval (New-TimeSpan -Minutes $CheckIntervalMinutes) `
            -RepetitionDuration (New-TimeSpan -Days 3650)
        $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
        $checkAction = New-ScheduledTaskAction `
            -Execute (Get-SuiteWindowsScriptHostExecutablePath) `
            -Argument (ConvertTo-SuiteProcessArgument -Value $checkLauncherPath)
        $checkSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

        Register-ScheduledTask `
            -TaskName $CheckTaskName `
            -Action $checkAction `
            -Trigger @($repeatTrigger, $logonTrigger) `
            -Principal $daemonPrincipal `
            -Settings $checkSettings `
            -Description "Verify the Suite Watchdog AutoCAD collector daemon is healthy and restart it if needed." `
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
            -LauncherPath $daemonLauncherPath `
            -DaemonConfigPath $ConfigPath `
            -TomlPath $CodexConfigPath `
            -NamedMutex $mutexName
    }
}
else {
    Install-RunKeyFallback `
        -RunKeyEntryName $RunKeyName `
        -LauncherPath $daemonLauncherPath `
        -DaemonConfigPath $ConfigPath `
        -TomlPath $CodexConfigPath `
        -NamedMutex $mutexName
}

$pluginInstallAttempted = $false
$pluginInstallOk = $false
$pluginInstallError = $null
$pluginWasAlreadyHealthy = $false
$pluginCheckArguments = @("-Json")

try {
    $pluginCheckResult = Invoke-JsonScript -ScriptPath $pluginCheckScript -Arguments $pluginCheckArguments
    $pluginWasAlreadyHealthy = [bool]$pluginCheckResult.ok
}
catch {
    $pluginCheckResult = [pscustomobject]@{
        ok = $false
        errors = @("Initial plugin check failed: $($_.Exception.Message)")
    }
}

if ((-not $SkipPluginInstall) -and (-not $pluginWasAlreadyHealthy)) {
    $pluginInstallAttempted = $true
    try {
        Invoke-PluginInstall `
            -ScriptPath $pluginInstallScript `
            -BuildConfiguration $PluginConfiguration `
            -ResolvedAutoCadVersion $AutoCadVersion `
            -ResolvedAutoCadInstallDir $AutoCadInstallDir
        $pluginInstallOk = $true
        Write-Host "Ensured AutoCAD plugin bundle is installed for Watchdog."
    }
    catch {
        $pluginInstallError = $_.Exception.Message
        Write-Warning "AutoCAD plugin install failed during collector startup setup. $pluginInstallError"
    }
}

$startupResult = Invoke-JsonScript `
    -ScriptPath $checkScript `
    -Arguments @(
        "-ConfigPath", $ConfigPath,
        "-CodexConfigPath", $CodexConfigPath,
        "-TaskName", $TaskName,
        "-CheckTaskName", $CheckTaskName,
        "-RunKeyName", $RunKeyName,
        "-MutexName", $mutexName,
        "-StartIfMissing",
        "-Json"
    )

try {
    $pluginCheckResult = Invoke-JsonScript -ScriptPath $pluginCheckScript -Arguments $pluginCheckArguments
}
catch {
    $pluginCheckResult = [pscustomobject]@{
        ok = $false
        errors = @("Plugin check failed after startup install: $($_.Exception.Message)")
    }
}

$result = [ordered]@{}
foreach ($property in $startupResult.PSObject.Properties) {
    $result[$property.Name] = $property.Value
}
$result["pluginInstallAttempted"] = $pluginInstallAttempted
$result["pluginInstallOk"] = $pluginInstallOk
$result["pluginInstallError"] = $pluginInstallError
$result["pluginWasAlreadyHealthy"] = $pluginWasAlreadyHealthy
$result["plugin"] = $pluginCheckResult
$result["overallHealthy"] = [bool]($startupResult.healthy -and $pluginCheckResult.ok)

$result | ConvertTo-Json -Depth 8

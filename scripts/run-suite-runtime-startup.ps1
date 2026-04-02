[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$Notify,
    [ValidateRange(30, 600)][int]$DockerReadyTimeoutSeconds = 180,
    [ValidateRange(1, 5)][int]$BootstrapAttempts = 3,
    [ValidateRange(5, 120)][int]$RetryDelaySeconds = 20,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$bootstrapScript = (Resolve-Path (Join-Path $PSScriptRoot "bootstrap-suite-runtime.ps1")).Path
$bootstrapStateScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-bootstrap-state.ps1")).Path
$logUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-log-utils.ps1")).Path
$retentionScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-retention.ps1")).Path
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
$workstationConfigScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-workstation-config.ps1")).Path
$workstationProfileScript = (Resolve-Path (Join-Path $PSScriptRoot "sync-suite-workstation-profile.ps1")).Path
$runtimeStatusScript = (Resolve-Path (Join-Path $PSScriptRoot "get-suite-runtime-status.ps1")).Path
$notificationScript = Join-Path $PSScriptRoot "show-windows-notification.ps1"
$statusBase = if ($env:LOCALAPPDATA) {
    $env:LOCALAPPDATA
}
elseif ($env:TEMP) {
    $env:TEMP
}
else {
    $env:USERPROFILE
}
$statusDir = Join-Path $statusBase "Suite\runtime-bootstrap"
$statusPath = Join-Path $statusDir "last-bootstrap.json"
$currentBootstrapPath = Join-Path $statusDir "current-bootstrap.json"
$logPath = Join-Path $statusDir "bootstrap.log"
New-Item -ItemType Directory -Path $statusDir -Force | Out-Null

. $bootstrapStateScript
. $logUtilsScript
. $retentionScript
. $runtimeSharedScript
. $processUtilsScript
. $workstationConfigScript

function Write-StatusLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("SYS", "INFO", "OK", "WARN", "ERR", "START")][string]$Tag = "SYS"
    )

    Write-SuiteRuntimeTranscriptEntry -Path $logPath -Message $Message -Tag $Tag
}

try {
    $retentionResult = Invoke-SuiteRuntimeArtifactRetention -BaseDirectory $statusBase
    foreach ($warning in @($retentionResult.Warnings)) {
        Write-StatusLog -Message "Runtime artifact retention warning: $warning" -Tag "WARN"
    }
}
catch {
    Write-StatusLog -Message "Runtime artifact retention warning: $($_.Exception.Message)" -Tag "WARN"
}

function Get-OutputTail {
    param(
        [string]$Text,
        [int]$LineCount = 12
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $lines = $Text -split "`r?`n"
    return [string]::Join([Environment]::NewLine, ($lines | Select-Object -Last $LineCount)).Trim()
}

function Resolve-DockerDesktopExecutable {
    $candidates = @(
        (Join-Path ${env:ProgramFiles} "Docker\Docker\Docker Desktop.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\Docker Desktop.exe")
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Invoke-DockerDesktopStartCommand {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $rawOutput = & docker desktop start --detach 2>&1
        $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
        $outputText = [string]::Join(
            [Environment]::NewLine,
            @(
                $rawOutput | ForEach-Object {
                    if ($null -eq $_) { "" } else { $_.ToString() }
                }
            )
        ).Trim()

        return [pscustomobject]@{
            Ok = ($exitCode -eq 0)
            ExitCode = $exitCode
            OutputText = $outputText
            OutputTail = Get-OutputTail -Text $outputText
        }
    }
    catch {
        return [pscustomobject]@{
            Ok = $false
            ExitCode = 1
            OutputText = $_.Exception.Message
            OutputTail = Get-OutputTail -Text $_.Exception.Message
        }
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Get-DockerDesktopProcessInfo {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'Docker Desktop.exe' OR Name = 'com.docker.backend.exe'" -ErrorAction SilentlyContinue
    $desktopProcess = @($processes | Where-Object { $_.Name -eq "Docker Desktop.exe" } | Select-Object -First 1)
    $backendProcess = @($processes | Where-Object { $_.Name -eq "com.docker.backend.exe" } | Select-Object -First 1)

    [pscustomobject]@{
        DesktopRunning = ($desktopProcess.Count -gt 0)
        DesktopProcessId = if ($desktopProcess.Count -gt 0) { [int]$desktopProcess[0].ProcessId } else { $null }
        BackendRunning = ($backendProcess.Count -gt 0)
        BackendProcessId = if ($backendProcess.Count -gt 0) { [int]$backendProcess[0].ProcessId } else { $null }
    }
}

function Test-DockerReady {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $rawOutput = & docker version --format "{{.Server.Version}}" 2>&1
        $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
        $outputText = [string]::Join(
            [Environment]::NewLine,
            @(
                $rawOutput | ForEach-Object {
                    if ($null -eq $_) { "" } else { $_.ToString() }
                }
            )
        ).Trim()

        return (
            $exitCode -eq 0 -and
            -not [string]::IsNullOrWhiteSpace($outputText) -and
            $outputText -notmatch "(?i)failed to connect"
        )
    }
    catch {
        return $false
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Ensure-DockerRuntime {
    $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $dockerCommand) {
        $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    }

    if (-not $dockerCommand) {
        return [pscustomobject]@{
            ok = $false
            ready = $false
            serviceStarted = $false
            desktopLaunched = $false
            message = "Docker CLI is not available on PATH."
        }
    }

    if (Test-DockerReady) {
        return [pscustomobject]@{
            ok = $true
            ready = $true
            serviceStarted = $false
            desktopLaunched = $false
            desktopRunning = $true
            desktopProcessId = $null
            backendRunning = $true
            backendProcessId = $null
            message = "Docker engine is already ready."
        }
    }

    $serviceStarted = $false
    $desktopLaunched = $false
    $desktopProcessInfo = Get-DockerDesktopProcessInfo

    $dockerService = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
    if ($dockerService -and $dockerService.Status -ne "Running") {
        try {
            Start-Service -Name "com.docker.service" -ErrorAction Stop
            $serviceStarted = $true
        }
        catch {
            Write-StatusLog -Tag "WARN" -Message "Docker service start warning: $($_.Exception.Message)"
        }
    }

    $desktopExecutable = Resolve-DockerDesktopExecutable
    if ($desktopExecutable -and -not $desktopProcessInfo.DesktopRunning) {
        $dockerDesktopStart = Invoke-DockerDesktopStartCommand
        if ($dockerDesktopStart.Ok) {
            $desktopLaunched = $true
            Write-StatusLog -Tag "INFO" -Message "Docker Desktop start requested through the Docker CLI."
            if (-not [string]::IsNullOrWhiteSpace($dockerDesktopStart.OutputTail)) {
                Write-StatusLog -Tag "INFO" -Message $dockerDesktopStart.OutputTail
            }
        }
        else {
            if (-not [string]::IsNullOrWhiteSpace($dockerDesktopStart.OutputTail)) {
                Write-StatusLog -Tag "WARN" -Message "Docker Desktop CLI start warning: $($dockerDesktopStart.OutputTail)"
            }

            try {
                Start-SuiteDetachedProcess -FilePath $desktopExecutable | Out-Null
                $desktopLaunched = $true
                Write-StatusLog -Tag "INFO" -Message "Docker Desktop launch requested."
            }
            catch {
                Write-StatusLog -Tag "WARN" -Message "Docker Desktop launch warning: $($_.Exception.Message)"
            }
        }
    }
    elseif (-not $desktopExecutable -and -not $desktopProcessInfo.DesktopRunning) {
        $dockerDesktopStart = Invoke-DockerDesktopStartCommand
        if ($dockerDesktopStart.Ok) {
            $desktopLaunched = $true
            Write-StatusLog -Tag "INFO" -Message "Docker Desktop start requested through the Docker CLI."
            if (-not [string]::IsNullOrWhiteSpace($dockerDesktopStart.OutputTail)) {
                Write-StatusLog -Tag "INFO" -Message $dockerDesktopStart.OutputTail
            }
        }
        elseif (-not [string]::IsNullOrWhiteSpace($dockerDesktopStart.OutputTail)) {
            Write-StatusLog -Tag "WARN" -Message "Docker Desktop CLI start warning: $($dockerDesktopStart.OutputTail)"
        }
    }
    elseif ($desktopProcessInfo.DesktopRunning) {
        Write-StatusLog -Tag "INFO" -Message ("Docker Desktop is already starting. PID={0}" -f $desktopProcessInfo.DesktopProcessId)
    }

    $deadline = (Get-Date).AddSeconds($DockerReadyTimeoutSeconds)
    do {
        Start-Sleep -Seconds 5
        if (Test-DockerReady) {
            $desktopProcessInfo = Get-DockerDesktopProcessInfo
            return [pscustomobject]@{
                ok = $true
                ready = $true
                serviceStarted = $serviceStarted
                desktopLaunched = $desktopLaunched
                desktopRunning = $desktopProcessInfo.DesktopRunning
                desktopProcessId = $desktopProcessInfo.DesktopProcessId
                backendRunning = $desktopProcessInfo.BackendRunning
                backendProcessId = $desktopProcessInfo.BackendProcessId
                message = "Docker engine is ready."
            }
        }
    } while ((Get-Date) -lt $deadline)

    $desktopProcessInfo = Get-DockerDesktopProcessInfo
    $message = if ($desktopProcessInfo.DesktopRunning -or $desktopProcessInfo.BackendRunning) {
        "Docker Desktop started but the engine did not become ready within $DockerReadyTimeoutSeconds seconds."
    }
    elseif ($desktopExecutable) {
        "Docker Desktop is installed but did not stay running long enough for the engine to become ready."
    }
    else {
        "Docker Desktop executable was not found and the engine did not become ready."
    }

    return [pscustomobject]@{
        ok = $false
        ready = $false
        serviceStarted = $serviceStarted
        desktopLaunched = $desktopLaunched
        desktopRunning = $desktopProcessInfo.DesktopRunning
        desktopProcessId = $desktopProcessInfo.DesktopProcessId
        backendRunning = $desktopProcessInfo.BackendRunning
        backendProcessId = $desktopProcessInfo.BackendProcessId
        message = $message
    }
}

function Invoke-JsonPowerShellFile {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments
    )

    try {
        $rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $ScriptPath @Arguments 2>&1
        $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
        $outputText = [string]::Join(
            [Environment]::NewLine,
            @(
                $rawOutput | ForEach-Object {
                    if ($null -eq $_) { "" } else { $_.ToString() }
                }
            )
        ).Trim()
    }
    catch {
        $exitCode = 1
        $outputText = $_.Exception.Message
    }

    $payload = $null
    if (-not [string]::IsNullOrWhiteSpace($outputText)) {
        try {
            $payload = $outputText | ConvertFrom-Json
        }
        catch {
            $payload = $null
        }
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Ok = ($exitCode -eq 0)
        OutputText = $outputText
        OutputTail = Get-OutputTail -Text $outputText
        Payload = $payload
    }
}

function Show-Notification {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("Info", "Warning", "Error")][string]$Level = "Info"
    )

    if (-not $Notify -or -not (Test-Path $notificationScript)) {
        return
    }

    try {
        & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $notificationScript `
            -Title $Title `
            -Message $Message `
            -Level $Level | Out-Null
    }
    catch {
        Write-StatusLog -Tag "WARN" -Message "Notification warning: $($_.Exception.Message)"
    }
}

function Remove-OfficeIndependentStartup {
	try {
		if (Remove-SuiteCompanionAppRunKeyEntry -CompanionAppId "office") {
			Write-StatusLog -Tag "INFO" -Message "Removed independent Office startup entry so Runtime Control remains the single startup owner."
		}
	}
	catch {
		Write-StatusLog -Tag "WARN" -Message "Office startup cleanup warning: $($_.Exception.Message)"
	}
}

function Remove-SupabaseRemotePreflightStartup {
	try {
		$result = Remove-SuiteSupabaseRemotePreflightStartup
		if ($result.removed) {
			Write-StatusLog -Tag "INFO" -Message "Removed SuiteSupabaseRemotePreflight from Windows login startup so Runtime Control remains the single startup owner."
		}
	}
	catch {
		Write-StatusLog -Tag "WARN" -Message "Supabase remote preflight startup cleanup warning: $($_.Exception.Message)"
	}
}

function Wait-ForCompanionRuntimeGate {
	param(
		[ValidateRange(15, 300)][int]$TimeoutSeconds = 90
	)

	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	do {
		$statusResult = Invoke-JsonPowerShellFile -ScriptPath $runtimeStatusScript -Arguments @("-RepoRoot", $resolvedRepoRoot, "-Json")
		if ($statusResult.Ok -and $statusResult.Payload) {
			$doctorState = [string]$statusResult.Payload.doctor.overallState
			$backendReady = [bool](@($statusResult.Payload.services | Where-Object { $_.id -eq "backend" -and $_.state -eq "running" }).Count -gt 0)
			$gatewayReady = [bool](@($statusResult.Payload.services | Where-Object { $_.id -eq "gateway" -and $_.state -eq "running" }).Count -gt 0)
			if ($backendReady -and $gatewayReady -and $doctorState -ne "unavailable") {
				return [pscustomobject]@{
					ok = $true
					payload = $statusResult.Payload
				}
			}
		}

		Start-Sleep -Seconds 3
	}
	while ((Get-Date) -lt $deadline)

	return [pscustomobject]@{
		ok = $false
		payload = if ($statusResult) { $statusResult.Payload } else { $null }
	}
}

function Launch-ManagedOfficeCompanion {
	Write-StatusLog -Tag "INFO" -Message "Legacy Office standalone startup is retired. Office now runs inside Suite Runtime Control through the local broker."
}

function Sync-OfficeWorkspaceConfiguration {
    $officeRoots = Ensure-SuiteOfficeWorkspaceRoots
    $resolvedOfficeRoot = Resolve-SuitePreferredDailyRoot
    if ([string]::IsNullOrWhiteSpace($resolvedOfficeRoot) -or -not (Test-Path -LiteralPath $resolvedOfficeRoot -PathType Container)) {
        throw "Office repository root was not found: $resolvedOfficeRoot"
    }

    $dailyDeskSettingsDirectory = Join-Path $resolvedOfficeRoot "DailyDesk"
    $dailyDeskLocalSettingsPath = Join-Path $dailyDeskSettingsDirectory "dailydesk.settings.local.json"
    New-Item -ItemType Directory -Path $dailyDeskSettingsDirectory -Force | Out-Null
    ([ordered]@{
        suiteRepoPath = $resolvedRepoRoot
        knowledgeLibraryPath = $officeRoots.knowledgeRoot
        stateRootPath = $officeRoots.stateRoot
        additionalKnowledgePaths = @()
    } | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $dailyDeskLocalSettingsPath -Encoding UTF8

    $existingOfficeConfig = Read-SuiteCompanionAppLocalConfig -CompanionAppId "office"
    $brokerPublishPath = if ($existingOfficeConfig -and -not [string]::IsNullOrWhiteSpace([string]$existingOfficeConfig.brokerPublishPath)) {
        [string]$existingOfficeConfig.brokerPublishPath
    }
    else {
        $null
    }
    $officeConfigPath = Write-SuiteCompanionAppLocalConfig -CompanionAppId "office" -Config ([ordered]@{
        rootDirectory = $resolvedOfficeRoot
        configuredAt = (Get-Date).ToString("o")
        configuredBy = "scripts/run-suite-runtime-startup.ps1"
        suiteRoot = $resolvedRepoRoot
        dailyRoot = $resolvedOfficeRoot
        launchMode = "embedded_shell"
        legacyClientRetired = $true
        executablePath = $null
        brokerBaseUrl = "http://127.0.0.1:57420"
        brokerPublishPath = $brokerPublishPath
        brokerHealthPath = "/health"
        brokerStatePath = "/state"
        brokerEnabled = $true
        knowledgeLibraryPath = $officeRoots.knowledgeRoot
        stateRootPath = $officeRoots.stateRoot
        broker = [ordered]@{
            enabled = $true
            baseUrl = "http://127.0.0.1:57420"
            publishPath = $brokerPublishPath
            healthPath = "/health"
            statePath = "/state"
            prefixes = @("", "/api", "/api/office", "/office")
        }
    })

    return [pscustomobject]@{
        officeRoot = $resolvedOfficeRoot
        knowledgeRoot = $officeRoots.knowledgeRoot
        stateRoot = $officeRoots.stateRoot
        localSettingsPath = $dailyDeskLocalSettingsPath
        companionConfigPath = $officeConfigPath
    }
}

$attemptPayloads = @()
$dockerStatus = $null
$bootstrapResult = $null
$bootstrapStartedAt = (Get-Date).ToString("o")
$preflightOk = $true
$preflightFailedStep = $null
$preflightSummary = $null

Save-SuiteRuntimeBootstrapState -Path $currentBootstrapPath -State ([ordered]@{
    running = $true
    done = $false
    ok = $false
    attempt = 0
    maxAttempts = $BootstrapAttempts
    currentStepId = "docker-ready"
    currentStepLabel = "Checking Docker and local runtime prerequisites."
    completedStepIds = @()
    failedStepIds = @()
    percent = 0
    summary = "Checking Docker and local runtime prerequisites."
    startedAt = $bootstrapStartedAt
    updatedAt = $bootstrapStartedAt
}) | Out-Null

Remove-OfficeIndependentStartup
Remove-SupabaseRemotePreflightStartup

try {
    $workstationSync = Invoke-JsonPowerShellFile -ScriptPath $workstationProfileScript -Arguments @(
        "-RepoRoot", $resolvedRepoRoot,
        "-Json"
    )
    $workstationSyncOk = $workstationSync.Ok -and $workstationSync.Payload -and [bool]$workstationSync.Payload.ok
    if ($workstationSyncOk) {
        $workstationLabelParts = @(
            [string]$workstationSync.Payload.workstationId
            [string]$workstationSync.Payload.workstationLabel
            [string]$workstationSync.Payload.workstationRole
        ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        $workstationLabel = if ($workstationLabelParts.Count -gt 0) {
            [string]::Join(" | ", $workstationLabelParts)
        }
        else {
            "Workstation profile applied."
        }
        Write-StatusLog -Tag "OK" -Message "Workstation identity stamped: $workstationLabel"
    }
    else {
        $preflightOk = $false
        $preflightFailedStep = "workstation-profile"
        $preflightSummary = if (-not [string]::IsNullOrWhiteSpace([string]$workstationSync.OutputTail)) {
            "Workstation profile apply failed. $([string]$workstationSync.OutputTail)"
        }
        else {
            "Workstation profile apply failed."
        }
        Write-StatusLog -Tag "ERR" -Message $preflightSummary
    }
}
catch {
    $preflightOk = $false
    $preflightFailedStep = "workstation-profile"
    $preflightSummary = "Workstation profile apply failed. $($_.Exception.Message)"
    Write-StatusLog -Tag "ERR" -Message $preflightSummary
}

if ($preflightOk) {
    try {
        $officeWorkspace = Sync-OfficeWorkspaceConfiguration
        Write-StatusLog -Tag "OK" -Message "Office workspace roots ready: $($officeWorkspace.knowledgeRoot) | $($officeWorkspace.stateRoot)"
        Write-StatusLog -Tag "INFO" -Message "Office settings override synced: $($officeWorkspace.localSettingsPath)"
    }
    catch {
        $preflightOk = $false
        $preflightFailedStep = "office-roots"
        $preflightSummary = "Office Dropbox workspace roots could not be prepared. $($_.Exception.Message)"
        Write-StatusLog -Tag "ERR" -Message $preflightSummary
    }
}

for ($attempt = 1; $preflightOk -and $attempt -le $BootstrapAttempts; $attempt += 1) {
    Write-StatusLog -Tag "START" -Message "Bootstrap attempt $attempt started."
    $attemptSummary = if ($attempt -gt 1) {
        "Retrying bootstrap (attempt $attempt/$BootstrapAttempts)."
    }
    else {
        "Bootstrap attempt $attempt/$BootstrapAttempts started."
    }
    Update-SuiteRuntimeBootstrapState -Path $currentBootstrapPath -Properties ([ordered]@{
        running = $true
        done = $false
        ok = $false
        attempt = $attempt
        maxAttempts = $BootstrapAttempts
        currentStepId = "docker-ready"
        currentStepLabel = "Checking Docker and local runtime prerequisites."
        summary = $attemptSummary
    }) -ResetFailedStepIds | Out-Null
    $bootstrapResult = $null
    $dockerStatus = Ensure-DockerRuntime
    $dockerTag = if ($dockerStatus.ok) { "INFO" } else { "WARN" }
    Write-StatusLog -Tag $dockerTag -Message ("Docker status for attempt {0}: {1}" -f $attempt, $dockerStatus.message)

    if (-not $dockerStatus.ok) {
        $retryPending = $attempt -lt $BootstrapAttempts
        $dockerStepLabel = if ($retryPending) {
            "Waiting for Docker engine."
        }
        else {
            "Docker engine did not become ready."
        }
        $dockerSummary = if ($retryPending) {
            "{0} Retrying bootstrap (attempt {1}/{2})." -f $dockerStatus.message, ($attempt + 1), $BootstrapAttempts
        }
        else {
            [string]$dockerStatus.message
        }
        Update-SuiteRuntimeBootstrapState -Path $currentBootstrapPath -Properties ([ordered]@{
            currentStepId = "docker-ready"
            currentStepLabel = $dockerStepLabel
            summary = $dockerSummary
        }) -AddFailedStepIds $(if ($retryPending) { @() } else { @("docker-ready") }) | Out-Null
        $attemptPayloads += [pscustomobject]@{
            attempt = $attempt
            docker = $dockerStatus
            bootstrapOk = $false
            outputTail = $dockerStatus.message
            payload = $null
        }

        if ($attempt -lt $BootstrapAttempts) {
            Write-StatusLog -Tag "WARN" -Message ("Skipping runtime bootstrap for attempt {0} because Docker is not ready yet." -f $attempt)
            Start-Sleep -Seconds $RetryDelaySeconds
            continue
        }
    }

    if ($dockerStatus.ok) {
        Update-SuiteRuntimeBootstrapState -Path $currentBootstrapPath -Properties ([ordered]@{
            currentStepId = "docker-ready"
            currentStepLabel = "Docker engine is ready."
            summary = "Docker engine is ready."
        }) -AddCompletedStepIds @("docker-ready") -RemoveFailedStepIds @("docker-ready") | Out-Null
        $bootstrapResult = Invoke-JsonPowerShellFile -ScriptPath $bootstrapScript -Arguments @(
            "-RepoRoot", $resolvedRepoRoot,
            "-BootstrapLogPath", $logPath,
            "-CurrentBootstrapPath", $currentBootstrapPath,
            "-BootstrapAttempt", $attempt,
            "-BootstrapMaxAttempts", $BootstrapAttempts,
            "-Json"
        )
        $attemptPayloads += [pscustomobject]@{
            attempt = $attempt
            docker = $dockerStatus
            bootstrapOk = $bootstrapResult.Ok
            outputTail = $bootstrapResult.OutputTail
            payload = $bootstrapResult.Payload
        }
    }

    $bootstrapPayloadOk = $bootstrapResult -and $bootstrapResult.Ok -and $bootstrapResult.Payload -and [bool]$bootstrapResult.Payload.ok
    if ($dockerStatus.ok -and $bootstrapPayloadOk) {
        break
    }

    if ($attempt -lt $BootstrapAttempts) {
        Start-Sleep -Seconds $RetryDelaySeconds
    }
}

$bootstrapPayload = if ($bootstrapResult) { $bootstrapResult.Payload } else { $null }
$failedSteps = @()
if ($bootstrapPayload -and $bootstrapPayload.steps) {
    $failedSteps = @(
        $bootstrapPayload.steps |
            Where-Object { -not [bool]$_.ok } |
            ForEach-Object { [string]$_.name }
    )
}

$statusFailedSteps = if (-not $preflightOk -and -not [string]::IsNullOrWhiteSpace([string]$preflightFailedStep)) {
    @([string]$preflightFailedStep)
}
else {
    @($failedSteps)
}

$overallOk = [bool](
    $preflightOk -and
    $dockerStatus -and
    $dockerStatus.ok -and
    $bootstrapResult -and
    $bootstrapResult.Ok -and
    $bootstrapPayload -and
    [bool]$bootstrapPayload.ok
)
$summary = if ($overallOk) {
    "Suite runtime booted successfully."
}
elseif (-not $preflightOk -and -not [string]::IsNullOrWhiteSpace([string]$preflightSummary)) {
    [string]$preflightSummary
}
elseif ($failedSteps.Count -gt 0) {
    "Suite runtime needs attention: $([string]::Join(', ', $failedSteps))."
}
elseif ($dockerStatus -and -not $dockerStatus.ok) {
    $dockerStatus.message
}
else {
    "Suite runtime bootstrap did not finish successfully."
}

$bootstrapFailedStepIds = @()
if (-not $preflightOk -and -not [string]::IsNullOrWhiteSpace([string]$preflightFailedStep)) {
    $bootstrapFailedStepIds = @([string]$preflightFailedStep)
}
elseif ($failedSteps.Count -gt 0) {
    $bootstrapFailedStepIds = @($failedSteps)
}
elseif ($dockerStatus -and -not $dockerStatus.ok) {
    $bootstrapFailedStepIds = @("docker-ready")
}

$finalStepId = if ($overallOk) {
    $null
}
elseif ($bootstrapFailedStepIds.Count -gt 0) {
    [string]$bootstrapFailedStepIds[0]
}
else {
    $null
}
$finalStepLabel = if ([string]::IsNullOrWhiteSpace($finalStepId)) {
    $null
}
elseif ($finalStepId -eq "workstation-profile") {
    "Workstation profile"
}
elseif ($finalStepId -eq "office-roots") {
    "Office Dropbox roots"
}
else {
    Get-SuiteRuntimeBootstrapStepLabel -StepId $finalStepId
}

Update-SuiteRuntimeBootstrapState -Path $currentBootstrapPath -Properties ([ordered]@{
    running = $false
    done = $true
    ok = $overallOk
    currentStepId = $finalStepId
    currentStepLabel = $finalStepLabel
    summary = $summary
}) -AddFailedStepIds $bootstrapFailedStepIds | Out-Null

$statusPayload = [ordered]@{
    ok = $overallOk
    timestamp = (Get-Date).ToString("o")
    summary = $summary
    attempts = $attemptPayloads.Count
    statusDir = $statusDir
    logPath = $logPath
    docker = $dockerStatus
    failedSteps = @($statusFailedSteps)
    bootstrap = $bootstrapPayload
    bootstrapOutputTail = if ($bootstrapResult) { $bootstrapResult.OutputTail } else { $null }
}

$statusPayload | ConvertTo-Json -Depth 10 | Set-Content -Path $statusPath -Encoding UTF8
$resultTag = if ($overallOk) { "OK" } else { "ERR" }
Write-StatusLog -Tag $resultTag -Message $summary

if ($overallOk) {
    Launch-ManagedOfficeCompanion
    Show-Notification `
        -Title "Suite runtime ready" `
        -Message "Supabase, backend, gateway, frontend, and collectors are ready after Windows sign-in." `
        -Level "Info"
}
else {
    Show-Notification `
        -Title "Suite runtime needs attention" `
        -Message $summary `
        -Level "Error"
}

if ($Json) {
    $statusPayload | ConvertTo-Json -Depth 10
}
else {
    Write-Host $summary
    if ($bootstrapResult -and $bootstrapResult.OutputTail) {
        Write-Host $bootstrapResult.OutputTail
    }
}

if ($overallOk) {
    exit 0
}

exit 1

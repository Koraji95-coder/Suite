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
$logPath = Join-Path $statusDir "bootstrap.log"
New-Item -ItemType Directory -Path $statusDir -Force | Out-Null

function Write-StatusLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("SYS", "INFO", "OK", "WARN", "ERR", "START")][string]$Tag = "SYS"
    )

    $timestamp = (Get-Date).ToString("o")
    Add-Content -Path $logPath -Value "[$timestamp] [$Tag] $Message"
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
                Start-Process -FilePath $desktopExecutable | Out-Null
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
        $rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
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
        & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $notificationScript `
            -Title $Title `
            -Message $Message `
            -Level $Level | Out-Null
    }
    catch {
        Write-StatusLog -Tag "WARN" -Message "Notification warning: $($_.Exception.Message)"
    }
}

$attemptPayloads = @()
$dockerStatus = $null
$bootstrapResult = $null

for ($attempt = 1; $attempt -le $BootstrapAttempts; $attempt += 1) {
    Write-StatusLog -Tag "START" -Message "Bootstrap attempt $attempt started."
    $bootstrapResult = $null
    $dockerStatus = Ensure-DockerRuntime
    $dockerTag = if ($dockerStatus.ok) { "INFO" } else { "WARN" }
    Write-StatusLog -Tag $dockerTag -Message ("Docker status for attempt {0}: {1}" -f $attempt, $dockerStatus.message)

    if (-not $dockerStatus.ok) {
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
        $bootstrapResult = Invoke-JsonPowerShellFile -ScriptPath $bootstrapScript -Arguments @(
            "-RepoRoot", $resolvedRepoRoot,
            "-BootstrapLogPath", $logPath,
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

$overallOk = [bool]($dockerStatus -and $dockerStatus.ok -and $bootstrapResult -and $bootstrapResult.Ok -and $bootstrapPayload -and [bool]$bootstrapPayload.ok)
$summary = if ($overallOk) {
    "Suite runtime booted successfully."
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

$statusPayload = [ordered]@{
    ok = $overallOk
    timestamp = (Get-Date).ToString("o")
    summary = $summary
    attempts = $attemptPayloads.Count
    statusDir = $statusDir
    logPath = $logPath
    docker = $dockerStatus
    failedSteps = @($failedSteps)
    bootstrap = $bootstrapPayload
    bootstrapOutputTail = if ($bootstrapResult) { $bootstrapResult.OutputTail } else { $null }
}

$statusPayload | ConvertTo-Json -Depth 10 | Set-Content -Path $statusPath -Encoding UTF8
$resultTag = if ($overallOk) { "OK" } else { "ERR" }
Write-StatusLog -Tag $resultTag -Message $summary

if ($overallOk) {
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

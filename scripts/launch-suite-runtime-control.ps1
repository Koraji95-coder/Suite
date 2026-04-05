[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$AutoBootstrap,
    [switch]$LegacyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms | Out-Null

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
$workstationDiagnosticsScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-workstation-diagnostics.ps1")).Path
$processUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-process-utils.ps1")).Path
$retentionScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-retention.ps1")).Path
$runtimeStartupScript = (Resolve-Path (Join-Path $PSScriptRoot "run-suite-runtime-startup.ps1")).Path
$legacyScriptPath = (Resolve-Path (Join-Path $PSScriptRoot "open-suite-runtime-control.ps1")).Path
$hostProjectPath = Join-Path $resolvedRepoRoot "dotnet\Suite.RuntimeControl\Suite.RuntimeControl.csproj"
$hostProjectRoot = Split-Path -Parent $hostProjectPath
$hostBuildOutputDirectory = Join-Path $hostProjectRoot "bin\Debug\net8.0-windows"
$hostOutputPath = Join-Path $hostBuildOutputDirectory "Suite.RuntimeControl.exe"

. $runtimeSharedScript
. $workstationDiagnosticsScript
. $processUtilsScript
. $retentionScript

$runtimePaths = Get-SuiteRuntimePaths
$runtimeStatusBase = $runtimePaths.StatusBase
$runtimeStatusDir = $runtimePaths.RuntimeStatusDir
$launcherLogPath = $runtimePaths.RuntimeLauncherLogPath
$hostStageRoot = Join-Path $runtimeStatusBase "Suite\runtime-control"
$shellPaths = Get-SuiteRuntimeShellPaths -RepoRoot $resolvedRepoRoot

$runtimeShellExitCodes = @{
    ExistingShellActivated = 41
    ExistingShellActivationFailed = 42
    ActivateExistingOnlyNoPrimary = 43
    InitializationFailed = 61
}

New-Item -ItemType Directory -Path $runtimeStatusDir -Force | Out-Null
New-Item -ItemType Directory -Path $hostStageRoot -Force | Out-Null

function Write-LauncherLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("INFO", "WARN", "ERR")][string]$Tag = "INFO"
    )

    try {
        $timestamp = (Get-Date).ToString("o")
        Add-Content -Path $launcherLogPath -Value "[$timestamp] [$Tag] $Message"
    }
    catch {
    }
}

function Show-LauncherMessage {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Title = "Suite Runtime Shell",
        [ValidateSet("Info", "Warning", "Error")][string]$Level = "Warning"
    )

    $icon = switch ($Level) {
        "Info" { [System.Windows.Forms.MessageBoxIcon]::Information; break }
        "Error" { [System.Windows.Forms.MessageBoxIcon]::Error; break }
        default { [System.Windows.Forms.MessageBoxIcon]::Warning; break }
    }

    try {
        [System.Windows.Forms.MessageBox]::Show(
            $Message,
            $Title,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            $icon
        ) | Out-Null
    }
    catch {
    }
}

try {
    $retentionResult = Invoke-SuiteRuntimeLogRetention -BaseDirectory $runtimeStatusBase
    foreach ($warning in @($retentionResult.Warnings)) {
        Write-LauncherLog -Message $warning -Tag "WARN"
    }
}
catch {
    Write-LauncherLog -Message "Runtime log retention warning: $($_.Exception.Message)" -Tag "WARN"
}

function Invoke-JsonPowerShellFileHidden {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $resolvedRepoRoot
    )

    Push-Location $WorkingDirectory
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $ScriptPath @Arguments 2>&1
            $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
            $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
            $outputText = Convert-CommandOutputToText -Output $rawOutput
        }
        catch {
            $exitCode = 1
            $outputText = $_.Exception.Message
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
    }
    finally {
        Pop-Location
    }

    $payload = $null
    if (-not [string]::IsNullOrWhiteSpace($outputText)) {
        try {
            $payload = $outputText | ConvertFrom-Json
        }
        catch {
            $firstBrace = $outputText.IndexOf("{")
            $lastBrace = $outputText.LastIndexOf("}")
            if ($firstBrace -ge 0 -and $lastBrace -gt $firstBrace) {
                $jsonText = $outputText.Substring($firstBrace, ($lastBrace - $firstBrace) + 1)
                try {
                    $payload = $jsonText | ConvertFrom-Json
                }
                catch {
                    $payload = $null
                }
            }
        }
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Ok = ($exitCode -eq 0)
        OutputText = $outputText
        OutputTail = Get-OutputTail -Text $outputText
        Payload = $payload
    }
}

function Get-DesktopShellSummary {
    return Get-SuiteRuntimeShellSummary -RepoRoot $resolvedRepoRoot
}

function Wait-ForHealthyDesktopShell {
    param([ValidateRange(1, 60)][int]$TimeoutSeconds = 8)

    $latest = Get-DesktopShellSummary
    if ($latest.status -eq "healthy") {
        return $latest
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 750
        $latest = Get-DesktopShellSummary
        if ($latest.status -eq "healthy") {
            return $latest
        }
    }

    return $latest
}

function Test-DesktopShellProcessRunning {
    param([Nullable[int]]$ProcessId)

    if ($null -eq $ProcessId -or $ProcessId -le 0) {
        return $false
    }

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return -not $process.HasExited
    }
    catch {
        return $false
    }
}

function Resolve-DesktopShellQuickExit {
    param(
        [int]$ExitCode,
        [int]$ProcessId
    )

    switch ($ExitCode) {
        $runtimeShellExitCodes.ExistingShellActivated {
            return [pscustomobject]@{
                Handled = $true
                Ok = $true
                Message = "Focused the existing Suite Runtime shell."
            }
        }
        $runtimeShellExitCodes.ExistingShellActivationFailed {
            return [pscustomobject]@{
                Handled = $true
                Ok = $false
                Message = "The desktop shell could not hand off to the existing primary instance."
            }
        }
        $runtimeShellExitCodes.ActivateExistingOnlyNoPrimary {
            return [pscustomobject]@{
                Handled = $true
                Ok = $false
                Message = "No existing Suite Runtime shell was available to activate."
            }
        }
        $runtimeShellExitCodes.InitializationFailed {
            return [pscustomobject]@{
                Handled = $true
                Ok = $false
                Message = "The desktop shell failed during startup."
            }
        }
        0 {
            $primaryState = Get-DesktopShellSummary
            $primaryProcessId = if ($primaryState -and $primaryState.processId) { [int]$primaryState.processId } else { 0 }
            if ($primaryProcessId -gt 0 -and $primaryProcessId -ne $ProcessId -and (Test-DesktopShellProcessRunning -ProcessId $primaryProcessId)) {
                return [pscustomobject]@{
                    Handled = $true
                    Ok = $true
                    Message = "Focused the existing Suite Runtime shell."
                }
            }

            return [pscustomobject]@{
                Handled = $false
                Ok = $false
                Message = $null
            }
        }
        default {
            return [pscustomobject]@{
                Handled = $false
                Ok = $false
                Message = $null
            }
        }
    }
}

function Get-HostSourceTimestampUtc {
    if (-not (Test-Path -LiteralPath $hostProjectRoot -PathType Container)) {
        return [datetime]::MinValue
    }

    $sourceFiles = Get-ChildItem -Path $hostProjectRoot -Recurse -File |
        Where-Object {
            $_.FullName -notlike "*\bin\*" -and
            $_.FullName -notlike "*\obj\*"
        }

    if (-not $sourceFiles) {
        return [datetime]::MinValue
    }

    return ($sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
}

function Get-HostBuildTimestampUtc {
    if (-not (Test-Path -LiteralPath $hostBuildOutputDirectory -PathType Container)) {
        return [datetime]::MinValue
    }

    $outputFiles = Get-ChildItem -Path $hostBuildOutputDirectory -Recurse -File -ErrorAction SilentlyContinue
    if (-not $outputFiles) {
        return [datetime]::MinValue
    }

    return ($outputFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
}

function Get-DotNetExecutable {
    $dotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
    if ($dotnet) {
        return $dotnet.Source
    }

    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($dotnet) {
        return $dotnet.Source
    }

    return $null
}

function Test-WebView2RuntimeInstalled {
    $clientIds = @(
        "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "{2CD8A007-E189-409D-A2C8-9AF4EF3C72AA}"
    )
    $registryRoots = @(
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients"
    )

    foreach ($root in $registryRoots) {
        foreach ($clientId in $clientIds) {
            $candidate = Join-Path $root $clientId
            try {
                $version = Get-ItemPropertyValue -Path $candidate -Name "pv" -ErrorAction Stop
                if (-not [string]::IsNullOrWhiteSpace([string]$version)) {
                    return $true
                }
            }
            catch {
            }
        }
    }

    return $false
}

function Get-SmartAppControlState {
    try {
        $policy = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy" -ErrorAction Stop
        return [int]$policy.VerifiedAndReputablePolicyState
    }
    catch {
        return 0
    }
}

function Copy-HostBuildOutputToStage {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDirectory,
        [Parameter(Mandatory = $true)][string]$DestinationDirectory
    )

    foreach ($entry in Get-ChildItem -LiteralPath $SourceDirectory -Force -ErrorAction Stop) {
        if ($entry.PSIsContainer -and $entry.Name -eq "Suite.RuntimeControl.exe.WebView2") {
            Write-LauncherLog -Message "Skipping runtime data directory during staged shell copy: $($entry.FullName)." -Tag "WARN"
            continue
        }

        if ($entry.PSIsContainer) {
            Copy-Item -LiteralPath $entry.FullName -Destination $DestinationDirectory -Recurse -Force -ErrorAction Stop
        }
        else {
            Copy-Item -LiteralPath $entry.FullName -Destination $DestinationDirectory -Force -ErrorAction Stop
        }
    }
}

function Resolve-HostLaunchTarget {
    $dotNetExecutable = Get-DotNetExecutable
    $hostOutputExists = Test-Path -LiteralPath $hostOutputPath -PathType Leaf
    $needsBuild = -not $hostOutputExists

    if ($hostOutputExists) {
        $hostTimestamp = Get-HostBuildTimestampUtc
        $sourceTimestamp = Get-HostSourceTimestampUtc
        $needsBuild = $sourceTimestamp -gt $hostTimestamp
    }

    if ($needsBuild) {
        if (-not $dotNetExecutable) {
            throw "dotnet was not found on PATH and the shared shell is not already built."
        }

        Write-LauncherLog -Message "Building desktop shell host."
        $null = & $dotNetExecutable build $hostProjectPath -c Debug -v quiet /nologo
        $exitCode = if (Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue) { [int]$LASTEXITCODE } else { 0 }
        if ($exitCode -ne 0) {
            throw "dotnet build failed for the runtime shell."
        }

        Write-LauncherLog -Message "Desktop shell host build completed."
    }
    elseif (-not $dotNetExecutable) {
        Write-LauncherLog -Message "dotnet is unavailable, using the last successful desktop shell build." -Tag "WARN"
    }
    else {
        Write-LauncherLog -Message "Desktop shell build is current."
    }

    if (-not (Test-Path -LiteralPath $hostOutputPath -PathType Leaf)) {
        throw "The desktop shell executable was not produced."
    }

    $hostBuildTimestamp = Get-HostBuildTimestampUtc
    if ($hostBuildTimestamp -eq [datetime]::MinValue) {
        $hostBuildTimestamp = (Get-Item -LiteralPath $hostOutputPath).LastWriteTimeUtc
    }

    $buildStamp = $hostBuildTimestamp.ToString(
        "yyyyMMddHHmmssfff",
        [System.Globalization.CultureInfo]::InvariantCulture)
    $stageDirectory = Join-Path $hostStageRoot $buildStamp
    $stageExecutablePath = Join-Path $stageDirectory "Suite.RuntimeControl.exe"

    if (-not (Test-Path -LiteralPath $stageExecutablePath -PathType Leaf)) {
        New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
        Copy-HostBuildOutputToStage -SourceDirectory $hostBuildOutputDirectory -DestinationDirectory $stageDirectory
        Get-ChildItem -Path $stageDirectory -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
        }
        Write-LauncherLog -Message "Staged desktop shell build to $stageDirectory."
    }
    else {
        Write-LauncherLog -Message "Reusing staged desktop shell build at $stageDirectory."
    }

    try {
        $retentionResult = Invoke-SuiteRuntimeStageRetention -BaseDirectory $runtimeStatusBase
        foreach ($warning in @($retentionResult.Warnings)) {
            Write-LauncherLog -Message $warning -Tag "WARN"
        }
    }
    catch {
        Write-LauncherLog -Message "Stale stage cleanup warning: $($_.Exception.Message)" -Tag "WARN"
    }

    return [pscustomobject]@{
        Directory = $stageDirectory
        ExecutablePath = $stageExecutablePath
    }
}

function Resolve-ValidatedHostLaunchTarget {
    $rawLaunchTarget = @(Resolve-HostLaunchTarget)
    $launchTarget = $rawLaunchTarget |
        Where-Object {
            $_ -and
            $_.PSObject.Properties.Name -contains "Directory" -and
            $_.PSObject.Properties.Name -contains "ExecutablePath"
        } |
        Select-Object -Last 1

    if (-not $launchTarget) {
        throw "The desktop shell launch target could not be resolved."
    }

    if ($rawLaunchTarget.Count -gt 1) {
        $types = $rawLaunchTarget | ForEach-Object {
            if ($_ -eq $null) {
                "<null>"
            }
            else {
                $_.GetType().FullName
            }
        } | Sort-Object -Unique
        Write-LauncherLog -Message ("Launch target resolver returned extra values. Using the last valid launch target. Types={0}" -f ($types -join ", ")) -Tag "WARN"
    }

    return $launchTarget
}

function Invoke-ExistingDesktopShellActivation {
    param(
        [object]$ShellSummary,
        [switch]$ForwardAutoBootstrap,
        [string]$ActivationExecutablePath
    )

    $summary = if ($ShellSummary) { $ShellSummary } else { Get-DesktopShellSummary }
    if ($summary.status -ne "healthy") {
        return [pscustomobject]@{
            Attempted = $false
            Ok = $false
            Summary = "No healthy desktop shell was available to activate."
            ExitCode = $null
        }
    }

    $processPath = if (-not [string]::IsNullOrWhiteSpace([string]$ActivationExecutablePath)) {
        [string]$ActivationExecutablePath
    }
    elseif (-not [string]::IsNullOrWhiteSpace([string]$summary.processPath)) {
        [string]$summary.processPath
    }
    elseif (Test-Path -LiteralPath $hostOutputPath -PathType Leaf) {
        $hostOutputPath
    }
    else {
        $null
    }

    if ([string]::IsNullOrWhiteSpace($processPath) -or -not (Test-Path -LiteralPath $processPath -PathType Leaf)) {
        return [pscustomobject]@{
            Attempted = $false
            Ok = $false
            Summary = "The desktop shell executable used for activation is not available."
            ExitCode = $null
        }
    }

    $workingDirectory = Split-Path -Parent $processPath
    $arguments = @("--repo-root", $resolvedRepoRoot, "--activate-existing-only")
    if ($ForwardAutoBootstrap) {
        $arguments += "--auto-bootstrap"
    }

    try {
        $process = Start-Process -FilePath $processPath -WorkingDirectory $workingDirectory -ArgumentList $arguments -PassThru -ErrorAction Stop
        if (-not $process.WaitForExit(7000)) {
            try {
                $process.Kill()
            }
            catch {
            }

            return [pscustomobject]@{
                Attempted = $true
                Ok = $false
                Summary = "Existing shell activation did not return in time."
                ExitCode = $null
            }
        }

        $exitResolution = Resolve-DesktopShellQuickExit -ExitCode $process.ExitCode -ProcessId $process.Id
        if ($exitResolution.Handled) {
            return [pscustomobject]@{
                Attempted = $true
                Ok = $exitResolution.Ok
                Summary = [string]$exitResolution.Message
                ExitCode = $process.ExitCode
            }
        }

        return [pscustomobject]@{
            Attempted = $true
            Ok = $false
            Summary = "Existing shell activation returned exit code $($process.ExitCode)."
            ExitCode = $process.ExitCode
        }
    }
    catch {
        return [pscustomobject]@{
            Attempted = $true
            Ok = $false
            Summary = "Existing shell activation failed. $($_.Exception.Message)"
            ExitCode = $null
        }
    }
}

function Clear-DesktopShellArtifacts {
    foreach ($path in @(
        $shellPaths.PrimaryStatePath,
        $shellPaths.ActivationRequestPath,
        $shellPaths.LockPath
    )) {
        if ([string]::IsNullOrWhiteSpace($path)) {
            continue
        }

        try {
            if (Test-Path -LiteralPath $path) {
                Remove-Item -LiteralPath $path -Force -ErrorAction Stop
            }
        }
        catch {
            Write-LauncherLog -Message "Shell artifact cleanup warning for ${path}: $($_.Exception.Message)" -Tag "WARN"
        }
    }
}

function Reset-StaleDesktopShellState {
    param(
        [object]$ShellSummary,
        [string]$Reason = "Shell state reset requested."
    )

    $summary = if ($ShellSummary) { $ShellSummary } else { Get-DesktopShellSummary }
    Write-LauncherLog -Message ("Resetting stale shell state. Reason={0}; Status={1}; Phase={2}; PID={3}; Detail={4}" -f `
        $Reason,
        [string]$summary.status,
        [string]$summary.phase,
        [string]$summary.processId,
        [string]$summary.detail) -Tag "WARN"

    if ($summary.processRunning -and $summary.processId) {
        try {
            $process = Get-Process -Id ([int]$summary.processId) -ErrorAction Stop
            if ($process.ProcessName -eq "Suite.RuntimeControl") {
                Stop-Process -Id $process.Id -Force -ErrorAction Stop
                Start-Sleep -Milliseconds 500
            }
        }
        catch {
            Write-LauncherLog -Message "Shell process termination warning: $($_.Exception.Message)" -Tag "WARN"
        }
    }

    Clear-DesktopShellArtifacts
}

function Invoke-RuntimeBootstrap {
    Write-LauncherLog -Message "Running canonical runtime startup before launching the shell."
    $result = Invoke-JsonPowerShellFileHidden -ScriptPath $runtimeStartupScript -Arguments @(
        "-RepoRoot", $resolvedRepoRoot,
        "-Json"
    ) -WorkingDirectory $resolvedRepoRoot

    if ($result.Ok -and $result.Payload -and [bool]$result.Payload.ok) {
        Write-LauncherLog -Message ([string]$result.Payload.summary)
        return [pscustomobject]@{
            Ok = $true
            Summary = [string]$result.Payload.summary
            Result = $result
        }
    }

    $summary = if ($result.Payload -and -not [string]::IsNullOrWhiteSpace([string]$result.Payload.summary)) {
        [string]$result.Payload.summary
    }
    elseif (-not [string]::IsNullOrWhiteSpace([string]$result.OutputTail)) {
        [string]$result.OutputTail
    }
    else {
        "Suite runtime startup did not finish successfully."
    }

    Write-LauncherLog -Message "Runtime startup failed. $summary" -Tag "ERR"
    return [pscustomobject]@{
        Ok = $false
        Summary = $summary
        Result = $result
    }
}

function Wait-ForDesktopShellReady {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [ValidateRange(5, 120)][int]$TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $latestSummary = Get-DesktopShellSummary

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 750

        $process = $null
        try {
            $process = Get-Process -Id $ProcessId -ErrorAction Stop
            if ($process.HasExited) {
                return [pscustomobject]@{
                    Ok = $false
                    ShellSummary = Get-DesktopShellSummary
                    Message = "The desktop shell exited before becoming healthy."
                }
            }
        }
        catch {
            return [pscustomobject]@{
                Ok = $false
                ShellSummary = Get-DesktopShellSummary
                Message = "The desktop shell exited before becoming healthy."
            }
        }

        $latestSummary = Get-DesktopShellSummary
        if ($latestSummary.status -eq "healthy") {
            return [pscustomobject]@{
                Ok = $true
                ShellSummary = $latestSummary
                Message = "Shared shell is healthy."
            }
        }

        if ($latestSummary.status -eq "stale" -and $latestSummary.processId -eq $ProcessId) {
            return [pscustomobject]@{
                Ok = $false
                ShellSummary = $latestSummary
                Message = "Shared shell became stale before reaching a ready state."
            }
        }
    }

    return [pscustomobject]@{
        Ok = $false
        ShellSummary = $latestSummary
        Message = "Timed out waiting for the shared shell to become healthy."
    }
}

function Start-DesktopControlPanel {
    param(
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string[]]$Arguments
    )

    $process = Start-Process -FilePath $ExecutablePath -WorkingDirectory $WorkingDirectory -ArgumentList $Arguments -PassThru -ErrorAction Stop
    Write-LauncherLog -Message "Desktop shell process created. PID=$($process.Id). Path=$ExecutablePath"

    try {
        $null = $process.WaitForInputIdle(7000)
    }
    catch {
        Write-LauncherLog -Message "WaitForInputIdle warning: $($_.Exception.Message)" -Tag "WARN"
    }

    $quickExitDeadline = (Get-Date).AddSeconds(6)
    while ((Get-Date) -lt $quickExitDeadline) {
        Start-Sleep -Milliseconds 300
        try {
            $process.Refresh()
        }
        catch {
        }

        if ($process.HasExited) {
            $quickExit = Resolve-DesktopShellQuickExit -ExitCode $process.ExitCode -ProcessId $process.Id
            if ($quickExit.Handled -and $quickExit.Ok) {
                Write-LauncherLog -Message $quickExit.Message
                return [pscustomobject]@{
                    Ok = $true
                    Process = $process
                    ShellSummary = Get-DesktopShellSummary
                    Message = [string]$quickExit.Message
                }
            }

            $exitMessage = if ($quickExit.Handled -and -not [string]::IsNullOrWhiteSpace([string]$quickExit.Message)) {
                [string]$quickExit.Message
            }
            else {
                "The desktop shell exited before opening a visible client. Exit code: $($process.ExitCode)."
            }

            return [pscustomobject]@{
                Ok = $false
                Process = $process
                ShellSummary = Get-DesktopShellSummary
                Message = $exitMessage
            }
        }
    }

    return Wait-ForDesktopShellReady -ProcessId $process.Id
}

function Ensure-DesktopShell {
    param(
        [switch]$ForwardAutoBootstrapToExistingShell
    )

    $existingSummary = Get-DesktopShellSummary
    if ($existingSummary.status -eq "healthy") {
        $activation = Invoke-ExistingDesktopShellActivation `
            -ShellSummary $existingSummary `
            -ForwardAutoBootstrap:$ForwardAutoBootstrapToExistingShell
        if ($activation.Ok) {
            Write-LauncherLog -Message $activation.Summary
            return [pscustomobject]@{
                Ok = $true
                ActivatedExisting = $true
                Message = [string]$activation.Summary
                ShellSummary = Get-DesktopShellSummary
            }
        }

        Write-LauncherLog -Message $activation.Summary -Tag "WARN"
        Reset-StaleDesktopShellState -ShellSummary $existingSummary -Reason "Healthy shell activation failed."
    }
    elseif ($existingSummary.present) {
        $waitedSummary = if ($existingSummary.status -eq "starting" -and $existingSummary.processRunning) {
            Wait-ForHealthyDesktopShell -TimeoutSeconds 8
        }
        else {
            $existingSummary
        }

        if ($waitedSummary.status -eq "healthy") {
            $activation = Invoke-ExistingDesktopShellActivation `
                -ShellSummary $waitedSummary `
                -ForwardAutoBootstrap:$ForwardAutoBootstrapToExistingShell
            if ($activation.Ok) {
                Write-LauncherLog -Message $activation.Summary
                return [pscustomobject]@{
                    Ok = $true
                    ActivatedExisting = $true
                    Message = [string]$activation.Summary
                    ShellSummary = Get-DesktopShellSummary
                }
            }

            Write-LauncherLog -Message $activation.Summary -Tag "WARN"
        }

        Reset-StaleDesktopShellState -ShellSummary $waitedSummary -Reason "Existing shell was not healthy enough to trust for launch handoff."
    }

    $launchTarget = Resolve-ValidatedHostLaunchTarget
    $launchResult = Start-DesktopControlPanel -ExecutablePath $launchTarget.ExecutablePath -WorkingDirectory $launchTarget.Directory -Arguments @("--repo-root", $resolvedRepoRoot)
    if ($launchResult.Ok) {
        Write-LauncherLog -Message $launchResult.Message
        return [pscustomobject]@{
            Ok = $true
            ActivatedExisting = $false
            Message = [string]$launchResult.Message
            ShellSummary = $launchResult.ShellSummary
        }
    }

    Write-LauncherLog -Message $launchResult.Message -Tag "WARN"
    Reset-StaleDesktopShellState -ShellSummary $launchResult.ShellSummary -Reason "First launch attempt failed."

    $retryResult = Start-DesktopControlPanel -ExecutablePath $launchTarget.ExecutablePath -WorkingDirectory $launchTarget.Directory -Arguments @("--repo-root", $resolvedRepoRoot)
    if ($retryResult.Ok) {
        Write-LauncherLog -Message "Desktop shell retry succeeded."
        return [pscustomobject]@{
            Ok = $true
            ActivatedExisting = $false
            Message = [string]$retryResult.Message
            ShellSummary = $retryResult.ShellSummary
        }
    }

    return [pscustomobject]@{
        Ok = $false
        ActivatedExisting = $false
        Message = [string]$retryResult.Message
        ShellSummary = $retryResult.ShellSummary
    }
}

function Start-LegacyControlPanel {
    $arguments = @(
        "-NoProfile",
        "-Sta",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        $legacyScriptPath,
        "-RepoRoot",
        $resolvedRepoRoot
    )

    if ($AutoBootstrap) {
        $arguments += "-AutoBootstrap"
    }

    $process = Start-SuiteDetachedProcess -FilePath "PowerShell.exe" -WorkingDirectory $resolvedRepoRoot -Arguments $arguments
    Write-LauncherLog -Message "Legacy runtime control panel launched explicitly. PID=$($process.Id)." -Tag "WARN"
    return $process
}

if ($LegacyOnly) {
    Write-LauncherLog -Message "LegacyOnly requested. Opening the legacy runtime control panel explicitly." -Tag "WARN"
    Start-LegacyControlPanel | Out-Null
    exit 0
}

if (-not (Test-Path -LiteralPath $hostProjectPath -PathType Leaf)) {
    $message = "Suite Runtime shell project is missing: $hostProjectPath"
    Write-LauncherLog -Message $message -Tag "ERR"
    Show-LauncherMessage -Message $message -Level "Error"
    exit 1
}

if (-not (Test-WebView2RuntimeInstalled)) {
    $message = "WebView2 runtime is not installed. The shared Suite Runtime shell cannot open until WebView2 is available."
    Write-LauncherLog -Message $message -Tag "ERR"
    Show-LauncherMessage -Message $message -Level "Error"
    exit 1
}

$smartAppControlState = Get-SmartAppControlState
if ($smartAppControlState -eq 1) {
    $message = "Smart App Control is enforcing verified/reputable app policy and is blocking the unsigned Suite desktop shell. Disable Smart App Control or sign the shell before using the shared client."
    Write-LauncherLog -Message $message -Tag "ERR"
    Show-LauncherMessage -Message $message -Level "Error"
    exit 1
}

try {
    $existingHealthyShell = Wait-ForHealthyDesktopShell -TimeoutSeconds 6
    if ($existingHealthyShell.status -eq "healthy") {
        $shellResult = Ensure-DesktopShell -ForwardAutoBootstrapToExistingShell:$AutoBootstrap
        if ($shellResult.Ok) {
            exit 0
        }

        throw $shellResult.Message
    }

    if ($AutoBootstrap) {
        $bootstrapResult = Invoke-RuntimeBootstrap
        if (-not $bootstrapResult.Ok) {
            throw $bootstrapResult.Summary
        }
    }

    $shellResult = Ensure-DesktopShell
    if (-not $shellResult.Ok) {
        throw $shellResult.Message
    }

    exit 0
}
catch {
    $failureMessage = $_.Exception.Message
    Write-LauncherLog -Message "Desktop shell launch failed: $failureMessage" -Tag "ERR"
    Show-LauncherMessage -Message "Suite Runtime shell could not start.`r`n`r`n$failureMessage" -Level "Error"
    exit 1
}

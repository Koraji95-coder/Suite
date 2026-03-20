[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$BootstrapLogPath,
    [switch]$SkipSupabase,
    [switch]$SkipWatchdog,
    [switch]$SkipBackend,
    [switch]$SkipGateway,
    [switch]$SkipFrontend,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path

function Convert-CommandOutputToText {
    param([object[]]$Output)

    if (-not $Output) {
        return ""
    }

    return [string]::Join(
        [Environment]::NewLine,
        @(
            $Output | ForEach-Object {
                if ($null -eq $_) {
                    ""
                }
                else {
                    $_.ToString()
                }
            }
        )
    ).Trim()
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
    $tail = $lines | Select-Object -Last $LineCount
    return [string]::Join([Environment]::NewLine, $tail).Trim()
}

function Write-BootstrapLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("SYS", "INFO", "OK", "WARN", "ERR", "START")][string]$Tag = "INFO"
    )

    if ([string]::IsNullOrWhiteSpace($BootstrapLogPath) -or [string]::IsNullOrWhiteSpace($Message)) {
        return
    }

    $directory = Split-Path -Parent $BootstrapLogPath
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $timestamp = (Get-Date).ToString("o")
    Add-Content -Path $BootstrapLogPath -Value "[$timestamp] [$Tag] $Message"
}

function Format-CommandArguments {
    param([string[]]$Arguments)

    if (-not $Arguments -or $Arguments.Count -eq 0) {
        return ""
    }

    $parts = foreach ($argument in $Arguments) {
        if ($null -eq $argument) {
            continue
        }

        $text = [string]$argument
        if ($text -match "\s") {
            '"' + $text.Replace('"', '\"') + '"'
        }
        else {
            $text
        }
    }

    return [string]::Join(" ", @($parts))
}

function Get-StepLogLevel {
    param(
        [string]$State,
        [bool]$Ok
    )

    if (-not $Ok -or $State -eq "failed") {
        return "ERR"
    }

    if ($State -eq "starting") {
        return "WARN"
    }

    if ($State -eq "skipped") {
        return "SYS"
    }

    return "OK"
}

function Get-StepLogLines {
    param(
        [Parameter(Mandatory = $true)][psobject]$Step,
        [string]$FallbackText
    )

    $lines = @()
    $payload = $Step.payload

    switch ($Step.name) {
        "supabase-start" {
            if (-not [string]::IsNullOrWhiteSpace($FallbackText)) {
                $lines += ($FallbackText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            }
        }
        "supabase-env" {
            if (-not [string]::IsNullOrWhiteSpace($FallbackText)) {
                $lines += ($FallbackText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            }
        }
        "watchdog-filesystem" {
            if ($payload) {
                if ($payload.startupMode) {
                    $lines += "Startup mode: $($payload.startupMode)"
                }
                if ($null -ne $payload.daemonRunning) {
                    $lines += "Daemon running: $($payload.daemonRunning)"
                }
                foreach ($warning in @($payload.warnings)) {
                    if (-not [string]::IsNullOrWhiteSpace([string]$warning)) {
                        $lines += "Warning: $warning"
                    }
                }
                foreach ($errorMessage in @($payload.errors)) {
                    if (-not [string]::IsNullOrWhiteSpace([string]$errorMessage)) {
                        $lines += "Error: $errorMessage"
                    }
                }
            }
        }
        "watchdog-autocad-startup" {
            if ($payload) {
                if ($payload.startupMode) {
                    $lines += "Startup mode: $($payload.startupMode)"
                }
                if ($null -ne $payload.daemonRunning) {
                    $lines += "Daemon running: $($payload.daemonRunning)"
                }
                foreach ($warning in @($payload.warnings)) {
                    if (-not [string]::IsNullOrWhiteSpace([string]$warning)) {
                        $lines += "Warning: $warning"
                    }
                }
                foreach ($errorMessage in @($payload.errors)) {
                    if (-not [string]::IsNullOrWhiteSpace([string]$errorMessage)) {
                        $lines += "Error: $errorMessage"
                    }
                }
            }
        }
        "watchdog-autocad-plugin" {
            if ($payload) {
                if ($payload.bundleRoot) {
                    $lines += "Bundle root: $($payload.bundleRoot)"
                }
                foreach ($errorMessage in @($payload.errors)) {
                    if (-not [string]::IsNullOrWhiteSpace([string]$errorMessage)) {
                        $lines += "Error: $errorMessage"
                    }
                }
            }
        }
        "backend" {
            if ($payload) {
                $lines += "Backend running: $($payload.Running)"
                if ($payload.ProcessId) {
                    $lines += "Process ID: $($payload.ProcessId)"
                }
                if ($payload.CommandLine) {
                    $lines += "Command: $($payload.CommandLine)"
                }
                if ($payload.Error) {
                    $lines += "Error: $($payload.Error)"
                }
            }
        }
        "gateway" {
            if ($payload) {
                $lines += "Gateway running: $($payload.Running)"
                $lines += "Gateway healthy: $($payload.Healthy)"
                if ($payload.ProcessId) {
                    $lines += "Process ID: $($payload.ProcessId)"
                }
                if ($payload.CommandLine) {
                    $lines += "Command: $($payload.CommandLine)"
                }
                if ($payload.Error) {
                    $lines += "Error: $($payload.Error)"
                }
            }
        }
        "frontend" {
            if ($payload) {
                $lines += "Frontend running: $($payload.Running)"
                $lines += "Frontend healthy: $($payload.Healthy)"
                if ($payload.ProcessId) {
                    $lines += "Process ID: $($payload.ProcessId)"
                }
                if ($payload.Url) {
                    $lines += "URL: $($payload.Url)"
                }
                if ($payload.LogPath) {
                    $lines += "Log path: $($payload.LogPath)"
                }
                if ($payload.CommandLine) {
                    $lines += "Command: $($payload.CommandLine)"
                }
                if ($payload.Error) {
                    $lines += "Error: $($payload.Error)"
                }
            }
        }
    }

    if ($lines.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($FallbackText)) {
        $lines += ($FallbackText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }

    return @($lines | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Write-StepLog {
    param(
        [Parameter(Mandatory = $true)][psobject]$Step,
        [string]$FallbackText
    )

    $tag = Get-StepLogLevel -State $Step.state -Ok ([bool]$Step.ok)
    Write-BootstrapLog -Tag $tag -Message "$($Step.name): $($Step.summary)"

    foreach ($line in (Get-StepLogLines -Step $Step -FallbackText $FallbackText)) {
        Write-BootstrapLog -Tag $tag -Message $line
    }
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        try {
            $rawOutput = & $FilePath @Arguments 2>&1
            $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
            $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
            $outputText = Convert-CommandOutputToText -Output $rawOutput
            return [pscustomobject]@{
                ExitCode = $exitCode
                Ok = ($exitCode -eq 0)
                OutputText = $outputText
                OutputTail = Get-OutputTail -Text $outputText
            }
        }
        catch {
            $outputText = $_.Exception.Message
            return [pscustomobject]@{
                ExitCode = 1
                Ok = $false
                OutputText = $outputText
                OutputTail = Get-OutputTail -Text $outputText
            }
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-NodeScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptRelativePath,
        [string[]]$Arguments
    )

    $scriptPath = Join-Path $resolvedRepoRoot $ScriptRelativePath
    $argumentText = Format-CommandArguments -Arguments $Arguments
    $commandSuffix = if ([string]::IsNullOrWhiteSpace($argumentText)) { "" } else { " $argumentText" }
    Write-BootstrapLog -Tag "INFO" -Message ("Running node {0}{1}" -f $ScriptRelativePath, $commandSuffix)
    return Invoke-ExternalCommand -FilePath "node" -Arguments (@($scriptPath) + $Arguments) -WorkingDirectory $resolvedRepoRoot
}

function Invoke-PowerShellScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptRelativePath,
        [string[]]$Arguments
    )

    $scriptPath = Join-Path $resolvedRepoRoot $ScriptRelativePath
    $argumentText = Format-CommandArguments -Arguments $Arguments
    $commandSuffix = if ([string]::IsNullOrWhiteSpace($argumentText)) { "" } else { " $argumentText" }
    Write-BootstrapLog -Tag "INFO" -Message ("Running PowerShell {0}{1}" -f $ScriptRelativePath, $commandSuffix)
    return Invoke-ExternalCommand -FilePath "PowerShell.exe" -Arguments (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath) + $Arguments) -WorkingDirectory $resolvedRepoRoot
}

function Invoke-JsonPowerShellScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptRelativePath,
        [string[]]$Arguments
    )

    $result = Invoke-PowerShellScript -ScriptRelativePath $ScriptRelativePath -Arguments $Arguments
    $payload = $null
    if ($result.Ok -and -not [string]::IsNullOrWhiteSpace($result.OutputText)) {
        try {
            $payload = $result.OutputText | ConvertFrom-Json
        }
        catch {
            $result = [pscustomobject]@{
                ExitCode = $result.ExitCode
                Ok = $false
                OutputText = $result.OutputText
                OutputTail = $result.OutputTail
                ParseError = $_.Exception.Message
            }
        }
    }

    return [pscustomobject]@{
        Result = $result
        Payload = $payload
    }
}

function New-StepResult {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$State,
        [Parameter(Mandatory = $true)][bool]$Ok,
        [Parameter(Mandatory = $true)][string]$Summary,
        [string]$Details,
        [object]$Payload
    )

    [pscustomobject]@{
        name = $Name
        state = $State
        ok = $Ok
        summary = $Summary
        details = if ([string]::IsNullOrWhiteSpace($Details)) { $null } else { $Details }
        payload = $Payload
    }
}

Write-BootstrapLog -Tag "START" -Message "Suite runtime bootstrap is starting."

$steps = @()
$frontendCheckScript = "scripts\check-suite-frontend-startup.ps1"

if ($SkipSupabase) {
    $supabaseSkippedStep = New-StepResult -Name "supabase" -State "skipped" -Ok $true -Summary "Skipped local Supabase bootstrap."
    $steps += $supabaseSkippedStep
    Write-StepLog -Step $supabaseSkippedStep
}
else {
    $supabaseStart = Invoke-NodeScript -ScriptRelativePath "scripts\run-supabase-cli.mjs" -Arguments @("start")
    $supabaseStartReady = $supabaseStart.Ok -or ($supabaseStart.OutputText -match "(?im)\balready running\b")
    if ($supabaseStartReady) {
        $supabaseStartStep = New-StepResult -Name "supabase-start" -State "ready" -Ok $true -Summary "Local Supabase stack is running." -Details $supabaseStart.OutputTail
        $steps += $supabaseStartStep
        Write-StepLog -Step $supabaseStartStep -FallbackText $supabaseStart.OutputTail
        $supabaseEnv = Invoke-NodeScript -ScriptRelativePath "scripts\write-supabase-local-env.mjs" -Arguments @()
        if ($supabaseEnv.Ok) {
            $supabaseEnvStep = New-StepResult -Name "supabase-env" -State "ready" -Ok $true -Summary "Local Supabase env overrides were refreshed." -Details $supabaseEnv.OutputTail
            $steps += $supabaseEnvStep
            Write-StepLog -Step $supabaseEnvStep -FallbackText $supabaseEnv.OutputTail
        }
        else {
            $supabaseEnvStep = New-StepResult -Name "supabase-env" -State "failed" -Ok $false -Summary "Local Supabase env overrides were not refreshed." -Details $supabaseEnv.OutputTail
            $steps += $supabaseEnvStep
            Write-StepLog -Step $supabaseEnvStep -FallbackText $supabaseEnv.OutputTail
        }
    }
    else {
        $supabaseStartStep = New-StepResult -Name "supabase-start" -State "failed" -Ok $false -Summary "Local Supabase stack did not start." -Details $supabaseStart.OutputTail
        $steps += $supabaseStartStep
        Write-StepLog -Step $supabaseStartStep -FallbackText $supabaseStart.OutputTail
        $supabaseEnvStep = New-StepResult -Name "supabase-env" -State "skipped" -Ok $true -Summary "Skipped local Supabase env refresh because Supabase did not start."
        $steps += $supabaseEnvStep
        Write-StepLog -Step $supabaseEnvStep
    }
}

if ($SkipWatchdog) {
    $watchdogSkippedStep = New-StepResult -Name "watchdog" -State "skipped" -Ok $true -Summary "Skipped Watchdog runtime bootstrap."
    $steps += $watchdogSkippedStep
    Write-StepLog -Step $watchdogSkippedStep
}
else {
    $filesystemInstall = Invoke-PowerShellScript -ScriptRelativePath "scripts\install-watchdog-filesystem-collector-startup.ps1" -Arguments @()
    $filesystemCheck = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-filesystem-collector-startup.ps1" -Arguments @("-StartIfMissing", "-Json")
    $filesystemReady = $filesystemCheck.Result.Ok -and $filesystemCheck.Payload -and [bool]$filesystemCheck.Payload.healthy
    $filesystemDetails = if ((-not $filesystemInstall.Ok) -and $filesystemInstall.OutputTail) {
        (@($filesystemInstall.OutputTail, $filesystemCheck.Result.OutputTail) | Where-Object { $_ }) -join [Environment]::NewLine
    }
    else {
        $filesystemCheck.Result.OutputTail
    }
    $filesystemStep = New-StepResult `
        -Name "watchdog-filesystem" `
        -State $(if ($filesystemReady) { "ready" } else { "failed" }) `
        -Ok $filesystemReady `
        -Summary $(if ($filesystemReady) { "Filesystem collector startup is installed and healthy." } else { "Filesystem collector startup needs attention." }) `
        -Details $filesystemDetails `
        -Payload $filesystemCheck.Payload
    $steps += $filesystemStep
    Write-StepLog -Step $filesystemStep -FallbackText $filesystemInstall.OutputTail

    $autocadInstall = Invoke-PowerShellScript -ScriptRelativePath "scripts\install-watchdog-autocad-collector-startup.ps1" -Arguments @()
    $autocadCheck = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-autocad-collector-startup.ps1" -Arguments @("-StartIfMissing", "-Json")
    $autocadPlugin = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-autocad-plugin.ps1" -Arguments @("-Json")
    $autocadStartupReady = $autocadCheck.Result.Ok -and $autocadCheck.Payload -and [bool]$autocadCheck.Payload.healthy
    $pluginReady = $autocadPlugin.Result.Ok -and $autocadPlugin.Payload -and [bool]$autocadPlugin.Payload.ok
    $autocadDetails = if ((-not $autocadInstall.Ok) -and $autocadInstall.OutputTail) {
        (@($autocadInstall.OutputTail, $autocadCheck.Result.OutputTail) | Where-Object { $_ }) -join [Environment]::NewLine
    }
    else {
        $autocadCheck.Result.OutputTail
    }
    $autocadStartupStep = New-StepResult `
        -Name "watchdog-autocad-startup" `
        -State $(if ($autocadStartupReady) { "ready" } else { "failed" }) `
        -Ok $autocadStartupReady `
        -Summary $(if ($autocadStartupReady) { "AutoCAD collector startup is installed and healthy." } else { "AutoCAD collector startup needs attention." }) `
        -Details $autocadDetails `
        -Payload $autocadCheck.Payload
    $steps += $autocadStartupStep
    Write-StepLog -Step $autocadStartupStep -FallbackText $autocadInstall.OutputTail
    $autocadPluginStep = New-StepResult `
        -Name "watchdog-autocad-plugin" `
        -State $(if ($pluginReady) { "ready" } else { "failed" }) `
        -Ok $pluginReady `
        -Summary $(if ($pluginReady) { "AutoCAD plugin install is healthy." } else { "AutoCAD plugin install needs attention." }) `
        -Details $autocadPlugin.Result.OutputTail `
        -Payload $autocadPlugin.Payload
    $steps += $autocadPluginStep
    Write-StepLog -Step $autocadPluginStep
}

if ($SkipBackend) {
    $backendSkippedStep = New-StepResult -Name "backend" -State "skipped" -Ok $true -Summary "Skipped backend bootstrap."
    $steps += $backendSkippedStep
    Write-StepLog -Step $backendSkippedStep
}
else {
    $backendStart = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-backend-startup.ps1" -Arguments @("-StartIfMissing", "-Json")
    $backendReady = $backendStart.Result.Ok -and $backendStart.Payload -and [bool]$backendStart.Payload.Running
    $backendStep = New-StepResult `
        -Name "backend" `
        -State $(if ($backendReady) { "ready" } else { "failed" }) `
        -Ok $backendReady `
        -Summary $(if ($backendReady) { "Backend is running." } else { "Backend is not running." }) `
        -Details $backendStart.Result.OutputTail `
        -Payload $backendStart.Payload
    $steps += $backendStep
    Write-StepLog -Step $backendStep
}

if ($SkipGateway) {
    $gatewaySkippedStep = New-StepResult -Name "gateway" -State "skipped" -Ok $true -Summary "Skipped gateway bootstrap."
    $steps += $gatewaySkippedStep
    Write-StepLog -Step $gatewaySkippedStep
}
else {
    $gatewayStart = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-gateway-startup.ps1" -Arguments @("-StartIfMissing", "-Json")
    $gatewayReady = $gatewayStart.Result.Ok -and $gatewayStart.Payload -and [bool]$gatewayStart.Payload.Healthy
    $gatewayStarting = $gatewayStart.Result.Ok -and $gatewayStart.Payload -and (-not [bool]$gatewayStart.Payload.Healthy) -and [bool]$gatewayStart.Payload.Running
    $gatewayState = if ($gatewayReady) {
        "ready"
    }
    elseif ($gatewayStarting) {
        "starting"
    }
    else {
        "failed"
    }
    $gatewayOk = $gatewayReady -or $gatewayStarting
    $gatewaySummary = switch ($gatewayState) {
        "ready" { "Gateway is healthy." ; break }
        "starting" { "Gateway process is running and still warming up." ; break }
        default { "Gateway is not healthy." ; break }
    }
    $gatewayStep = New-StepResult `
        -Name "gateway" `
        -State $gatewayState `
        -Ok $gatewayOk `
        -Summary $gatewaySummary `
        -Details $gatewayStart.Result.OutputTail `
        -Payload $gatewayStart.Payload
    $steps += $gatewayStep
    Write-StepLog -Step $gatewayStep
}

if ($SkipFrontend) {
    $frontendSkippedStep = New-StepResult -Name "frontend" -State "skipped" -Ok $true -Summary "Skipped frontend bootstrap."
    $steps += $frontendSkippedStep
    Write-StepLog -Step $frontendSkippedStep
}
else {
    $frontendStart = Invoke-JsonPowerShellScript -ScriptRelativePath $frontendCheckScript -Arguments @("-StartIfMissing", "-Json")
    $frontendReady = $frontendStart.Result.Ok -and $frontendStart.Payload -and [bool]$frontendStart.Payload.Healthy
    $frontendStarting = $frontendStart.Result.Ok -and $frontendStart.Payload -and (-not [bool]$frontendStart.Payload.Healthy) -and [bool]$frontendStart.Payload.Running
    $frontendState = if ($frontendReady) {
        "ready"
    }
    elseif ($frontendStarting) {
        "starting"
    }
    else {
        "failed"
    }
    $frontendOk = $frontendReady -or $frontendStarting
    $frontendSummary = switch ($frontendState) {
        "ready" { "Frontend dev server is ready." ; break }
        "starting" { "Frontend process is running and still warming up." ; break }
        default { "Frontend dev server is not healthy." ; break }
    }
    $frontendStep = New-StepResult `
        -Name "frontend" `
        -State $frontendState `
        -Ok $frontendOk `
        -Summary $frontendSummary `
        -Details $frontendStart.Result.OutputTail `
        -Payload $frontendStart.Payload
    $steps += $frontendStep
    Write-StepLog -Step $frontendStep
}

$overallOk = $true
foreach ($step in $steps) {
    if (-not $step.ok) {
        $overallOk = $false
        break
    }
}

$result = [ordered]@{
    ok = $overallOk
    repoRoot = $resolvedRepoRoot
    codexConfigPath = $CodexConfigPath
    steps = @($steps)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Suite runtime bootstrap: $(if ($overallOk) { 'ok' } else { 'needs_attention' })"
    Write-Host "Repo root: $resolvedRepoRoot"
    foreach ($step in $steps) {
        Write-Host "- [$($step.state)] $($step.name): $($step.summary)"
        if ($step.details) {
            $indentedDetails = $step.details -replace "`r?`n", "`r`n  "
            Write-Host "  $indentedDetails"
        }
    }
}

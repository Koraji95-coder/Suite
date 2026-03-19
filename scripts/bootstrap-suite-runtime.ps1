[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [switch]$SkipSupabase,
    [switch]$SkipWatchdog,
    [switch]$SkipBackend,
    [switch]$SkipGateway,
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
    return Invoke-ExternalCommand -FilePath "node" -Arguments (@($scriptPath) + $Arguments) -WorkingDirectory $resolvedRepoRoot
}

function Invoke-PowerShellScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptRelativePath,
        [string[]]$Arguments
    )

    $scriptPath = Join-Path $resolvedRepoRoot $ScriptRelativePath
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

$steps = @()

if ($SkipSupabase) {
    $steps += New-StepResult -Name "supabase" -State "skipped" -Ok $true -Summary "Skipped local Supabase bootstrap."
}
else {
    $supabaseStart = Invoke-NodeScript -ScriptRelativePath "scripts\run-supabase-cli.mjs" -Arguments @("start")
    $supabaseStartReady = $supabaseStart.Ok -or ($supabaseStart.OutputText -match "(?im)\balready running\b")
    if ($supabaseStartReady) {
        $steps += New-StepResult -Name "supabase-start" -State "ready" -Ok $true -Summary "Local Supabase stack is running." -Details $supabaseStart.OutputTail
        $supabaseEnv = Invoke-NodeScript -ScriptRelativePath "scripts\write-supabase-local-env.mjs" -Arguments @()
        if ($supabaseEnv.Ok) {
            $steps += New-StepResult -Name "supabase-env" -State "ready" -Ok $true -Summary "Local Supabase env overrides were refreshed." -Details $supabaseEnv.OutputTail
        }
        else {
            $steps += New-StepResult -Name "supabase-env" -State "failed" -Ok $false -Summary "Local Supabase env overrides were not refreshed." -Details $supabaseEnv.OutputTail
        }
    }
    else {
        $steps += New-StepResult -Name "supabase-start" -State "failed" -Ok $false -Summary "Local Supabase stack did not start." -Details $supabaseStart.OutputTail
        $steps += New-StepResult -Name "supabase-env" -State "skipped" -Ok $true -Summary "Skipped local Supabase env refresh because Supabase did not start."
    }
}

if ($SkipWatchdog) {
    $steps += New-StepResult -Name "watchdog" -State "skipped" -Ok $true -Summary "Skipped Watchdog runtime bootstrap."
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
    $steps += New-StepResult `
        -Name "watchdog-filesystem" `
        -State $(if ($filesystemReady) { "ready" } else { "failed" }) `
        -Ok $filesystemReady `
        -Summary $(if ($filesystemReady) { "Filesystem collector startup is installed and healthy." } else { "Filesystem collector startup needs attention." }) `
        -Details $filesystemDetails `
        -Payload $filesystemCheck.Payload

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
    $steps += New-StepResult `
        -Name "watchdog-autocad-startup" `
        -State $(if ($autocadStartupReady) { "ready" } else { "failed" }) `
        -Ok $autocadStartupReady `
        -Summary $(if ($autocadStartupReady) { "AutoCAD collector startup is installed and healthy." } else { "AutoCAD collector startup needs attention." }) `
        -Details $autocadDetails `
        -Payload $autocadCheck.Payload
    $steps += New-StepResult `
        -Name "watchdog-autocad-plugin" `
        -State $(if ($pluginReady) { "ready" } else { "failed" }) `
        -Ok $pluginReady `
        -Summary $(if ($pluginReady) { "AutoCAD plugin install is healthy." } else { "AutoCAD plugin install needs attention." }) `
        -Details $autocadPlugin.Result.OutputTail `
        -Payload $autocadPlugin.Payload
}

if ($SkipBackend) {
    $steps += New-StepResult -Name "backend" -State "skipped" -Ok $true -Summary "Skipped backend bootstrap."
}
else {
    $backendStart = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-backend-startup.ps1" -Arguments @("-StartIfMissing", "-Json")
    $backendReady = $backendStart.Result.Ok -and $backendStart.Payload -and [bool]$backendStart.Payload.Running
    $steps += New-StepResult `
        -Name "backend" `
        -State $(if ($backendReady) { "ready" } else { "failed" }) `
        -Ok $backendReady `
        -Summary $(if ($backendReady) { "Backend is running." } else { "Backend is not running." }) `
        -Details $backendStart.Result.OutputTail `
        -Payload $backendStart.Payload
}

if ($SkipGateway) {
    $steps += New-StepResult -Name "gateway" -State "skipped" -Ok $true -Summary "Skipped gateway bootstrap."
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
    $steps += New-StepResult `
        -Name "gateway" `
        -State $gatewayState `
        -Ok $gatewayOk `
        -Summary $gatewaySummary `
        -Details $gatewayStart.Result.OutputTail `
        -Payload $gatewayStart.Payload
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

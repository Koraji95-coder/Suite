[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$BootstrapLogPath,
    [string]$CurrentBootstrapPath,
    [ValidateRange(1, 5)][int]$BootstrapAttempt = 1,
    [ValidateRange(1, 5)][int]$BootstrapMaxAttempts = 1,
    [switch]$SkipSupabase,
    [switch]$SkipWatchdog,
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$bootstrapStateScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-bootstrap-state.ps1")).Path
$logUtilsScript = (Resolve-Path (Join-Path $PSScriptRoot "suite-runtime-log-utils.ps1")).Path
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
$runtimeCoreComposeScriptRelativePath = "scripts\runtime-core-compose.ps1"

. $bootstrapStateScript
. $logUtilsScript
. $runtimeSharedScript

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

    Write-SuiteRuntimeTranscriptEntry -Path $BootstrapLogPath -Message $Message -Tag $Tag
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

function Get-NormalizedStepFallbackLines {
    param([string]$Text)

    return @(Get-SuiteRuntimeTranscriptLines -Text $Text)
}

function Get-ReadableSupabaseLogLines {
    param([string]$Text)

    $normalizedLines = @(Get-NormalizedStepFallbackLines -Text $Text)
    if ($normalizedLines.Count -eq 0) {
        return @()
    }

    $readableLines = New-Object System.Collections.Generic.List[string]
    $section = $null

    foreach ($line in $normalizedLines) {
        $trimmed = [string]$line
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }

        switch -Regex ($trimmed) {
            "^(Development Tools|APIs|Database|Storage \(S3\)|Authentication Keys)$" {
                $section = $matches[1]
                continue
            }
            "^(Publishable|Secret|Access Key|Secret Key)\b" {
                continue
            }
            "^Try rerunning the command with --debug\b" {
                continue
            }
            "^.+container is not ready:\s*.+$" {
                continue
            }
            "^Using workdir\s+(.+)$" {
                $readableLines.Add(("Using workdir {0}" -f $matches[1])) | Out-Null
                continue
            }
            "^(supabase .*running\.)$" {
                $readableLines.Add($matches[1]) | Out-Null
                continue
            }
            "^(Stopped services:\s+.+)$" {
                $readableLines.Add($matches[1]) | Out-Null
                continue
            }
            "^(Studio|Mailpit|MCP|Project URL|REST|GraphQL)\s+(.+)$" {
                $readableLines.Add(("{0}: {1}" -f $matches[1], $matches[2])) | Out-Null
                continue
            }
            "^URL\s+(.+)$" {
                $value = $matches[1]
                if ($section -eq "Database" -or $value -match "^(?i)postgresql://") {
                    $readableLines.Add(("Database URL: {0}" -f $value)) | Out-Null
                }
                elseif ($section -eq "Storage (S3)" -or $value -match "(?i)/storage/v1/s3\b") {
                    $readableLines.Add(("Storage URL: {0}" -f $value)) | Out-Null
                }
                else {
                    $readableLines.Add(("URL: {0}" -f $value)) | Out-Null
                }
                continue
            }
            "^Region\s+(.+)$" {
                if ($section -eq "Storage (S3)") {
                    $readableLines.Add(("Storage region: {0}" -f $matches[1])) | Out-Null
                }
                continue
            }
            default {
                if (
                    $trimmed -notmatch "^(Development Tools|APIs|Database|Storage \(S3\)|Authentication Keys)$" -and
                    $trimmed -match "[A-Za-z]"
                ) {
                    $readableLines.Add($trimmed) | Out-Null
                }
            }
        }
    }

    return @($readableLines | Select-Object -Unique)
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
            $lines += Get-ReadableSupabaseLogLines -Text $FallbackText
        }
        "supabase-env" {
            $lines += Get-NormalizedStepFallbackLines -Text $FallbackText
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
                if ($payload.watchdogPlugin) {
                    if ($payload.watchdogPlugin.bundleRoot) {
                        $lines += "Watchdog bundle root: $($payload.watchdogPlugin.bundleRoot)"
                    }
                    foreach ($errorMessage in @($payload.watchdogPlugin.errors)) {
                        if (-not [string]::IsNullOrWhiteSpace([string]$errorMessage)) {
                            $lines += "Watchdog error: $errorMessage"
                        }
                    }
                }

                if ($payload.cadAuthoringPlugin) {
                    if ($payload.cadAuthoringPlugin.bundleRoot) {
                        $lines += "CAD authoring bundle root: $($payload.cadAuthoringPlugin.bundleRoot)"
                    }
                    foreach ($errorMessage in @($payload.cadAuthoringPlugin.errors)) {
                        if (-not [string]::IsNullOrWhiteSpace([string]$errorMessage)) {
                            $lines += "CAD authoring error: $errorMessage"
                        }
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
        $lines += Get-NormalizedStepFallbackLines -Text $FallbackText
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
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
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
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
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
    return Invoke-ExternalCommand -FilePath "PowerShell.exe" -Arguments (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $scriptPath) + $Arguments) -WorkingDirectory $resolvedRepoRoot
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

function Test-SupabaseOutputIndicatesReady {
    param([string]$Text)

    return (Test-SuiteSupabaseStatusReady -Text $Text -RepoRoot $resolvedRepoRoot)
}

function Wait-ForSupabaseRuntimeReady {
    param(
        [ValidateRange(1, 12)][int]$MaxAttempts = 6,
        [ValidateRange(1, 15)][int]$DelaySeconds = 5
    )

    $lastProbe = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
        $lastProbe = Invoke-NodeScript -ScriptRelativePath "scripts\run-supabase-cli.mjs" -Arguments @("status")
        $probeReady = $lastProbe.Ok -and (Test-SupabaseOutputIndicatesReady -Text $lastProbe.OutputText)
        if ($probeReady) {
            return [pscustomobject]@{
                Ready = $true
                Attempts = $attempt
                Probe = $lastProbe
            }
        }

        if ($attempt -lt $MaxAttempts) {
            Write-BootstrapLog -Tag "INFO" -Message ("Supabase status probe {0}/{1} is not ready yet." -f $attempt, $MaxAttempts)
            Start-Sleep -Seconds $DelaySeconds
        }
    }

    return [pscustomobject]@{
        Ready = $false
        Attempts = $MaxAttempts
        Probe = $lastProbe
    }
}

function Set-CurrentBootstrapStepStarted {
    param(
        [Parameter(Mandatory = $true)][string]$StepId,
        [Parameter(Mandatory = $true)][string]$StepLabel,
        [Parameter(Mandatory = $true)][string]$Summary
    )

    if ([string]::IsNullOrWhiteSpace($CurrentBootstrapPath)) {
        return
    }

    Update-SuiteRuntimeBootstrapState -Path $CurrentBootstrapPath -Properties ([ordered]@{
        running = $true
        done = $false
        ok = $false
        attempt = $BootstrapAttempt
        maxAttempts = $BootstrapMaxAttempts
        currentStepId = $StepId
        currentStepLabel = $StepLabel
        summary = $Summary
    }) -RemoveFailedStepIds @($StepId) | Out-Null
}

function Complete-CurrentBootstrapStep {
    param(
        [Parameter(Mandatory = $true)][string]$StepId,
        [Parameter(Mandatory = $true)][string]$StepLabel,
        [Parameter(Mandatory = $true)][string]$Summary
    )

    if ([string]::IsNullOrWhiteSpace($CurrentBootstrapPath)) {
        return
    }

    Update-SuiteRuntimeBootstrapState -Path $CurrentBootstrapPath -Properties ([ordered]@{
        running = $true
        done = $false
        ok = $false
        attempt = $BootstrapAttempt
        maxAttempts = $BootstrapMaxAttempts
        currentStepId = $StepId
        currentStepLabel = $StepLabel
        summary = $Summary
    }) -AddCompletedStepIds @($StepId) -RemoveFailedStepIds @($StepId) | Out-Null
}

function Fail-CurrentBootstrapStep {
    param(
        [Parameter(Mandatory = $true)][string]$StepId,
        [Parameter(Mandatory = $true)][string]$StepLabel,
        [Parameter(Mandatory = $true)][string]$Summary
    )

    if ([string]::IsNullOrWhiteSpace($CurrentBootstrapPath)) {
        return
    }

    Update-SuiteRuntimeBootstrapState -Path $CurrentBootstrapPath -Properties ([ordered]@{
        running = $true
        done = $false
        ok = $false
        attempt = $BootstrapAttempt
        maxAttempts = $BootstrapMaxAttempts
        currentStepId = $StepId
        currentStepLabel = $StepLabel
        summary = $Summary
    }) -AddFailedStepIds @($StepId) | Out-Null
}

function Wait-ForJsonServiceReady {
    param(
        [Parameter(Mandatory = $true)][string]$StepId,
        [Parameter(Mandatory = $true)][string]$VerificationLabel,
        [Parameter(Mandatory = $true)][string]$ScriptRelativePath,
        [Parameter(Mandatory = $true)][scriptblock]$IsReady,
        [ValidateRange(1, 12)][int]$MaxAttempts = 6,
        [ValidateRange(1, 15)][int]$DelaySeconds = 5
    )

    $lastProbe = $null
    Set-CurrentBootstrapStepStarted `
        -StepId $StepId `
        -StepLabel "Verifying $VerificationLabel health." `
        -Summary "Verifying $VerificationLabel health."

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
        $lastProbe = Invoke-JsonPowerShellScript -ScriptRelativePath $ScriptRelativePath -Arguments @("-Json")
        $probeReady = & $IsReady $lastProbe
        if ($probeReady) {
            return [pscustomobject]@{
                Ready = $true
                Attempts = $attempt
                Probe = $lastProbe
            }
        }

        if ($attempt -lt $MaxAttempts) {
            Write-BootstrapLog -Tag "INFO" -Message ("{0} status probe {1}/{2} is not healthy yet." -f $VerificationLabel, $attempt, $MaxAttempts)
            Start-Sleep -Seconds $DelaySeconds
        }
    }

    return [pscustomobject]@{
        Ready = $false
        Attempts = $MaxAttempts
        Probe = $lastProbe
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
    Set-CurrentBootstrapStepStarted `
        -StepId "supabase-start" `
        -StepLabel "Starting local Supabase stack." `
        -Summary "Starting local Supabase stack."
    $supabaseStart = Invoke-NodeScript -ScriptRelativePath "scripts\run-supabase-cli.mjs" -Arguments @("start")
    $supabaseStartReady = $supabaseStart.Ok -or (Test-SupabaseOutputIndicatesReady -Text $supabaseStart.OutputText)
    $supabaseStatusCheck = $null
    if (-not $supabaseStartReady) {
        Write-BootstrapLog -Tag "INFO" -Message "Supabase start did not report ready immediately; verifying local stack readiness."
        Set-CurrentBootstrapStepStarted `
            -StepId "supabase-start" `
            -StepLabel "Verifying local Supabase readiness." `
            -Summary "Verifying local Supabase readiness."
        $supabaseStatusCheck = Wait-ForSupabaseRuntimeReady
        $supabaseStartReady = [bool]$supabaseStatusCheck.Ready
    }
    $supabaseDetailsParts = @($supabaseStart.OutputText)
    if ($supabaseStatusCheck -and $supabaseStatusCheck.Probe -and $supabaseStatusCheck.Probe.OutputText) {
        $supabaseDetailsParts += $supabaseStatusCheck.Probe.OutputText
    }
    $supabaseRawDetails = [string]::Join(
        [Environment]::NewLine,
        @($supabaseDetailsParts | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    ).Trim()
    $supabaseDetails = [string]::Join(
        [Environment]::NewLine,
        @(Get-ReadableSupabaseLogLines -Text $supabaseRawDetails)
    ).Trim()
    if ([string]::IsNullOrWhiteSpace($supabaseDetails)) {
        $supabaseDetails = $supabaseRawDetails
    }
    if ($supabaseStartReady) {
        $supabaseStartStep = New-StepResult -Name "supabase-start" -State "ready" -Ok $true -Summary "Local Supabase stack is running." -Details $supabaseDetails
        $steps += $supabaseStartStep
        Write-StepLog -Step $supabaseStartStep -FallbackText $supabaseDetails
        Complete-CurrentBootstrapStep `
            -StepId "supabase-start" `
            -StepLabel "Supabase is ready." `
            -Summary "Local Supabase stack is running."

        Set-CurrentBootstrapStepStarted `
            -StepId "supabase-env" `
            -StepLabel "Refreshing local Supabase env overrides." `
            -Summary "Refreshing local Supabase env overrides."
        $supabaseEnv = Invoke-NodeScript -ScriptRelativePath "scripts\write-supabase-local-env.mjs" -Arguments @()
        if ($supabaseEnv.Ok) {
            $supabaseEnvStep = New-StepResult -Name "supabase-env" -State "ready" -Ok $true -Summary "Local Supabase env overrides were refreshed." -Details $supabaseEnv.OutputTail
            $steps += $supabaseEnvStep
            Write-StepLog -Step $supabaseEnvStep -FallbackText $supabaseEnv.OutputTail
            Complete-CurrentBootstrapStep `
                -StepId "supabase-env" `
                -StepLabel "Supabase env overrides are ready." `
                -Summary "Local Supabase env overrides were refreshed."
        }
        else {
            $supabaseEnvStep = New-StepResult -Name "supabase-env" -State "failed" -Ok $false -Summary "Local Supabase env overrides were not refreshed." -Details $supabaseEnv.OutputTail
            $steps += $supabaseEnvStep
            Write-StepLog -Step $supabaseEnvStep -FallbackText $supabaseEnv.OutputTail
            Fail-CurrentBootstrapStep `
                -StepId "supabase-env" `
                -StepLabel "Supabase env refresh failed." `
                -Summary "Local Supabase env overrides were not refreshed."
        }
    }
    else {
        $supabaseStartStep = New-StepResult -Name "supabase-start" -State "failed" -Ok $false -Summary "Local Supabase stack did not start." -Details $supabaseDetails
        $steps += $supabaseStartStep
        Write-StepLog -Step $supabaseStartStep -FallbackText $supabaseDetails
        Fail-CurrentBootstrapStep `
            -StepId "supabase-start" `
            -StepLabel "Supabase did not become ready." `
            -Summary "Local Supabase stack did not start."
        $supabaseEnvStep = New-StepResult -Name "supabase-env" -State "skipped" -Ok $true -Summary "Skipped local Supabase env refresh because Supabase did not start."
        $steps += $supabaseEnvStep
        Write-StepLog -Step $supabaseEnvStep
    }
}

$runtimeCoreServicesToStart = @()
if (-not $SkipBackend) {
    $runtimeCoreServicesToStart += "backend"
}
if (-not $SkipFrontend) {
    $runtimeCoreServicesToStart += "frontend"
}

if ($runtimeCoreServicesToStart.Count -eq 0) {
    $runtimeCoreSkippedStep = New-StepResult -Name "runtime-core-up" -State "skipped" -Ok $true -Summary "Skipped runtime core compose bring-up."
    $steps += $runtimeCoreSkippedStep
    Write-StepLog -Step $runtimeCoreSkippedStep
}
else {
    $runtimeCoreLabel = [string]::Join(", ", @($runtimeCoreServicesToStart))
    Set-CurrentBootstrapStepStarted `
        -StepId "runtime-core-up" `
        -StepLabel "Starting runtime core services through Docker." `
        -Summary "Starting runtime core services through Docker."
    $runtimeCoreUpArguments = @(
        "up",
        "-Services",
        [string]::Join(",", @($runtimeCoreServicesToStart))
    ) + @(
        "-Json"
    )
    $runtimeCoreUp = Invoke-JsonPowerShellScript `
        -ScriptRelativePath $runtimeCoreComposeScriptRelativePath `
        -Arguments $runtimeCoreUpArguments
    $runtimeCoreUpOk = $runtimeCoreUp.Result.Ok -and $runtimeCoreUp.Payload -and [bool]$runtimeCoreUp.Payload.ok
    $runtimeCoreUpDetails = if ($runtimeCoreUp.Payload -and -not [string]::IsNullOrWhiteSpace([string]$runtimeCoreUp.Payload.outputText)) {
        [string]$runtimeCoreUp.Payload.outputText
    }
    else {
        [string]$runtimeCoreUp.Result.OutputTail
    }
    $runtimeCoreStep = New-StepResult `
        -Name "runtime-core-up" `
        -State $(if ($runtimeCoreUpOk) { "ready" } else { "failed" }) `
        -Ok $runtimeCoreUpOk `
        -Summary $(if ($runtimeCoreUpOk) { "Runtime core Docker services are up: $runtimeCoreLabel." } else { "Runtime core Docker bring-up failed for: $runtimeCoreLabel." }) `
        -Details $runtimeCoreUpDetails `
        -Payload $runtimeCoreUp.Payload
    $steps += $runtimeCoreStep
    Write-StepLog -Step $runtimeCoreStep -FallbackText $runtimeCoreUpDetails
    if ($runtimeCoreUpOk) {
        Complete-CurrentBootstrapStep `
            -StepId "runtime-core-up" `
            -StepLabel "Runtime core Docker services are ready to verify." `
            -Summary "Runtime core Docker services are up."
    }
    else {
        Fail-CurrentBootstrapStep `
            -StepId "runtime-core-up" `
            -StepLabel "Runtime core Docker bring-up failed." `
            -Summary "Runtime core Docker bring-up failed."
    }
}

if ($SkipWatchdog) {
    $watchdogSkippedStep = New-StepResult -Name "watchdog" -State "skipped" -Ok $true -Summary "Skipped Watchdog runtime bootstrap."
    $steps += $watchdogSkippedStep
    Write-StepLog -Step $watchdogSkippedStep
}
else {
    Set-CurrentBootstrapStepStarted `
        -StepId "watchdog-filesystem" `
        -StepLabel "Ensuring filesystem collector startup." `
        -Summary "Ensuring filesystem collector startup."
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
    if ($filesystemReady) {
        Complete-CurrentBootstrapStep `
            -StepId "watchdog-filesystem" `
            -StepLabel "Filesystem collector is ready." `
            -Summary "Filesystem collector startup is installed and healthy."
    }
    else {
        Fail-CurrentBootstrapStep `
            -StepId "watchdog-filesystem" `
            -StepLabel "Filesystem collector needs attention." `
            -Summary "Filesystem collector startup needs attention."
    }

    Set-CurrentBootstrapStepStarted `
        -StepId "watchdog-autocad-startup" `
        -StepLabel "Ensuring AutoCAD collector startup." `
        -Summary "Ensuring AutoCAD collector startup."
    $autocadInstall = Invoke-PowerShellScript -ScriptRelativePath "scripts\install-watchdog-autocad-collector-startup.ps1" -Arguments @()
    $autocadCheck = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-autocad-collector-startup.ps1" -Arguments @("-StartIfMissing", "-Json")
    $autocadPlugin = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-autocad-plugin.ps1" -Arguments @("-Json")
    $cadAuthoringPlugin = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-suite-cad-authoring-plugin.ps1" -Arguments @("-Json")
    $cadAuthoringPluginInstall = $null
    if (-not ($cadAuthoringPlugin.Result.Ok -and $cadAuthoringPlugin.Payload -and [bool]$cadAuthoringPlugin.Payload.ok)) {
        $cadAuthoringPluginInstall = Invoke-PowerShellScript -ScriptRelativePath "scripts\install-suite-cad-authoring-plugin.ps1" -Arguments @()
        $cadAuthoringPlugin = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-suite-cad-authoring-plugin.ps1" -Arguments @("-Json")
    }
    $autocadStartupReady = $autocadCheck.Result.Ok -and $autocadCheck.Payload -and [bool]$autocadCheck.Payload.healthy
    $watchdogPluginReady = $autocadPlugin.Result.Ok -and $autocadPlugin.Payload -and [bool]$autocadPlugin.Payload.ok
    $cadAuthoringPluginReady = $cadAuthoringPlugin.Result.Ok -and $cadAuthoringPlugin.Payload -and [bool]$cadAuthoringPlugin.Payload.ok
    $pluginReady = $watchdogPluginReady -and $cadAuthoringPluginReady
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
    if ($autocadStartupReady) {
        Complete-CurrentBootstrapStep `
            -StepId "watchdog-autocad-startup" `
            -StepLabel "AutoCAD collector startup is ready." `
            -Summary "AutoCAD collector startup is installed and healthy."
    }
    else {
        Fail-CurrentBootstrapStep `
            -StepId "watchdog-autocad-startup" `
            -StepLabel "AutoCAD collector startup needs attention." `
            -Summary "AutoCAD collector startup needs attention."
    }

    Set-CurrentBootstrapStepStarted `
        -StepId "watchdog-autocad-plugin" `
        -StepLabel "Verifying AutoCAD plugin installs." `
        -Summary "Verifying AutoCAD plugin installs."
    $pluginDetails = @()
    if ($autocadPlugin.Result.OutputTail) {
        $pluginDetails += $autocadPlugin.Result.OutputTail
    }
    if ($cadAuthoringPluginInstall -and $cadAuthoringPluginInstall.OutputTail) {
        $pluginDetails += $cadAuthoringPluginInstall.OutputTail
    }
    if ($cadAuthoringPlugin.Result.OutputTail) {
        $pluginDetails += $cadAuthoringPlugin.Result.OutputTail
    }
    $autocadPluginStep = New-StepResult `
        -Name "watchdog-autocad-plugin" `
        -State $(if ($pluginReady) { "ready" } else { "failed" }) `
        -Ok $pluginReady `
        -Summary $(if ($pluginReady) { "AutoCAD plugin installs are healthy." } else { "AutoCAD plugin installs need attention." }) `
        -Details ([string]::Join([Environment]::NewLine, @($pluginDetails))) `
        -Payload ([pscustomobject]@{
            watchdogPlugin = $autocadPlugin.Payload
            cadAuthoringPlugin = $cadAuthoringPlugin.Payload
        })
    $steps += $autocadPluginStep
    Write-StepLog -Step $autocadPluginStep
    if ($pluginReady) {
        Complete-CurrentBootstrapStep `
            -StepId "watchdog-autocad-plugin" `
            -StepLabel "AutoCAD plugins are ready." `
            -Summary "AutoCAD plugin installs are healthy."
    }
    else {
        Fail-CurrentBootstrapStep `
            -StepId "watchdog-autocad-plugin" `
            -StepLabel "AutoCAD plugins need attention." `
            -Summary "AutoCAD plugin installs need attention."
    }
}

if ($SkipBackend) {
    $backendSkippedStep = New-StepResult -Name "backend" -State "skipped" -Ok $true -Summary "Skipped backend bootstrap."
    $steps += $backendSkippedStep
    Write-StepLog -Step $backendSkippedStep
}
else {
    Set-CurrentBootstrapStepStarted `
        -StepId "backend" `
        -StepLabel "Ensuring Watchdog backend availability." `
        -Summary "Ensuring Watchdog backend availability."
    $backendStart = Invoke-JsonPowerShellScript -ScriptRelativePath "scripts\check-watchdog-backend-startup.ps1" -Arguments @("-StartIfMissing", "-Json")
    $backendReady = $backendStart.Result.Ok -and $backendStart.Payload -and [bool]$backendStart.Payload.Healthy -and ([string]$backendStart.Payload.StartupMode -eq "docker_compose")
    $backendStarting = $backendStart.Result.Ok -and $backendStart.Payload -and (-not [bool]$backendStart.Payload.Healthy) -and ([string]$backendStart.Payload.StartupMode -eq "docker_compose") -and [bool]$backendStart.Payload.Running
    $backendStatusCheck = $null
    if (-not $backendReady -and $backendStarting) {
        Write-BootstrapLog -Tag "INFO" -Message "Backend did not report healthy immediately; verifying Docker readiness."
        $backendStatusCheck = Wait-ForJsonServiceReady `
            -StepId "backend" `
            -VerificationLabel "backend" `
            -ScriptRelativePath "scripts\check-watchdog-backend-startup.ps1" `
            -IsReady {
                param($probe)
                return $probe.Result.Ok -and $probe.Payload -and [bool]$probe.Payload.Healthy -and ([string]$probe.Payload.StartupMode -eq "docker_compose")
            }
        $backendReady = [bool]$backendStatusCheck.Ready
    }
    $backendDetailsParts = @($backendStart.Result.OutputTail)
    if ($backendStatusCheck -and $backendStatusCheck.Probe -and $backendStatusCheck.Probe.Result.OutputTail) {
        $backendDetailsParts += $backendStatusCheck.Probe.Result.OutputTail
    }
    $backendDetails = [string]::Join(
        [Environment]::NewLine,
        @($backendDetailsParts | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    ).Trim()
    $backendStep = New-StepResult `
        -Name "backend" `
        -State $(if ($backendReady) { "ready" } else { "failed" }) `
        -Ok $backendReady `
        -Summary $(if ($backendReady) { "Backend Docker service is healthy." } else { "Backend Docker service is not healthy." }) `
        -Details $backendDetails `
        -Payload $(if ($backendStatusCheck -and $backendStatusCheck.Probe -and $backendStatusCheck.Probe.Payload) { $backendStatusCheck.Probe.Payload } else { $backendStart.Payload })
    $steps += $backendStep
    Write-StepLog -Step $backendStep -FallbackText $backendDetails
    if ($backendReady) {
        Complete-CurrentBootstrapStep `
            -StepId "backend" `
            -StepLabel "Watchdog backend is ready." `
            -Summary "Backend Docker service is healthy."
    }
    else {
        Fail-CurrentBootstrapStep `
            -StepId "backend" `
            -StepLabel "Watchdog backend is not healthy." `
            -Summary "Backend Docker service is not healthy."
    }
}

if ($SkipFrontend) {
    $frontendSkippedStep = New-StepResult -Name "frontend" -State "skipped" -Ok $true -Summary "Skipped frontend bootstrap."
    $steps += $frontendSkippedStep
    Write-StepLog -Step $frontendSkippedStep
}
else {
    Set-CurrentBootstrapStepStarted `
        -StepId "frontend" `
        -StepLabel "Ensuring Suite frontend availability." `
        -Summary "Ensuring Suite frontend availability."
    $frontendStart = Invoke-JsonPowerShellScript -ScriptRelativePath $frontendCheckScript -Arguments @("-StartIfMissing", "-Json")
    $frontendReady = $frontendStart.Result.Ok -and $frontendStart.Payload -and [bool]$frontendStart.Payload.Healthy
    $frontendStarting = $frontendStart.Result.Ok -and $frontendStart.Payload -and (-not [bool]$frontendStart.Payload.Healthy) -and [bool]$frontendStart.Payload.Running
    $frontendStatusCheck = $null
    if (-not $frontendReady -and $frontendStarting) {
        Write-BootstrapLog -Tag "INFO" -Message "Frontend did not report healthy immediately; verifying local readiness."
        $frontendStatusCheck = Wait-ForJsonServiceReady `
            -StepId "frontend" `
            -VerificationLabel "frontend" `
            -ScriptRelativePath $frontendCheckScript `
            -IsReady {
                param($probe)
                return $probe.Result.Ok -and $probe.Payload -and [bool]$probe.Payload.Healthy
            }
        $frontendReady = [bool]$frontendStatusCheck.Ready
    }
    $frontendDetailsParts = @($frontendStart.Result.OutputTail)
    if ($frontendStatusCheck -and $frontendStatusCheck.Probe -and $frontendStatusCheck.Probe.Result.OutputTail) {
        $frontendDetailsParts += $frontendStatusCheck.Probe.Result.OutputTail
    }
    $frontendDetails = [string]::Join(
        [Environment]::NewLine,
        @($frontendDetailsParts | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    ).Trim()
    $frontendState = if ($frontendReady) { "ready" } else { "failed" }
    $frontendSummary = if ($frontendReady) { "Frontend dev server is ready." } else { "Frontend dev server is not healthy." }
    $frontendStep = New-StepResult `
        -Name "frontend" `
        -State $frontendState `
        -Ok $frontendReady `
        -Summary $frontendSummary `
        -Details $frontendDetails `
        -Payload $(if ($frontendStatusCheck -and $frontendStatusCheck.Probe -and $frontendStatusCheck.Probe.Payload) { $frontendStatusCheck.Probe.Payload } else { $frontendStart.Payload })
    $steps += $frontendStep
    Write-StepLog -Step $frontendStep -FallbackText $frontendDetails
    if ($frontendReady) {
        Complete-CurrentBootstrapStep `
            -StepId "frontend" `
            -StepLabel "Suite frontend is ready." `
            -Summary "Frontend dev server is ready."
    }
    else {
        Fail-CurrentBootstrapStep `
            -StepId "frontend" `
            -StepLabel "Suite frontend is not healthy." `
            -Summary "Frontend dev server is not healthy."
    }
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

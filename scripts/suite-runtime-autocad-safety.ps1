Set-StrictMode -Version Latest

$script:SuiteRuntimeAutoCadSafetyRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:SuiteRuntimeAutoCadReadinessScriptPath = Join-Path $script:SuiteRuntimeAutoCadSafetyRoot "check-watchdog-autocad-readiness.ps1"

function ConvertFrom-SuiteRuntimeJsonText {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace([string]$Text)) {
        return $null
    }

    try {
        return ([string]$Text | ConvertFrom-Json)
    }
    catch {
        $raw = [string]$Text
        $start = $raw.IndexOf("{")
        $end = $raw.LastIndexOf("}")
        if ($start -lt 0 -or $end -le $start) {
            return $null
        }

        try {
            return ($raw.Substring($start, ($end - $start) + 1) | ConvertFrom-Json)
        }
        catch {
            return $null
        }
    }
}

function Invoke-SuiteRuntimeJsonPowerShellScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments
    )

    $rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
    $outputText = [string]::Join(
        [Environment]::NewLine,
        @(
            $rawOutput | ForEach-Object {
                if ($null -eq $_) {
                    ""
                }
                else {
                    $_.ToString()
                }
            }
        )
    ).Trim()

    [pscustomobject]@{
        Ok = ($exitCode -eq 0)
        ExitCode = $exitCode
        OutputText = $outputText
        Payload = ConvertFrom-SuiteRuntimeJsonText -Text $outputText
    }
}

function Get-SuiteRuntimeAutoCadStopSafety {
    param(
        [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
        [string]$WorkstationId
    )

    if (-not (Test-Path $script:SuiteRuntimeAutoCadReadinessScriptPath)) {
        return [ordered]@{
            ok = $false
            state = "uncertain"
            shouldSkipStop = $true
            reason = "AutoCAD readiness telemetry is unavailable."
            drawingName = $null
            drawingPath = $null
            currentSessionId = $null
            trackerFresh = $false
            collectorFresh = $false
            readinessStatus = "unknown"
            payload = $null
        }
    }

    $arguments = @("-Json", "-CodexConfigPath", $CodexConfigPath)
    if (-not [string]::IsNullOrWhiteSpace($WorkstationId)) {
        $arguments += @("-WorkstationId", $WorkstationId)
    }

    $result = Invoke-SuiteRuntimeJsonPowerShellScript -ScriptPath $script:SuiteRuntimeAutoCadReadinessScriptPath -Arguments $arguments
    if (-not $result.Ok -or $null -eq $result.Payload) {
        return [ordered]@{
            ok = $false
            state = "uncertain"
            shouldSkipStop = $true
            reason = "AutoCAD telemetry could not be read safely."
            drawingName = $null
            drawingPath = $null
            currentSessionId = $null
            trackerFresh = $false
            collectorFresh = $false
            readinessStatus = "unknown"
            payload = $result.Payload
        }
    }

    $tracker = $result.Payload.trackerState
    $collector = $result.Payload.collectorState
    $trackerFresh = [bool]($tracker -and $tracker.healthy)
    $collectorFresh = [bool]($collector -and $collector.healthy)

    $drawingPath = $null
    if ($collector -and -not [string]::IsNullOrWhiteSpace([string]$collector.activeDrawingPath)) {
        $drawingPath = [string]$collector.activeDrawingPath
    }
    elseif ($tracker -and -not [string]::IsNullOrWhiteSpace([string]$tracker.activeDrawingPath)) {
        $drawingPath = [string]$tracker.activeDrawingPath
    }

    $drawingName = $null
    if ($tracker -and -not [string]::IsNullOrWhiteSpace([string]$tracker.activeDrawing)) {
        $drawingName = [string]$tracker.activeDrawing
    }
    elseif (-not [string]::IsNullOrWhiteSpace($drawingPath)) {
        $drawingName = Split-Path -Leaf $drawingPath
    }

    $currentSessionId = $null
    if ($collector -and -not [string]::IsNullOrWhiteSpace([string]$collector.currentSessionId)) {
        $currentSessionId = [string]$collector.currentSessionId
    }
    elseif ($tracker -and -not [string]::IsNullOrWhiteSpace([string]$tracker.currentSessionId)) {
        $currentSessionId = [string]$tracker.currentSessionId
    }

    $hasActivitySignal = (
        -not [string]::IsNullOrWhiteSpace($drawingPath) -or
        -not [string]::IsNullOrWhiteSpace($drawingName) -or
        -not [string]::IsNullOrWhiteSpace($currentSessionId)
    )

    $state = "inactive"
    $reason = "Fresh AutoCAD telemetry does not show an active drawing."
    if (($trackerFresh -or $collectorFresh) -and $hasActivitySignal) {
        $state = "active"
        if (-not [string]::IsNullOrWhiteSpace($drawingName)) {
            $reason = "AutoCAD activity is active in '$drawingName'."
        }
        elseif (-not [string]::IsNullOrWhiteSpace($drawingPath)) {
            $reason = "AutoCAD activity is active in '$drawingPath'."
        }
        else {
            $reason = "AutoCAD telemetry reports an active drawing session."
        }
    }
    elseif (-not $trackerFresh -and -not $collectorFresh) {
        $state = "uncertain"
        $reason = "AutoCAD telemetry is stale or unavailable, so shutdown is being skipped for safety."
    }

    return [ordered]@{
        ok = $true
        state = $state
        shouldSkipStop = ($state -ne "inactive")
        reason = $reason
        drawingName = $drawingName
        drawingPath = $drawingPath
        currentSessionId = $currentSessionId
        trackerFresh = $trackerFresh
        collectorFresh = $collectorFresh
        readinessStatus = [string]$result.Payload.status
        payload = $result.Payload
    }
}

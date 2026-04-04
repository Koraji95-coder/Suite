$script:SuiteRuntimeBootstrapWeights = [ordered]@{
    "docker-ready" = 15
    "supabase-start" = 25
    "supabase-env" = 5
    "watchdog-filesystem" = 10
    "watchdog-autocad-startup" = 10
    "watchdog-autocad-plugin" = 5
    "backend" = 15
    "frontend" = 15
}

$script:SuiteRuntimeBootstrapLabels = [ordered]@{
    "docker-ready" = "Docker Engine"
    "supabase-start" = "Supabase"
    "supabase-env" = "Supabase Env"
    "watchdog-filesystem" = "Filesystem Collector"
    "watchdog-autocad-startup" = "AutoCAD Collector"
    "watchdog-autocad-plugin" = "AutoCAD Plugins"
    "backend" = "Watchdog Backend"
    "frontend" = "Suite Frontend"
}

function ConvertTo-SuiteRuntimeBootstrapInt {
    param(
        [object]$Value,
        [int]$Default = 0
    )

    if ($null -eq $Value) {
        return $Default
    }

    $converted = 0
    if ([int]::TryParse([string]$Value, [ref]$converted)) {
        return $converted
    }

    return $Default
}

function ConvertTo-SuiteRuntimeBootstrapBool {
    param(
        [object]$Value,
        [bool]$Default = $false
    )

    if ($null -eq $Value) {
        return $Default
    }

    if ($Value -is [bool]) {
        return [bool]$Value
    }

    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $Default
    }

    switch -Regex ($text) {
        "^(?i:true|1|yes)$" { return $true }
        "^(?i:false|0|no)$" { return $false }
    }

    return $Default
}

function Get-SuiteRuntimeBootstrapKnownStepIds {
    return @($script:SuiteRuntimeBootstrapWeights.Keys)
}

function Get-SuiteRuntimeBootstrapStepLabel {
    param([string]$StepId)

    if ([string]::IsNullOrWhiteSpace($StepId)) {
        return $null
    }

    if ($script:SuiteRuntimeBootstrapLabels.Contains($StepId)) {
        return [string]$script:SuiteRuntimeBootstrapLabels[$StepId]
    }

    return $StepId
}

function Merge-SuiteRuntimeBootstrapStepIds {
    param(
        [object]$ExistingStepIds,
        [object]$AdditionalStepIds
    )

    $knownOrder = Get-SuiteRuntimeBootstrapKnownStepIds
    $ordered = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    foreach ($candidate in @($ExistingStepIds) + @($AdditionalStepIds)) {
        if ($null -eq $candidate) {
            continue
        }

        $stepId = ([string]$candidate).Trim()
        if ([string]::IsNullOrWhiteSpace($stepId) -or $seen.ContainsKey($stepId)) {
            continue
        }

        $seen[$stepId] = $true
        $ordered.Add($stepId)
    }

    $known = New-Object System.Collections.Generic.List[string]
    foreach ($stepId in $knownOrder) {
        if ($seen.ContainsKey($stepId)) {
            $known.Add($stepId)
        }
    }

    $unknown = New-Object System.Collections.Generic.List[string]
    foreach ($stepId in $ordered) {
        if (-not $script:SuiteRuntimeBootstrapWeights.Contains($stepId)) {
            $unknown.Add($stepId)
        }
    }

    return @($known + $unknown)
}

function Remove-SuiteRuntimeBootstrapStepIds {
    param(
        [object]$SourceStepIds,
        [object]$StepIdsToRemove
    )

    $removals = @{}
    foreach ($candidate in @($StepIdsToRemove)) {
        if ($null -eq $candidate) {
            continue
        }

        $stepId = ([string]$candidate).Trim()
        if (-not [string]::IsNullOrWhiteSpace($stepId)) {
            $removals[$stepId] = $true
        }
    }

    $remaining = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $SourceStepIds -AdditionalStepIds @())) {
        if (-not $removals.ContainsKey($candidate)) {
            $remaining.Add($candidate)
        }
    }

    return @($remaining)
}

function Test-SuiteRuntimeBootstrapAllStepsComplete {
    param([object]$CompletedStepIds)

    $completed = @{}
    foreach ($stepId in @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $CompletedStepIds -AdditionalStepIds @())) {
        $completed[$stepId] = $true
    }

    foreach ($stepId in (Get-SuiteRuntimeBootstrapKnownStepIds)) {
        if (-not $completed.ContainsKey($stepId)) {
            return $false
        }
    }

    return $true
}

function Get-SuiteRuntimeBootstrapPercent {
    param(
        [object]$CompletedStepIds,
        [bool]$Done,
        [bool]$Ok,
        [Nullable[int]]$ExistingPercent = $null
    )

    $sum = 0
    foreach ($stepId in @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $CompletedStepIds -AdditionalStepIds @())) {
        if ($script:SuiteRuntimeBootstrapWeights.Contains($stepId)) {
            $sum += [int]$script:SuiteRuntimeBootstrapWeights[$stepId]
        }
    }

    $allComplete = Test-SuiteRuntimeBootstrapAllStepsComplete -CompletedStepIds $CompletedStepIds
    if ($Done -and $Ok -and $allComplete) {
        return 100
    }

    $highWater = if ($ExistingPercent -ne $null) { [int]$ExistingPercent } else { 0 }
    return [Math]::Min([Math]::Max($sum, $highWater), 99)
}

function Get-SuiteRuntimeBootstrapState {
    param([string]$Path)

    $state = [ordered]@{
        running = $false
        done = $false
        ok = $false
        attempt = 0
        maxAttempts = 0
        currentStepId = $null
        currentStepLabel = $null
        completedStepIds = @()
        failedStepIds = @()
        percent = 0
        summary = $null
        startedAt = $null
        updatedAt = $null
    }

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path $Path)) {
        return $state
    }

    try {
        $raw = Get-Content -Path $Path -Raw | ConvertFrom-Json
        $state.running = ConvertTo-SuiteRuntimeBootstrapBool -Value $raw.running
        $state.done = ConvertTo-SuiteRuntimeBootstrapBool -Value $raw.done
        $state.ok = ConvertTo-SuiteRuntimeBootstrapBool -Value $raw.ok
        $state.attempt = ConvertTo-SuiteRuntimeBootstrapInt -Value $raw.attempt
        $state.maxAttempts = ConvertTo-SuiteRuntimeBootstrapInt -Value $raw.maxAttempts
        $state.currentStepId = if ([string]::IsNullOrWhiteSpace([string]$raw.currentStepId)) { $null } else { [string]$raw.currentStepId }
        $state.currentStepLabel = if ([string]::IsNullOrWhiteSpace([string]$raw.currentStepLabel)) { $null } else { [string]$raw.currentStepLabel }
        $state.completedStepIds = @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $raw.completedStepIds -AdditionalStepIds @())
        $state.failedStepIds = @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $raw.failedStepIds -AdditionalStepIds @())
        $state.percent = ConvertTo-SuiteRuntimeBootstrapInt -Value $raw.percent
        $state.summary = if ([string]::IsNullOrWhiteSpace([string]$raw.summary)) { $null } else { [string]$raw.summary }
        $state.startedAt = if ([string]::IsNullOrWhiteSpace([string]$raw.startedAt)) { $null } else { [string]$raw.startedAt }
        $state.updatedAt = if ([string]::IsNullOrWhiteSpace([string]$raw.updatedAt)) { $null } else { [string]$raw.updatedAt }
    }
    catch {
        return $state
    }

    $state.percent = Get-SuiteRuntimeBootstrapPercent `
        -CompletedStepIds $state.completedStepIds `
        -Done ([bool]$state.done) `
        -Ok ([bool]$state.ok) `
        -ExistingPercent $state.percent

    return $state
}

function Save-SuiteRuntimeBootstrapState {
    param(
        [string]$Path,
        [System.Collections.IDictionary]$State
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $State
    }

    $directory = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $normalized = [ordered]@{
        running = ConvertTo-SuiteRuntimeBootstrapBool -Value $State.running
        done = ConvertTo-SuiteRuntimeBootstrapBool -Value $State.done
        ok = ConvertTo-SuiteRuntimeBootstrapBool -Value $State.ok
        attempt = ConvertTo-SuiteRuntimeBootstrapInt -Value $State.attempt
        maxAttempts = ConvertTo-SuiteRuntimeBootstrapInt -Value $State.maxAttempts
        currentStepId = if ([string]::IsNullOrWhiteSpace([string]$State.currentStepId)) { $null } else { [string]$State.currentStepId }
        currentStepLabel = if ([string]::IsNullOrWhiteSpace([string]$State.currentStepLabel)) { $null } else { [string]$State.currentStepLabel }
        completedStepIds = @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $State.completedStepIds -AdditionalStepIds @())
        failedStepIds = @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $State.failedStepIds -AdditionalStepIds @())
        percent = 0
        summary = if ([string]::IsNullOrWhiteSpace([string]$State.summary)) { $null } else { [string]$State.summary }
        startedAt = if ([string]::IsNullOrWhiteSpace([string]$State.startedAt)) { $null } else { [string]$State.startedAt }
        updatedAt = if ([string]::IsNullOrWhiteSpace([string]$State.updatedAt)) { $null } else { [string]$State.updatedAt }
    }

    $existingPercent = ConvertTo-SuiteRuntimeBootstrapInt -Value $State.percent
    $normalized.percent = Get-SuiteRuntimeBootstrapPercent `
        -CompletedStepIds $normalized.completedStepIds `
        -Done ([bool]$normalized.done) `
        -Ok ([bool]$normalized.ok) `
        -ExistingPercent $existingPercent

    $json = $normalized | ConvertTo-Json -Depth 6
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)

    return $normalized
}

function Update-SuiteRuntimeBootstrapState {
    param(
        [string]$Path,
        [System.Collections.IDictionary]$Properties = @{},
        [object]$AddCompletedStepIds = @(),
        [object]$RemoveCompletedStepIds = @(),
        [object]$AddFailedStepIds = @(),
        [object]$RemoveFailedStepIds = @(),
        [switch]$ResetCompletedStepIds,
        [switch]$ResetFailedStepIds,
        [string]$UpdatedAt
    )

    $state = Get-SuiteRuntimeBootstrapState -Path $Path

    if ($ResetCompletedStepIds) {
        $state.completedStepIds = @()
    }
    if ($ResetFailedStepIds) {
        $state.failedStepIds = @()
    }

    foreach ($key in @($Properties.Keys)) {
        $state[$key] = $Properties[$key]
    }

    $state.completedStepIds = @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $state.completedStepIds -AdditionalStepIds $AddCompletedStepIds)
    $state.completedStepIds = @(Remove-SuiteRuntimeBootstrapStepIds -SourceStepIds $state.completedStepIds -StepIdsToRemove $RemoveCompletedStepIds)
    $state.failedStepIds = @(Merge-SuiteRuntimeBootstrapStepIds -ExistingStepIds $state.failedStepIds -AdditionalStepIds $AddFailedStepIds)
    $state.failedStepIds = @(Remove-SuiteRuntimeBootstrapStepIds -SourceStepIds $state.failedStepIds -StepIdsToRemove $RemoveFailedStepIds)
    $state.updatedAt = if ([string]::IsNullOrWhiteSpace($UpdatedAt)) { (Get-Date).ToString("o") } else { $UpdatedAt }

    return Save-SuiteRuntimeBootstrapState -Path $Path -State $state
}

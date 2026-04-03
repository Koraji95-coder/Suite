Set-StrictMode -Version Latest

function Resolve-SuiteRuntimeRetentionBaseDirectory {
    param([string]$BaseDirectory)

    if (-not [string]::IsNullOrWhiteSpace($BaseDirectory)) {
        return $BaseDirectory
    }

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        return $env:LOCALAPPDATA
    }

    if (-not [string]::IsNullOrWhiteSpace($env:TEMP)) {
        return $env:TEMP
    }

    return $env:USERPROFILE
}

function Invoke-SuiteRuntimeLogRetention {
    [CmdletBinding()]
    param(
        [string]$BaseDirectory,
        [ValidateRange(1024, 104857600)][long]$MaxRuntimeLogBytes = 1048576,
        [ValidateRange(100, 50000)][int]$KeepRuntimeLogLines = 5000
    )

    $basePath = Resolve-SuiteRuntimeRetentionBaseDirectory -BaseDirectory $BaseDirectory
    $runtimeBootstrapDirectory = Join-Path $basePath "Suite\runtime-bootstrap"
    $results = New-Object System.Collections.Generic.List[object]
    $warnings = New-Object System.Collections.Generic.List[string]

    foreach ($logName in @("bootstrap.log", "frontend.log", "runtime-launcher.log", "runtime-shell.log")) {
        $logPath = Join-Path $runtimeBootstrapDirectory $logName
        $result = [ordered]@{
            Path = $logPath
            Trimmed = $false
            OriginalBytes = 0L
            FinalBytes = 0L
            KeptLines = 0
        }

        if (-not (Test-Path -LiteralPath $logPath)) {
            $null = $results.Add([pscustomobject]$result)
            continue
        }

        try {
            $item = Get-Item -LiteralPath $logPath -ErrorAction Stop
            $result.OriginalBytes = [long]$item.Length
            $result.FinalBytes = [long]$item.Length

            if ($item.Length -gt $MaxRuntimeLogBytes) {
                $tail = @(Get-Content -LiteralPath $logPath -Tail $KeepRuntimeLogLines -ErrorAction Stop)
                $result.KeptLines = $tail.Count
                Set-Content -LiteralPath $logPath -Value $tail -Encoding UTF8
                $updatedItem = Get-Item -LiteralPath $logPath -ErrorAction Stop
                $result.FinalBytes = [long]$updatedItem.Length
                $result.Trimmed = $true
            }
        }
        catch {
            $null = $warnings.Add(("Log retention skipped for {0}: {1}" -f $logPath, $_.Exception.Message))
        }

        $null = $results.Add([pscustomobject]$result)
    }

    return [pscustomobject]@{
        BaseDirectory = $basePath
        RuntimeBootstrapDirectory = $runtimeBootstrapDirectory
        LogResults = @($results.ToArray())
        Warnings = @($warnings.ToArray())
    }
}

function Invoke-SuiteRuntimeStageRetention {
    [CmdletBinding()]
    param(
        [string]$BaseDirectory,
        [ValidateRange(1, 20)][int]$KeepStageDirectories = 3
    )

    $basePath = Resolve-SuiteRuntimeRetentionBaseDirectory -BaseDirectory $BaseDirectory
    $runtimeControlDirectory = Join-Path $basePath "Suite\runtime-control"
    $removedStageDirectories = New-Object System.Collections.Generic.List[string]
    $warnings = New-Object System.Collections.Generic.List[string]

    if (Test-Path -LiteralPath $runtimeControlDirectory) {
        Get-ChildItem -LiteralPath $runtimeControlDirectory -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            Select-Object -Skip $KeepStageDirectories |
            ForEach-Object {
                try {
                    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
                    $null = $removedStageDirectories.Add($_.FullName)
                }
                catch {
                    $null = $warnings.Add(("Stage cleanup skipped for {0}: {1}" -f $_.FullName, $_.Exception.Message))
                }
            }
    }

    return [pscustomobject]@{
        BaseDirectory = $basePath
        RuntimeControlDirectory = $runtimeControlDirectory
        RemovedStageDirectories = @($removedStageDirectories.ToArray())
        Warnings = @($warnings.ToArray())
    }
}

function Invoke-SuiteRuntimeArtifactRetention {
    [CmdletBinding()]
    param(
        [string]$BaseDirectory,
        [ValidateRange(1, 20)][int]$KeepStageDirectories = 3,
        [ValidateRange(1024, 104857600)][long]$MaxRuntimeLogBytes = 1048576,
        [ValidateRange(100, 50000)][int]$KeepRuntimeLogLines = 5000
    )

    $logResult = Invoke-SuiteRuntimeLogRetention `
        -BaseDirectory $BaseDirectory `
        -MaxRuntimeLogBytes $MaxRuntimeLogBytes `
        -KeepRuntimeLogLines $KeepRuntimeLogLines
    $stageResult = Invoke-SuiteRuntimeStageRetention `
        -BaseDirectory $BaseDirectory `
        -KeepStageDirectories $KeepStageDirectories

    return [pscustomobject]@{
        BaseDirectory = $logResult.BaseDirectory
        RuntimeBootstrapDirectory = $logResult.RuntimeBootstrapDirectory
        RuntimeControlDirectory = $stageResult.RuntimeControlDirectory
        LogResults = @($logResult.LogResults)
        RemovedStageDirectories = @($stageResult.RemovedStageDirectories)
        Warnings = @($logResult.Warnings + $stageResult.Warnings)
    }
}

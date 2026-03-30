[CmdletBinding()]
param(
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror"),
    [string]$RepoRoot,
    [string]$WorkstationId,
    [string]$WorkstationLabel,
    [string]$WorkstationRole,
    [switch]$SkipBootstrap
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

$workstationConfigScriptCandidates = @(
    (Join-Path $PSScriptRoot "suite-workstation-config.ps1"),
    (Join-Path $RepoRoot "scripts\suite-workstation-config.ps1")
) | Select-Object -Unique
$workstationConfigScript = $workstationConfigScriptCandidates | Where-Object {
    Test-Path -LiteralPath $_
} | Select-Object -First 1

if (-not $workstationConfigScript) {
    throw "suite-workstation-config.ps1 was not found next to the restore script or under the repo root."
}

. $workstationConfigScript

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Restore-Directory {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        Write-Warning "Restore source missing: $Source"
        return
    }

    Ensure-Directory -Path (Split-Path -Parent $Destination)
    Ensure-Directory -Path $Destination

    $robocopyArgs = @(
        $Source,
        $Destination,
        "/MIR",
        "/FFT",
        "/R:1",
        "/W:1",
        "/NFL",
        "/NDL",
        "/NP",
        "/NJH",
        "/NJS",
        "/XJ"
    )

    & robocopy @robocopyArgs | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -gt 7) {
        throw "robocopy failed for '$Source' -> '$Destination' with exit code $exitCode."
    }
}

function Restore-File {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        Write-Warning "Restore source missing: $Source"
        return
    }

    Ensure-Directory -Path (Split-Path -Parent $Destination)
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Get-RelativePathText {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $resolvedBasePath = [System.IO.Path]::GetFullPath($BasePath)
    if (-not $resolvedBasePath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $resolvedBasePath += [string][System.IO.Path]::DirectorySeparatorChar
    }

    $baseUri = New-Object System.Uri($resolvedBasePath)
    $pathUri = New-Object System.Uri([System.IO.Path]::GetFullPath($Path))
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

function Restore-SelectedFiles {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot
    )

    if (-not (Test-Path -LiteralPath $SourceRoot)) {
        Write-Warning "Restore source missing: $SourceRoot"
        return
    }

    Ensure-Directory -Path $DestinationRoot
    foreach ($sourceFile in Get-ChildItem -LiteralPath $SourceRoot -Recurse -File -ErrorAction SilentlyContinue) {
        $resolvedSourceFile = [System.IO.Path]::GetFullPath($sourceFile.FullName)
        $relativePath = Get-RelativePathText -BasePath $SourceRoot -Path $resolvedSourceFile
        $destinationPath = Join-Path $DestinationRoot $relativePath
        Ensure-Directory -Path (Split-Path -Parent $destinationPath)
        Copy-Item -LiteralPath $resolvedSourceFile -Destination $destinationPath -Force
    }
}

function Merge-CodexSessionIndex {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        Write-Warning "Restore source missing: $Source"
        return
    }

    $entriesById = @{}
    $candidateFiles = @()
    if (Test-Path -LiteralPath $Destination) {
        $candidateFiles += $Destination
    }
    $candidateFiles += $Source

    foreach ($candidateFile in $candidateFiles) {
        foreach ($line in Get-Content -LiteralPath $candidateFile -ErrorAction SilentlyContinue) {
            if ([string]::IsNullOrWhiteSpace($line)) {
                continue
            }

            try {
                $entry = $line | ConvertFrom-Json
            }
            catch {
                continue
            }

            $id = [string]$entry.id
            if ([string]::IsNullOrWhiteSpace($id)) {
                continue
            }

            $updatedAt = [datetimeoffset]::MinValue
            if (-not [datetimeoffset]::TryParse([string]$entry.updated_at, [ref]$updatedAt)) {
                $updatedAt = [datetimeoffset]::MinValue
            }

            if (
                (-not $entriesById.ContainsKey($id)) -or
                ($updatedAt -gt $entriesById[$id].updatedAt)
            ) {
                $entriesById[$id] = [pscustomobject]@{
                    updatedAt = $updatedAt
                    json = ($entry | ConvertTo-Json -Compress -Depth 10)
                }
            }
        }
    }

    Ensure-Directory -Path (Split-Path -Parent $Destination)
    $orderedLines = @(
        $entriesById.GetEnumerator() |
            Sort-Object { $_.Value.updatedAt } -Descending |
            ForEach-Object { $_.Value.json }
    )
    Set-Content -LiteralPath $Destination -Value $orderedLines -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $MirrorRoot)) {
    throw "Mirror root does not exist: $MirrorRoot"
}

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repo root does not exist: $RepoRoot"
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$codexRoot = Join-Path $env:USERPROFILE ".codex"
$mirroredCodexSessionIndexPath = Join-Path $MirrorRoot "codex\session_index.jsonl"
$destinationCodexSessionIndexPath = Join-Path $codexRoot "session_index.jsonl"
$mirroredCodexSessionsRoot = Join-Path $MirrorRoot "codex\sessions"
$destinationCodexSessionsRoot = Join-Path $codexRoot "sessions"
$codexHandoffPath = Join-Path $MirrorRoot "codex-handoff.md"
$resolvedIdentity = Resolve-SuiteWorkstationProfile `
    -ResolvedRepoRoot $resolvedRepoRoot `
    -ExplicitWorkstationId $WorkstationId `
    -ExplicitWorkstationLabel $WorkstationLabel `
    -ExplicitWorkstationRole $WorkstationRole

$mappings = @(
    [pscustomobject]@{
        Name = "codex-skills"
        Type = "directory"
        Source = (Join-Path $MirrorRoot "codex\skills")
        Destination = (Join-Path $env:USERPROFILE ".codex\skills")
    },
    [pscustomobject]@{
        Name = "codex-config"
        Type = "file"
        Source = (Join-Path $MirrorRoot "codex\config.toml")
        Destination = (Join-Path $env:USERPROFILE ".codex\config.toml")
    },
    [pscustomobject]@{
        Name = "suite-learning"
        Type = "directory"
        Source = (Join-Path $MirrorRoot "suite\backend\.learning")
        Destination = (Join-Path $resolvedRepoRoot "backend\.learning")
    }
)

foreach ($mapping in $mappings) {
    if ($mapping.Type -eq "directory") {
        Restore-Directory -Source $mapping.Source -Destination $mapping.Destination
        continue
    }

    if ($mapping.Type -eq "file") {
        Restore-File -Source $mapping.Source -Destination $mapping.Destination
        continue
    }

    throw "Unsupported mapping type '$($mapping.Type)' for '$($mapping.Name)'."
}

$codexConfigPath = Join-Path $env:USERPROFILE ".codex\config.toml"
Update-SuiteCodexConfig `
    -Path $codexConfigPath `
    -ResolvedRepoRoot $resolvedRepoRoot `
    -WorkstationProfile $resolvedIdentity

Merge-CodexSessionIndex `
    -Source $mirroredCodexSessionIndexPath `
    -Destination $destinationCodexSessionIndexPath
Restore-SelectedFiles `
    -SourceRoot $mirroredCodexSessionsRoot `
    -DestinationRoot $destinationCodexSessionsRoot

$bootstrapResult = $null
if (-not $SkipBootstrap) {
    $bootstrapScriptCandidates = @(
        (Join-Path $PSScriptRoot "run-suite-runtime-startup.ps1"),
        (Join-Path $resolvedRepoRoot "scripts\run-suite-runtime-startup.ps1")
    ) | Select-Object -Unique
    $bootstrapScript = $bootstrapScriptCandidates | Where-Object {
        Test-Path -LiteralPath $_
    } | Select-Object -First 1

    if (-not $bootstrapScript) {
        Write-Warning "run-suite-runtime-startup.ps1 was not found. Runtime services were not auto-started."
    }
    else {
        try {
            $bootstrapRaw = & PowerShell.exe `
                -NoProfile `
                -ExecutionPolicy Bypass `
                -File $bootstrapScript `
                -RepoRoot $resolvedRepoRoot `
                -Json 2>&1
            $bootstrapExitCode = 0
            $bootstrapExitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
            if ($bootstrapExitCodeVariable) {
                $bootstrapExitCode = [int]$bootstrapExitCodeVariable.Value
            }
            $bootstrapText = [string]::Join(
                [Environment]::NewLine,
                @(
                    $bootstrapRaw | ForEach-Object {
                        if ($null -eq $_) { "" } else { $_.ToString() }
                    }
                )
            ).Trim()

            if ($bootstrapExitCode -ne 0) {
                throw "run-suite-runtime-startup.ps1 exited with code $bootstrapExitCode. $bootstrapText"
            }
            if ([string]::IsNullOrWhiteSpace($bootstrapText)) {
                throw "run-suite-runtime-startup.ps1 returned no output."
            }

            $bootstrapResult = $bootstrapText | ConvertFrom-Json
        }
        catch {
            Write-Warning "Runtime bootstrap after restore needs attention. $($_.Exception.Message)"
        }
    }
}

Write-Host "Restored Suite local state from $MirrorRoot"
Write-Host "Repo root: $resolvedRepoRoot"
Write-Host (
    "Workstation identity: " +
    "$($resolvedIdentity.WorkstationId) | $($resolvedIdentity.WorkstationLabel) | $($resolvedIdentity.WorkstationRole)"
)
if (Test-Path -LiteralPath $codexHandoffPath) {
    Write-Host "Codex handoff: $codexHandoffPath"
}
if ($bootstrapResult) {
    $bootstrapStatus = if ($bootstrapResult.ok) { "ok" } else { "needs_attention" }
    Write-Host "Runtime bootstrap: $bootstrapStatus"
    $bootstrapSteps = if ($bootstrapResult.steps) {
        @($bootstrapResult.steps)
    }
    elseif ($bootstrapResult.bootstrap -and $bootstrapResult.bootstrap.steps) {
        @($bootstrapResult.bootstrap.steps)
    }
    else {
        @()
    }
    foreach ($step in $bootstrapSteps) {
        Write-Host "- [$($step.state)] $($step.name): $($step.summary)"
    }
}
Write-Host "Restart Codex after restore so MCP/workstation settings reload."

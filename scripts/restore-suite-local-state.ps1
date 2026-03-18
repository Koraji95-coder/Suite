[CmdletBinding()]
param(
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror"),
    [string]$RepoRoot,
    [string]$WorkstationId,
    [string]$WorkstationLabel,
    [string]$WorkstationRole
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

. (Join-Path $PSScriptRoot "suite-workstation-config.ps1")

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

if (-not (Test-Path -LiteralPath $MirrorRoot)) {
    throw "Mirror root does not exist: $MirrorRoot"
}

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repo root does not exist: $RepoRoot"
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
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
        Name = "zeroclaw"
        Type = "directory"
        Source = (Join-Path $MirrorRoot "zeroclaw")
        Destination = (Join-Path $env:USERPROFILE ".zeroclaw")
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

Write-Host "Restored Suite local state from $MirrorRoot"
Write-Host "Repo root: $resolvedRepoRoot"
Write-Host (
    "Workstation identity: " +
    "$($resolvedIdentity.WorkstationId) | $($resolvedIdentity.WorkstationLabel) | $($resolvedIdentity.WorkstationRole)"
)
Write-Host "Restart Codex after restore so MCP/workstation settings reload."

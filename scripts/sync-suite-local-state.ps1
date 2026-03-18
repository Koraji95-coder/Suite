[CmdletBinding()]
param(
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Mirror-Directory {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        if (Test-Path -LiteralPath $Destination) {
            Remove-Item -LiteralPath $Destination -Recurse -Force
        }
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

function Mirror-File {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    Ensure-Directory -Path (Split-Path -Parent $Destination)

    if (-not (Test-Path -LiteralPath $Source)) {
        if (Test-Path -LiteralPath $Destination) {
            Remove-Item -LiteralPath $Destination -Force
        }
        return
    }

    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Write-MirrorReadme {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][System.Collections.IEnumerable]$Mappings
    )

    $lines = @(
        "Suite Local State Mirror",
        "",
        "This folder is maintained by scripts\sync-suite-local-state.ps1 on $env:COMPUTERNAME.",
        "It is intended for Dropbox/workstation transfer and mirrors selected local-only state.",
        "",
        "Mirror mappings:"
    )

    foreach ($mapping in $Mappings) {
    $lines += "- $($mapping.Name): $($mapping.Source) -> $($mapping.Destination)"
    }

    $lines += ""
    $lines += "Home-PC restore helper:"
    $lines += "- Run restore-suite-local-state.ps1 from this mirror on the destination machine after the repo is present locally."
    $lines += ""
    $lines += "For the freshest transfer snapshot, close Codex/ZeroClaw/Suite processes first and rerun the sync script once manually."
    $lines += "The scheduled sync keeps this folder close to 1:1, but live SQLite/WAL files can still reflect in-use state."
    $lines += ""
    $lines += "Generated: $(Get-Date -Format o)"

    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$mappings = @(
    [pscustomobject]@{
        Name = "codex-skills"
        Type = "directory"
        Source = (Join-Path $env:USERPROFILE ".codex\skills")
        Destination = (Join-Path $MirrorRoot "codex\skills")
    },
    [pscustomobject]@{
        Name = "codex-config"
        Type = "file"
        Source = (Join-Path $env:USERPROFILE ".codex\config.toml")
        Destination = (Join-Path $MirrorRoot "codex\config.toml")
    },
    [pscustomobject]@{
        Name = "zeroclaw"
        Type = "directory"
        Source = (Join-Path $env:USERPROFILE ".zeroclaw")
        Destination = (Join-Path $MirrorRoot "zeroclaw")
    },
    [pscustomobject]@{
        Name = "suite-learning"
        Type = "directory"
        Source = (Join-Path $repoRoot "backend\.learning")
        Destination = (Join-Path $MirrorRoot "suite\backend\.learning")
    },
    [pscustomobject]@{
        Name = "restore-helper"
        Type = "file"
        Source = (Join-Path $repoRoot "scripts\restore-suite-local-state.ps1")
        Destination = (Join-Path $MirrorRoot "restore-suite-local-state.ps1")
    }
)

Ensure-Directory -Path $MirrorRoot

foreach ($mapping in $mappings) {
    if ($mapping.Type -eq "directory") {
        Mirror-Directory -Source $mapping.Source -Destination $mapping.Destination
        continue
    }

    if ($mapping.Type -eq "file") {
        Mirror-File -Source $mapping.Source -Destination $mapping.Destination
        continue
    }

    throw "Unsupported mapping type '$($mapping.Type)' for '$($mapping.Name)'."
}

$manifest = [pscustomobject]@{
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    computer_name = [string]$env:COMPUTERNAME
    repo_root = $repoRoot
    mirror_root = $MirrorRoot
    mappings = @(
        foreach ($mapping in $mappings) {
            [pscustomobject]@{
                name = $mapping.Name
                type = $mapping.Type
                source = $mapping.Source
                destination = $mapping.Destination
            }
        }
    )
}

$manifestPath = Join-Path $MirrorRoot "mirror-manifest.json"
$readmePath = Join-Path $MirrorRoot "README.txt"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-MirrorReadme -Path $readmePath -Mappings $mappings

Write-Host "Mirrored Suite local state to $MirrorRoot"

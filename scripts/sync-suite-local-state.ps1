[CmdletBinding()]
param(
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror"),
    [int]$CodexRecentSessionCount = 8,
    [int]$CodexSessionMaxFileSizeMb = 50
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

function Mirror-SelectedFiles {
    param(
        [Parameter(Mandatory = $true)][string[]]$SourceFiles,
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot
    )

    if (Test-Path -LiteralPath $DestinationRoot) {
        Remove-Item -LiteralPath $DestinationRoot -Recurse -Force
    }

    if ($SourceFiles.Count -eq 0) {
        return
    }

    Ensure-Directory -Path $DestinationRoot
    foreach ($sourceFile in $SourceFiles) {
        if (-not (Test-Path -LiteralPath $sourceFile)) {
            continue
        }

        $resolvedSourceFile = [System.IO.Path]::GetFullPath($sourceFile)
        $relativePath = Get-RelativePathText -BasePath $SourceRoot -Path $resolvedSourceFile
        $destinationPath = Join-Path $DestinationRoot $relativePath
        Ensure-Directory -Path (Split-Path -Parent $destinationPath)
        Copy-Item -LiteralPath $resolvedSourceFile -Destination $destinationPath -Force
    }
}

function Invoke-GitText {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
        return $null
    }

    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($null -eq $gitCommand) {
        return $null
    }

    $result = & $gitCommand.Source -C $RepoRoot @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return [string]::Join(
        [Environment]::NewLine,
        @(
            $result | ForEach-Object {
                if ($null -eq $_) { "" } else { $_.ToString() }
            }
        )
    ).Trim()
}

function Get-RepoHandoffSummary {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
        return $null
    }

    $statusText = Invoke-GitText -RepoRoot $RepoRoot -Arguments @("status", "--short")
    $statusLines = @($statusText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    return [pscustomobject]@{
        root = $RepoRoot
        branch = Invoke-GitText -RepoRoot $RepoRoot -Arguments @("branch", "--show-current")
        head = Invoke-GitText -RepoRoot $RepoRoot -Arguments @("rev-parse", "--short", "HEAD")
        origin = Invoke-GitText -RepoRoot $RepoRoot -Arguments @("remote", "get-url", "origin")
        statusCount = $statusLines.Count
        statusLines = $statusLines
        recentCommits = @(
            (Invoke-GitText -RepoRoot $RepoRoot -Arguments @("log", "--oneline", "-5")) -split "`r?`n" |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        )
    }
}

function Get-CodexRecentSessionFiles {
    param(
        [Parameter(Mandatory = $true)][string]$CodexRoot,
        [Parameter(Mandatory = $true)][int]$MaxCount,
        [Parameter(Mandatory = $true)][int]$MaxFileSizeMb
    )

    $sessionsRoot = Join-Path $CodexRoot "sessions"
    if (-not (Test-Path -LiteralPath $sessionsRoot) -or $MaxCount -le 0) {
        return @()
    }

    $maxBytes = [int64]$MaxFileSizeMb * 1MB
    return @(
        Get-ChildItem -LiteralPath $sessionsRoot -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Length -le $maxBytes } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First $MaxCount
    )
}

function Get-CodexRecentSessionIndexEntries {
    param(
        [Parameter(Mandatory = $true)][string]$SessionIndexPath,
        [Parameter(Mandatory = $true)][int]$MaxCount
    )

    if (-not (Test-Path -LiteralPath $SessionIndexPath) -or $MaxCount -le 0) {
        return @()
    }

    $entries = New-Object System.Collections.Generic.List[object]
    foreach ($line in Get-Content -LiteralPath $SessionIndexPath -ErrorAction SilentlyContinue) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $entry = $line | ConvertFrom-Json
        }
        catch {
            continue
        }

        if ([string]::IsNullOrWhiteSpace([string]$entry.id)) {
            continue
        }

        $updatedAt = [datetimeoffset]::MinValue
        if (-not [datetimeoffset]::TryParse([string]$entry.updated_at, [ref]$updatedAt)) {
            $updatedAt = [datetimeoffset]::MinValue
        }

        $entries.Add([pscustomobject]@{
            id = [string]$entry.id
            thread_name = [string]$entry.thread_name
            updated_at = $updatedAt
        }) | Out-Null
    }

    return @(
        $entries |
            Sort-Object updated_at -Descending |
            Select-Object -First $MaxCount
    )
}

function Write-CodexHandoff {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$MirrorRoot,
        [Parameter(Mandatory = $true)][string]$CodexRoot,
        [Parameter(Mandatory = $true)][object]$SuiteRepoSummary,
        [object]$DailyRepoSummary,
        [Parameter(Mandatory = $true)][System.Collections.IEnumerable]$RecentSessionFiles,
        [Parameter(Mandatory = $true)][System.Collections.IEnumerable]$RecentSessionEntries
    )

    $lines = @(
        "# Codex Handoff",
        "",
        "- Generated: $(Get-Date -Format o)",
        "- Source machine: $env:COMPUTERNAME",
        "- Mirror root: $MirrorRoot",
        "- Codex root: $CodexRoot",
        "",
        "This handoff is meant to reduce machine-switch friction.",
        "It mirrors Codex config, skills, the session index, and a filtered set of recent small session JSONL files.",
        "It does not mirror Codex auth or the full local SQLite state, so exact live terminal attachment is not guaranteed.",
        ""
    )

    if ($SuiteRepoSummary) {
        $lines += "## Suite Repo"
        $lines += ""
        $lines += "- Root: $($SuiteRepoSummary.root)"
        $lines += "- Branch: $($SuiteRepoSummary.branch)"
        $lines += "- HEAD: $($SuiteRepoSummary.head)"
        if (-not [string]::IsNullOrWhiteSpace([string]$SuiteRepoSummary.origin)) {
            $lines += "- Origin: $($SuiteRepoSummary.origin)"
        }
        $lines += "- Pending local changes at mirror time: $($SuiteRepoSummary.statusCount)"
        $lines += ""
        $lines += "Recent commits:"
        foreach ($commit in @($SuiteRepoSummary.recentCommits)) {
            $lines += "- $commit"
        }
        if (@($SuiteRepoSummary.statusLines).Count -gt 0) {
            $lines += ""
            $lines += "Pending local changes at mirror time:"
            foreach ($statusLine in @($SuiteRepoSummary.statusLines | Select-Object -First 20)) {
                $lines += "- $statusLine"
            }
        }
        $lines += ""
    }

    if ($DailyRepoSummary) {
        $lines += "## Daily Repo"
        $lines += ""
        $lines += "- Root: $($DailyRepoSummary.root)"
        $lines += "- Branch: $($DailyRepoSummary.branch)"
        $lines += "- HEAD: $($DailyRepoSummary.head)"
        if (-not [string]::IsNullOrWhiteSpace([string]$DailyRepoSummary.origin)) {
            $lines += "- Origin: $($DailyRepoSummary.origin)"
        }
        $lines += "- Pending local changes at mirror time: $($DailyRepoSummary.statusCount)"
        $lines += ""
    }

    $lines += "## Mirrored Codex Sessions"
    $lines += ""
    $lines += "- Mirrored recent session files: $(@($RecentSessionFiles).Count)"
    $lines += "- Mirrored session index: $(Join-Path $MirrorRoot 'codex\session_index.jsonl')"
    $lines += ""
    if (@($RecentSessionFiles).Count -gt 0) {
        $lines += "Recent mirrored session files:"
        foreach ($sessionFile in @($RecentSessionFiles)) {
            $lines += "- $([System.IO.Path]::GetFileName($sessionFile.FullName)) ($([math]::Round($sessionFile.Length / 1MB, 2)) MB)"
        }
        $lines += ""
    }

    if (@($RecentSessionEntries).Count -gt 0) {
        $lines += "Recent Codex threads from the session index:"
        foreach ($entry in @($RecentSessionEntries)) {
            $threadName = if ([string]::IsNullOrWhiteSpace([string]$entry.thread_name)) { "(untitled thread)" } else { [string]$entry.thread_name }
            $lines += "- $threadName ($($entry.id), updated $($entry.updated_at.ToString('u')))"
        }
        $lines += ""
    }

    $lines += "## Destination Machine"
    $lines += ""
    $lines += '1. Clone Suite and Office into `C:\Users\DustinWard\Documents\GitHub\Suite` and `C:\Users\DustinWard\Documents\GitHub\Office`.'
    $lines += '2. Run `npm run workstation:bringup:validate` then `npm run workstation:bringup -- -WorkstationId <TARGET_ID>` from the Suite repo.'
    $lines += '3. Run `npm run workstation:restore -- -WorkstationId <TARGET_ID>`.'
    $lines += '4. Review this handoff file and the mirrored `codex\session_index.jsonl` if you need to locate the last thread quickly.'

    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
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
    $lines += "- From the repo checkout on the destination machine, run: npm run workstation:restore -- -WorkstationId <TARGET_ID>"
    $lines += "- The restore flow now re-stamps the workstation profile and bootstraps local runtime services automatically."
    $lines += "- Review codex-handoff.md in the mirror root for the latest repo/session handoff summary."
    $lines += ""
    $lines += "For the freshest transfer snapshot, close Codex/ZeroClaw/Suite processes first and rerun the sync script once manually."
    $lines += "The scheduled sync keeps this folder close to 1:1, but live SQLite/WAL files can still reflect in-use state."
    $lines += ""
    $lines += "Generated: $(Get-Date -Format o)"

    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $repoRoot "scripts\suite-workstation-config.ps1")
. (Join-Path $repoRoot "scripts\lib\suite-workstation-diagnostics.ps1")
$codexRoot = Join-Path $env:USERPROFILE ".codex"
$sessionIndexPath = Join-Path $codexRoot "session_index.jsonl"
$stableDailyRoot = Get-SuiteStableDailyRoot
$legacyDailyRoot = Join-Path $env:USERPROFILE "OneDrive\Desktop\Daily"
$dailyRepoRoot = if (Test-Path -LiteralPath (Join-Path $stableDailyRoot ".git")) {
    $stableDailyRoot
}
elseif (Test-Path -LiteralPath (Join-Path $legacyDailyRoot ".git")) {
    $legacyDailyRoot
}
else {
    $null
}

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
        Name = "codex-session-index"
        Type = "file"
        Source = $sessionIndexPath
        Destination = (Join-Path $MirrorRoot "codex\session_index.jsonl")
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

$recentCodexSessionFiles = Get-CodexRecentSessionFiles `
    -CodexRoot $codexRoot `
    -MaxCount $CodexRecentSessionCount `
    -MaxFileSizeMb $CodexSessionMaxFileSizeMb
$recentSessionSourceFiles = @($recentCodexSessionFiles | ForEach-Object { $_.FullName })
Mirror-SelectedFiles `
    -SourceFiles $recentSessionSourceFiles `
    -SourceRoot (Join-Path $codexRoot "sessions") `
    -DestinationRoot (Join-Path $MirrorRoot "codex\sessions")

$suiteRepoSummary = Get-RepoHandoffSummary -RepoRoot $repoRoot
$dailyRepoSummary = if ($dailyRepoRoot) { Get-RepoHandoffSummary -RepoRoot $dailyRepoRoot } else { $null }
$recentSessionEntries = Get-CodexRecentSessionIndexEntries -SessionIndexPath $sessionIndexPath -MaxCount 12
$codexHandoffPath = Join-Path $MirrorRoot "codex-handoff.md"
Write-CodexHandoff `
    -Path $codexHandoffPath `
    -MirrorRoot $MirrorRoot `
    -CodexRoot $codexRoot `
    -SuiteRepoSummary $suiteRepoSummary `
    -DailyRepoSummary $dailyRepoSummary `
    -RecentSessionFiles $recentCodexSessionFiles `
    -RecentSessionEntries $recentSessionEntries

$manifest = [pscustomobject]@{
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    computer_name = [string]$env:COMPUTERNAME
    repo_root = $repoRoot
    mirror_root = $MirrorRoot
    codex_handoff_path = $codexHandoffPath
    recent_codex_sessions = @(
        foreach ($sessionFile in $recentCodexSessionFiles) {
            [pscustomobject]@{
                source = $sessionFile.FullName
                destination = (Join-Path $MirrorRoot ("codex\sessions\" + (Get-RelativePathText -BasePath (Join-Path $codexRoot "sessions") -Path $sessionFile.FullName)))
                size_bytes = [int64]$sessionFile.Length
                last_write_utc = $sessionFile.LastWriteTimeUtc.ToString("o")
            }
        }
    )
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
$envFingerprintManifestPath = Join-Path $MirrorRoot "env-fingerprint-manifest.json"
$mcpSkillsManifestPath = Join-Path $MirrorRoot "mcp-skills-manifest.json"
$runtimeBootstrapManifestPath = Join-Path $MirrorRoot "runtime-bootstrap-manifest.json"
$workstationDoctorManifestPath = Join-Path $MirrorRoot "workstation-doctor-manifest.json"
$readmePath = Join-Path $MirrorRoot "README.txt"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$envFingerprintManifest = Get-SuiteEnvFingerprintSummary -RepoRoot $repoRoot
$envFingerprintManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $envFingerprintManifestPath -Encoding UTF8

$mcpSkillsManifest = [pscustomobject]@{
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    codex_config_path = (Join-Path $env:USERPROFILE ".codex\config.toml")
    mcp_servers = @(Get-SuiteCodexMcpInventory -CodexConfigPath (Join-Path $env:USERPROFILE ".codex\config.toml"))
    skills = @(Get-SuiteSkillInventory)
}
$mcpSkillsManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $mcpSkillsManifestPath -Encoding UTF8

$runtimeStatusScript = Join-Path $repoRoot "scripts\get-suite-runtime-status.ps1"
if (Test-Path -LiteralPath $runtimeStatusScript) {
    try {
        $runtimeStatusRaw = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $runtimeStatusScript -RepoRoot $repoRoot -Json 2>$null
        $runtimeStatusText = [string]::Join([Environment]::NewLine, @($runtimeStatusRaw | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } })).Trim()
        if (-not [string]::IsNullOrWhiteSpace($runtimeStatusText)) {
            $runtimeStatusPayload = $runtimeStatusText | ConvertFrom-Json
            ([pscustomobject]@{
                generated_utc = (Get-Date).ToUniversalTime().ToString("o")
                overall = $runtimeStatusPayload.overall
                workstation = if ($runtimeStatusPayload.support) { $runtimeStatusPayload.support.workstation } else { $null }
                runtime = $runtimeStatusPayload.runtime
                services = $runtimeStatusPayload.services
            } | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $runtimeBootstrapManifestPath -Encoding UTF8
        }
    }
    catch {
    }
}

$workstationDoctorScript = Join-Path $repoRoot "scripts\workstation-doctor.ps1"
if (Test-Path -LiteralPath $workstationDoctorScript) {
    try {
        $doctorRaw = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $workstationDoctorScript -RepoRoot $repoRoot -Json 2>$null
        $doctorText = [string]::Join([Environment]::NewLine, @($doctorRaw | ForEach-Object { if ($null -eq $_) { "" } else { $_.ToString() } })).Trim()
        if (-not [string]::IsNullOrWhiteSpace($doctorText)) {
            $doctorText | Set-Content -LiteralPath $workstationDoctorManifestPath -Encoding UTF8
        }
    }
    catch {
    }
}

Write-MirrorReadme -Path $readmePath -Mappings $mappings

Write-Host "Mirrored Suite local state to $MirrorRoot"

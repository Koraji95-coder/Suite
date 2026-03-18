[CmdletBinding()]
param(
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror"),
    [string]$RepoRoot = (Join-Path $env:USERPROFILE "Documents\GitHub\Suite"),
    [string]$WorkstationId = $(if ($env:COMPUTERNAME -eq "DUSTINWARD") { "DUSTINWARD" } else { "DUSTIN-HOME" }),
    [string]$WorkstationLabel = $(if ($env:COMPUTERNAME -eq "DUSTINWARD") { "Dustin workstation" } else { "Dustin Home station" }),
    [string]$WorkstationRole = $(if ($env:COMPUTERNAME -eq "DUSTINWARD") { "active" } else { "home" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

function Convert-ToTomlString {
    param([Parameter(Mandatory = $true)][string]$Value)

    $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    return '"' + $escaped + '"'
}

function Set-TomlKeyInSection {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$SectionName,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$ValueLiteral
    )

    $sectionPattern = "(?ms)(^\[" + [regex]::Escape($SectionName) + "\]\s*)(.*?)(?=^\[|\z)"

    if ($Content -notmatch $sectionPattern) {
        $separator = if ([string]::IsNullOrWhiteSpace($Content)) { "" } else { "`r`n`r`n" }
        return $Content + $separator + "[$SectionName]`r`n$Key = $ValueLiteral`r`n"
    }

    return [regex]::Replace(
        $Content,
        $sectionPattern,
        {
            param($match)

            $header = $match.Groups[1].Value
            $body = $match.Groups[2].Value
            $keyPattern = "(?m)^" + [regex]::Escape($Key) + "\s*=.*$"

            if ($body -match $keyPattern) {
                $body = [regex]::Replace($body, $keyPattern, "$Key = $ValueLiteral", 1)
            }
            else {
                if ($body.Length -gt 0 -and -not ($body.EndsWith("`r`n") -or $body.EndsWith("`n"))) {
                    $body += "`r`n"
                }

                $body += "$Key = $ValueLiteral`r`n"
            }

            return $header + $body
        },
        1
    )
}

function Update-CodexConfig {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ResolvedRepoRoot,
        [Parameter(Mandatory = $true)][string]$ResolvedWorkstationId,
        [Parameter(Mandatory = $true)][string]$ResolvedWorkstationLabel,
        [Parameter(Mandatory = $true)][string]$ResolvedWorkstationRole
    )

    if (Test-Path -LiteralPath $Path) {
        $content = Get-Content -LiteralPath $Path -Raw
    }
    else {
        $content = ""
    }

    $serverPath = Join-Path $ResolvedRepoRoot "tools\suite-repo-mcp\server.mjs"
    $content = Set-TomlKeyInSection -Content $content -SectionName "mcp_servers.suite_repo_mcp" -Key "args" -ValueLiteral ("[" + (Convert-ToTomlString -Value $serverPath) + "]")
    $content = Set-TomlKeyInSection -Content $content -SectionName "mcp_servers.suite_repo_mcp.env" -Key "SUITE_WORKSTATION_ID" -ValueLiteral (Convert-ToTomlString -Value $ResolvedWorkstationId)
    $content = Set-TomlKeyInSection -Content $content -SectionName "mcp_servers.suite_repo_mcp.env" -Key "SUITE_WORKSTATION_LABEL" -ValueLiteral (Convert-ToTomlString -Value $ResolvedWorkstationLabel)
    $content = Set-TomlKeyInSection -Content $content -SectionName "mcp_servers.suite_repo_mcp.env" -Key "SUITE_WORKSTATION_ROLE" -ValueLiteral (Convert-ToTomlString -Value $ResolvedWorkstationRole)
    $content = Set-TomlKeyInSection -Content $content -SectionName "features" -Key "rmcp_client" -ValueLiteral "true"

    Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $MirrorRoot)) {
    throw "Mirror root does not exist: $MirrorRoot"
}

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repo root does not exist: $RepoRoot"
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path

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
Update-CodexConfig `
    -Path $codexConfigPath `
    -ResolvedRepoRoot $resolvedRepoRoot `
    -ResolvedWorkstationId $WorkstationId `
    -ResolvedWorkstationLabel $WorkstationLabel `
    -ResolvedWorkstationRole $WorkstationRole

Write-Host "Restored Suite local state from $MirrorRoot"
Write-Host "Repo root: $resolvedRepoRoot"
Write-Host "Workstation identity: $WorkstationId | $WorkstationLabel | $WorkstationRole"
Write-Host "Restart Codex after restore so MCP/workstation settings reload."

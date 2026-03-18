[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [string]$WorkstationLabel,
    [string]$WorkstationRole,
    [string]$GitUserName,
    [string]$GitUserEmail,
    [switch]$PrintToml,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}

. (Join-Path $PSScriptRoot "suite-workstation-config.ps1")

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repo root does not exist: $RepoRoot"
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$resolvedProfile = Resolve-SuiteWorkstationProfile `
    -ResolvedRepoRoot $resolvedRepoRoot `
    -ExplicitWorkstationId $WorkstationId `
    -ExplicitWorkstationLabel $WorkstationLabel `
    -ExplicitWorkstationRole $WorkstationRole `
    -ExplicitGitUserName $GitUserName `
    -ExplicitGitUserEmail $GitUserEmail
$envValues = Get-SuiteWorkstationMcpEnv `
    -ResolvedRepoRoot $resolvedRepoRoot `
    -WorkstationProfile $resolvedProfile

if ($PrintToml) {
    Format-SuiteRepoMcpToml `
        -ResolvedRepoRoot $resolvedRepoRoot `
        -WorkstationProfile $resolvedProfile
    exit 0
}

Update-SuiteCodexConfig `
    -Path $CodexConfigPath `
    -ResolvedRepoRoot $resolvedRepoRoot `
    -WorkstationProfile $resolvedProfile

if (Get-Command git -ErrorAction SilentlyContinue) {
    if (-not [string]::IsNullOrWhiteSpace($resolvedProfile.GitUserName)) {
        & git -C $resolvedRepoRoot config user.name $resolvedProfile.GitUserName | Out-Null
    }
    if (-not [string]::IsNullOrWhiteSpace($resolvedProfile.GitUserEmail)) {
        & git -C $resolvedRepoRoot config user.email $resolvedProfile.GitUserEmail | Out-Null
    }
}

$result = [ordered]@{
    ok = $true
    repoRoot = $resolvedRepoRoot
    codexConfigPath = $CodexConfigPath
    profilePath = $resolvedProfile.ProfilePath
    profileSource = $resolvedProfile.ProfileSource
    matchSource = $resolvedProfile.MatchSource
    computerName = $resolvedProfile.ComputerName
    workstationId = $resolvedProfile.WorkstationId
    workstationLabel = $resolvedProfile.WorkstationLabel
    workstationRole = $resolvedProfile.WorkstationRole
    gitUserName = $resolvedProfile.GitUserName
    gitUserEmail = $resolvedProfile.GitUserEmail
    env = $envValues
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Synced Suite workstation profile into $CodexConfigPath"
    Write-Host "Supported MCP env stamping path: scripts/sync-suite-workstation-profile.ps1"
    Write-Host "Profile source: $($resolvedProfile.ProfileSource)"
    Write-Host "Profile path: $($resolvedProfile.ProfilePath)"
    Write-Host (
        "Workstation identity: " +
        "$($resolvedProfile.WorkstationId) | $($resolvedProfile.WorkstationLabel) | $($resolvedProfile.WorkstationRole)"
    )
    if (-not [string]::IsNullOrWhiteSpace($resolvedProfile.GitUserEmail)) {
        Write-Host "Git identity synced for this repo: $($resolvedProfile.GitUserName) <$($resolvedProfile.GitUserEmail)>"
    }
    Write-Host "Restart Codex after sync so MCP/workstation settings reload."
}

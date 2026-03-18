[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [string]$WorkstationLabel,
    [string]$WorkstationRole,
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
    -ExplicitWorkstationRole $WorkstationRole
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
    env = $envValues
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Synced Suite workstation profile into $CodexConfigPath"
    Write-Host "Profile source: $($resolvedProfile.ProfileSource)"
    Write-Host "Profile path: $($resolvedProfile.ProfilePath)"
    Write-Host (
        "Workstation identity: " +
        "$($resolvedProfile.WorkstationId) | $($resolvedProfile.WorkstationLabel) | $($resolvedProfile.WorkstationRole)"
    )
    Write-Host "Restart Codex after sync so MCP/workstation settings reload."
}

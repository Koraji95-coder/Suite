[CmdletBinding()]
param(
	[string]$RepoRoot,
	[switch]$SkipRuntimeStatus,
	[switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
	$RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
. (Join-Path $PSScriptRoot "suite-workstation-config.ps1")
. (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")
. (Join-Path $PSScriptRoot "lib\suite-workstation-diagnostics.ps1")

$workstationProfile = Resolve-SuiteWorkstationProfile -ResolvedRepoRoot $resolvedRepoRoot
$normalizedWorkstationProfile = [pscustomobject]@{
	workstationId = [string]$workstationProfile.WorkstationId
	workstationLabel = [string]$workstationProfile.WorkstationLabel
	workstationRole = [string]$workstationProfile.WorkstationRole
	gitUserName = [string]$workstationProfile.GitUserName
	gitUserEmail = [string]$workstationProfile.GitUserEmail
	computerName = [string]$workstationProfile.ComputerName
	profileSource = [string]$workstationProfile.ProfileSource
	profilePath = [string]$workstationProfile.ProfilePath
	matchSource = [string]$workstationProfile.MatchSource
}
$runtimeStatusScript = Join-Path $PSScriptRoot "get-suite-runtime-status.ps1"
$worktaleDoctorScript = Join-Path $PSScriptRoot "check-worktale-readiness.mjs"
$codexConfigPath = Join-Path $env:USERPROFILE ".codex\config.toml"
$skillsRoot = Join-Path $env:USERPROFILE ".codex\skills"
$mirrorRoot = Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror"
$mirrorManifestPath = Join-Path $mirrorRoot "mirror-manifest.json"
$envFingerprintManifestPath = Join-Path $mirrorRoot "env-fingerprint-manifest.json"
$mcpSkillsManifestPath = Join-Path $mirrorRoot "mcp-skills-manifest.json"
$runtimeBootstrapManifestPath = Join-Path $mirrorRoot "runtime-bootstrap-manifest.json"
$workstationDoctorManifestPath = Join-Path $mirrorRoot "workstation-doctor-manifest.json"
$officeKnowledgeRoot = Get-SuiteOfficeKnowledgeRoot
$officeStateRoot = Get-SuiteOfficeStateRoot
$runtimeCoreComposePath = Join-Path $resolvedRepoRoot "docker\runtime-core\runtime-core.compose.yml"

function Invoke-JsonPowerShellScript {
	param(
		[Parameter(Mandatory = $true)][string]$ScriptPath,
		[string[]]$Arguments = @()
	)

	$rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
	$exitCode = if (Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue) { [int]$LASTEXITCODE } else { 0 }
	$outputText = [string]::Join(
		[Environment]::NewLine,
		@(
			$rawOutput | ForEach-Object {
				if ($null -eq $_) { "" } else { $_.ToString() }
			}
		)
	).Trim()

	try {
		$payload = if ([string]::IsNullOrWhiteSpace($outputText)) { $null } else { $outputText | ConvertFrom-Json }
	}
	catch {
		$payload = $null
	}

	[pscustomobject]@{
		Ok = ($exitCode -eq 0)
		OutputText = $outputText
		Payload = $payload
	}
}

function Invoke-JsonNodeScript {
	param(
		[Parameter(Mandatory = $true)][string]$ScriptPath,
		[string[]]$Arguments = @()
	)

	$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
	if ($null -eq $nodeCommand) {
		return [pscustomobject]@{
			Ok = $false
			OutputText = "node is not available on PATH."
			Payload = $null
		}
	}

	$rawOutput = & $nodeCommand.Source $ScriptPath @Arguments 2>&1
	$exitCode = if (Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue) { [int]$LASTEXITCODE } else { 0 }
	$outputText = [string]::Join(
		[Environment]::NewLine,
		@(
			$rawOutput | ForEach-Object {
				if ($null -eq $_) { "" } else { $_.ToString() }
			}
		)
	).Trim()

	try {
		$payload = if ([string]::IsNullOrWhiteSpace($outputText)) { $null } else { $outputText | ConvertFrom-Json }
	}
	catch {
		$payload = $null
	}

	[pscustomobject]@{
		Ok = ($exitCode -eq 0)
		OutputText = $outputText
		Payload = $payload
	}
}

$runtimeStatus = if ($SkipRuntimeStatus) {
	$null
}
else {
	Invoke-JsonPowerShellScript -ScriptPath $runtimeStatusScript -Arguments @("-RepoRoot", $resolvedRepoRoot, "-Json")
}
$shell = Get-SuiteRuntimeShellSummary -RepoRoot $resolvedRepoRoot
$startupOwner = Get-SuiteStartupOwnerSummary -RepoRoot $resolvedRepoRoot
$envDrift = Get-SuiteEnvDriftSummary -RepoRoot $resolvedRepoRoot -MirroredManifestPath $envFingerprintManifestPath
$mcpInventory = @(Get-SuiteCodexMcpInventory -CodexConfigPath $codexConfigPath)
$skillInventory = @(Get-SuiteSkillInventory -SkillsRoot $skillsRoot)
$adminContinuity = Get-SuiteAdminContinuitySummary -RepoRoot $resolvedRepoRoot
$worktaleStatus = if (Test-Path -LiteralPath $worktaleDoctorScript -PathType Leaf) {
	Invoke-JsonNodeScript -ScriptPath $worktaleDoctorScript -Arguments @("--json")
}
else {
	[pscustomobject]@{
		Ok = $false
		OutputText = "Worktale doctor script missing."
		Payload = $null
	}
}
$worktale = if ($worktaleStatus.Payload) {
	$worktaleStatus.Payload
}
else {
	[pscustomobject]@{
		ready = $false
		issues = @(
			if ([string]::IsNullOrWhiteSpace($worktaleStatus.OutputText)) {
				"Worktale readiness could not be evaluated."
			}
			else {
				$worktaleStatus.OutputText
			}
		)
		nextStep = "npm run worktale:bootstrap"
	}
}

$doctor = [pscustomobject]@{
	generatedAt = (Get-Date).ToUniversalTime().ToString("o")
	workstation = $normalizedWorkstationProfile
	repoRoots = [pscustomobject]@{
		suite = $resolvedRepoRoot
		office = Get-SuiteStableDailyRoot
	}
	shell = $shell
	startupOwner = $startupOwner
	dropbox = [pscustomobject]@{
		officeWorkspaceRoot = Get-SuiteOfficeWorkspaceRoot
		knowledgeRoot = $officeKnowledgeRoot
		knowledgeRootExists = (Test-Path -LiteralPath $officeKnowledgeRoot -PathType Container)
		stateRoot = $officeStateRoot
		stateRootExists = (Test-Path -LiteralPath $officeStateRoot -PathType Container)
		mirrorRoot = $mirrorRoot
		mirrorRootExists = (Test-Path -LiteralPath $mirrorRoot -PathType Container)
	}
	codex = [pscustomobject]@{
		configPath = $codexConfigPath
		configPresent = (Test-Path -LiteralPath $codexConfigPath -PathType Leaf)
		skillsRoot = $skillsRoot
		mcpInventory = @($mcpInventory)
		skillInventory = @($skillInventory)
	}
	envDrift = $envDrift
	adminContinuity = $adminContinuity
	worktale = $worktale
	runtime = if ($runtimeStatus -and $runtimeStatus.Payload) { $runtimeStatus.Payload } else { $null }
	runtimeCore = [pscustomobject]@{
		composePath = $runtimeCoreComposePath
		composePresent = (Test-Path -LiteralPath $runtimeCoreComposePath -PathType Leaf)
	}
	manifests = [pscustomobject]@{
		mirror = if (Test-Path -LiteralPath $mirrorManifestPath -PathType Leaf) { $mirrorManifestPath } else { $null }
		envFingerprint = if (Test-Path -LiteralPath $envFingerprintManifestPath -PathType Leaf) { $envFingerprintManifestPath } else { $null }
		mcpSkills = if (Test-Path -LiteralPath $mcpSkillsManifestPath -PathType Leaf) { $mcpSkillsManifestPath } else { $null }
		runtimeBootstrap = if (Test-Path -LiteralPath $runtimeBootstrapManifestPath -PathType Leaf) { $runtimeBootstrapManifestPath } else { $null }
		doctor = if (Test-Path -LiteralPath $workstationDoctorManifestPath -PathType Leaf) { $workstationDoctorManifestPath } else { $null }
	}
}

if ($Json) {
	$doctor | ConvertTo-Json -Depth 10
	return
}

Write-Host "Suite Workstation Doctor"
Write-Host "Generated: $($doctor.generatedAt)"
Write-Host "Workstation: $($normalizedWorkstationProfile.workstationId) | $($normalizedWorkstationProfile.workstationLabel) | $($normalizedWorkstationProfile.workstationRole)"
Write-Host "Computer name: $($normalizedWorkstationProfile.computerName)"
Write-Host "Suite root: $($doctor.repoRoots.suite)"
Write-Host "Office root: $($doctor.repoRoots.office)"
Write-Host "Shared shell: $($shell.status)"
Write-Host "Startup owner: $($startupOwner.owner)"
Write-Host "Office knowledge root: $($doctor.dropbox.knowledgeRoot)"
Write-Host "Office state root: $($doctor.dropbox.stateRoot)"
Write-Host "Mirror root: $($doctor.dropbox.mirrorRoot)"
Write-Host "MCP servers: $((@($mcpInventory | ForEach-Object { $_.name }) -join ', '))"
Write-Host "Skills: $($skillInventory.Count)"
Write-Host "Admin continuity: $($adminContinuity.overall)"
Write-Host "Worktale: $(if ($worktale.ready) { 'ready' } else { 'needs bootstrap' })"
if (-not $worktale.ready -and $worktale.nextStep) {
	Write-Host "Worktale next step: $($worktale.nextStep)"
}
if ($runtimeStatus -and $runtimeStatus.Payload -and $runtimeStatus.Payload.overall) {
	Write-Host "Runtime: $([string]$runtimeStatus.Payload.overall.text) ($([string]$runtimeStatus.Payload.overall.state))"
}

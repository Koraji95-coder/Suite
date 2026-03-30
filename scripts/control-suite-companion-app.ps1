[CmdletBinding()]
param(
	[ValidateSet("office")]
	[string]$CompanionAppId = "office",
	[Parameter(Mandatory = $true)]
	[ValidateSet("launch", "relaunch", "open-folder", "status", "cleanup-startup")]
	[string]$Action,
	[string]$RepoRoot,
	[string]$LaunchSource = "runtime-control",
	[switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
	$RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$runtimeSharedScript = (Resolve-Path (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")).Path
. $runtimeSharedScript

$codexConfigPath = Get-SuiteCodexConfigPath
$config = Get-SuiteCompanionAppConfig -CompanionAppId $CompanionAppId -RepoRoot $resolvedRepoRoot -TomlPath $codexConfigPath

if ($null -eq $config) {
	throw "Companion app '$CompanionAppId' is not supported."
}

function New-CompanionResult {
	param(
		[Parameter(Mandatory = $true)][bool]$Ok,
		[Parameter(Mandatory = $true)][string]$Summary,
		[string]$Details,
		[object]$Snapshot
	)

	[pscustomobject]@{
		ok = $Ok
		companionAppId = [string]$config.id
		action = $Action
		summary = $Summary
		details = if ([string]::IsNullOrWhiteSpace($Details)) { $null } else { $Details }
		snapshot = $Snapshot
	}
}

function Get-CurrentSnapshot {
	return Get-SuiteCompanionAppSnapshot -CompanionAppId $CompanionAppId -RepoRoot $resolvedRepoRoot -TomlPath $codexConfigPath
}

function Save-LaunchState {
	param(
		[Parameter(Mandatory = $true)][string]$Status,
		[Parameter(Mandatory = $true)][string]$Message,
		[Nullable[int]]$ProcessId,
		[string]$Source = $LaunchSource
	)

	Write-SuiteCompanionAppState -CompanionAppId $CompanionAppId -State ([ordered]@{
		id = [string]$config.id
		lastLaunchAt = (Get-Date).ToString("o")
		lastLaunchSource = $Source
		lastLaunchStatus = $Status
		lastLaunchMessage = $Message
		lastKnownPid = $ProcessId
	}) | Out-Null
}

function Remove-IndependentStartup {
	$removed = Remove-SuiteCompanionAppRunKeyEntry -CompanionAppId $CompanionAppId
	$snapshot = Get-CurrentSnapshot
	return New-CompanionResult -Ok $true -Summary $(if ($removed) { "Removed independent Office startup entry." } else { "Independent Office startup entry is already clear." }) -Snapshot $snapshot
}

function Open-CompanionFolder {
	$targetPath = if (-not [string]::IsNullOrWhiteSpace([string]$config.rootDirectory)) {
		[string]$config.rootDirectory
	}
	elseif (-not [string]::IsNullOrWhiteSpace([string]$config.workingDirectory)) {
		[string]$config.workingDirectory
	}
	else {
		Split-Path -Parent ([string]$config.executablePath)
	}

	if ([string]::IsNullOrWhiteSpace($targetPath) -or -not (Test-Path -LiteralPath $targetPath)) {
		$snapshot = Get-CurrentSnapshot
		return New-CompanionResult -Ok $false -Summary "Office folder is not available." -Details $targetPath -Snapshot $snapshot
	}

	Start-Process -FilePath "explorer.exe" -ArgumentList "`"$targetPath`"" | Out-Null

	$snapshot = Get-CurrentSnapshot
	return New-CompanionResult -Ok $true -Summary "Opened Daily folder." -Snapshot $snapshot
}

function Launch-Companion {
	param([switch]$Relaunch)

	$currentSnapshot = Get-CurrentSnapshot
	if (-not [bool]$config.enabled) {
		Save-LaunchState -Status "disabled" -Message "Office companion is disabled." -ProcessId $null
		return New-CompanionResult -Ok $false -Summary "Office companion is disabled." -Snapshot (Get-CurrentSnapshot)
	}

	if (-not [bool]$currentSnapshot.executableFound) {
		Save-LaunchState -Status "missing_executable" -Message "Office executable was not found." -ProcessId $null
		return New-CompanionResult -Ok $false -Summary "Office executable was not found." -Details ([string]$currentSnapshot.executablePath) -Snapshot (Get-CurrentSnapshot)
	}

	if ($Relaunch -and [bool]$currentSnapshot.running -and $currentSnapshot.pid) {
		try {
			Stop-Process -Id ([int]$currentSnapshot.pid) -Force -ErrorAction Stop
			Start-Sleep -Milliseconds 400
		}
		catch {
			Save-LaunchState -Status "relaunch_failed" -Message "Office was running but could not be stopped for relaunch." -ProcessId ([int]$currentSnapshot.pid)
			return New-CompanionResult -Ok $false -Summary "Office could not be relaunched." -Details $_.Exception.Message -Snapshot (Get-CurrentSnapshot)
		}
	}
	elseif (-not $Relaunch -and [bool]$currentSnapshot.running) {
		return New-CompanionResult -Ok $true -Summary $(if ([bool]$currentSnapshot.startedOutsideRuntimeControl) { "Office is already running outside Runtime Control." } else { "Office is already running." }) -Snapshot $currentSnapshot
	}

	try {
		$startedProcess = Start-Process -FilePath ([string]$currentSnapshot.executablePath) -WorkingDirectory ([string]$config.workingDirectory) -PassThru
		Start-Sleep -Milliseconds 750
		$launchMessage = if ($Relaunch) { "Office relaunch requested." } else { "Office launch requested." }
		Save-LaunchState -Status $(if ($Relaunch) { "relaunch_requested" } else { "launch_requested" }) -Message $launchMessage -ProcessId ([int]$startedProcess.Id)
		$refreshedSnapshot = Get-CurrentSnapshot
		return New-CompanionResult -Ok $true -Summary $(if ($Relaunch) { "Office relaunched." } else { "Office started." }) -Snapshot $refreshedSnapshot
	}
	catch {
		$failureMessage = if ($Relaunch) { "Office relaunch failed." } else { "Office launch failed." }
		Save-LaunchState -Status $(if ($Relaunch) { "relaunch_failed" } else { "launch_failed" }) -Message $failureMessage -ProcessId $null
		return New-CompanionResult -Ok $false -Summary $failureMessage -Details $_.Exception.Message -Snapshot (Get-CurrentSnapshot)
	}
}

$result = switch ($Action) {
	"status" { New-CompanionResult -Ok $true -Summary "Office companion status loaded." -Snapshot (Get-CurrentSnapshot) }
	"cleanup-startup" { Remove-IndependentStartup }
	"open-folder" { Open-CompanionFolder }
	"launch" { Launch-Companion }
	"relaunch" { Launch-Companion -Relaunch }
	default { throw "Unsupported action '$Action'." }
}

if ($Json) {
	$result | ConvertTo-Json -Depth 8
}
else {
	Write-Host $result.summary
	if ($result.details) {
		Write-Host $result.details
	}
}

if ($result.ok) {
	exit 0
}

exit 1

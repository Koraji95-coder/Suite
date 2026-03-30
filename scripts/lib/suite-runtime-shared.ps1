Set-StrictMode -Version Latest

function Get-SuiteStatusBasePath {
	if ($env:LOCALAPPDATA) {
		return $env:LOCALAPPDATA
	}
	if ($env:TEMP) {
		return $env:TEMP
	}

	return $env:USERPROFILE
}

function Get-SuiteRoamingBasePath {
	if ($env:APPDATA) {
		return $env:APPDATA
	}
	if ($env:USERPROFILE) {
		return Join-Path $env:USERPROFILE "AppData\Roaming"
	}

	return Get-SuiteStatusBasePath
}

function Get-SuiteRuntimePaths {
	param([string]$StatusBase = (Get-SuiteStatusBasePath))

	$runtimeStatusDir = Join-Path $StatusBase "Suite\runtime-bootstrap"
	[pscustomobject]@{
		StatusBase = $StatusBase
		RuntimeStatusDir = $runtimeStatusDir
		RuntimeStatusPath = Join-Path $runtimeStatusDir "last-bootstrap.json"
		CurrentBootstrapPath = Join-Path $runtimeStatusDir "current-bootstrap.json"
		RuntimeLogPath = Join-Path $runtimeStatusDir "bootstrap.log"
		FrontendLogPath = Join-Path $runtimeStatusDir "frontend.log"
		RuntimeShellLogPath = Join-Path $runtimeStatusDir "runtime-shell.log"
		CompanionConfigDir = Join-Path $runtimeStatusDir "companion-config"
		CompanionStateDir = Join-Path $runtimeStatusDir "companions"
		SupportRoot = Join-Path $StatusBase "Suite\support-bundles"
	}
}

function Get-SuiteGatewayMode {
	return "suite_native"
}

function Get-SuiteGatewayModeLabel {
	param([string]$GatewayMode)

	$normalizedGatewayMode = if ($null -eq $GatewayMode) {
		""
	}
	else {
		([string]$GatewayMode).Trim().ToLowerInvariant()
	}

	switch ($normalizedGatewayMode) {
		default { return "Suite-native" }
	}
}

function Convert-ToSuiteSupportSummaryLines {
	param(
		[Parameter(Mandatory = $true)][object]$RuntimeStatus,
		[string]$RepoRoot
	)

	$lines = New-Object System.Collections.Generic.List[string]
	$checkedAt = [string]$RuntimeStatus.checkedAt
	if ([string]::IsNullOrWhiteSpace($checkedAt)) {
		$checkedAt = (Get-Date).ToString("o")
	}

	$lines.Add("Suite Runtime Control Support Summary")
	$lines.Add(("Generated: {0}" -f $checkedAt))

	$resolvedRepoRoot = if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
		$RepoRoot
	}
	elseif (-not [string]::IsNullOrWhiteSpace([string]$RuntimeStatus.repoRoot)) {
		[string]$RuntimeStatus.repoRoot
	}
	else {
		$null
	}
	if ($resolvedRepoRoot) {
		$lines.Add(("Repo: {0}" -f $resolvedRepoRoot))
	}

	$supportContext = Get-SuiteSupportContext -RuntimeStatus $RuntimeStatus -RepoRoot $resolvedRepoRoot
	if ($supportContext.Workstation) {
		$workstationParts = New-Object System.Collections.Generic.List[string]
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Workstation.WorkstationId)) {
			$workstationParts.Add([string]$supportContext.Workstation.WorkstationId)
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Workstation.WorkstationLabel)) {
			$workstationParts.Add([string]$supportContext.Workstation.WorkstationLabel)
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Workstation.WorkstationRole)) {
			$workstationParts.Add(("role: {0}" -f [string]$supportContext.Workstation.WorkstationRole))
		}
		if ($workstationParts.Count -gt 0) {
			$lines.Add(("Workstation: {0}" -f ([string]::Join(" | ", $workstationParts))))
		}
	}

	$runtime = $RuntimeStatus.runtime
	if ($runtime) {
		if (-not [string]::IsNullOrWhiteSpace([string]$runtime.logPath)) {
			$lines.Add(("Bootstrap log: {0}" -f [string]$runtime.logPath))
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$runtime.statusDir)) {
			$lines.Add(("Status directory: {0}" -f [string]$runtime.statusDir))
		}
	}

	$overall = $RuntimeStatus.overall
	if ($overall) {
		$overallText = [string]$overall.text
		$overallState = [string]$overall.state
		if ([string]::IsNullOrWhiteSpace($overallText)) {
			$overallText = "Unknown"
		}
		if ([string]::IsNullOrWhiteSpace($overallState)) {
			$overallState = "unknown"
		}
		if (-not [string]::IsNullOrWhiteSpace($overallText) -or -not [string]::IsNullOrWhiteSpace($overallState)) {
			$lines.Add(("Overall: {0} ({1})" -f $overallText, $overallState))
		}
	}

	$doctor = $RuntimeStatus.doctor
	if ($doctor) {
		$doctorState = [string]$doctor.overallState
		if ([string]::IsNullOrWhiteSpace($doctorState)) {
			$doctorState = "unknown"
		}
		$actionableIssueCount = 0
		if ($doctor.actionableIssueCount -ne $null) {
			$actionableIssueCount = [int]$doctor.actionableIssueCount
		}
		$lines.Add(("Suite doctor: {0}; actionable issues {1}" -f $doctorState, $actionableIssueCount))

		$recommendations = @($doctor.recommendations | Where-Object {
			-not [string]::IsNullOrWhiteSpace([string]$_)
		})
		foreach ($recommendation in ($recommendations | Select-Object -First 2)) {
			$lines.Add(("Recommendation: {0}" -f [string]$recommendation))
		}
	}

	if ($runtime -and $runtime.lastBootstrap -and -not [string]::IsNullOrWhiteSpace([string]$runtime.lastBootstrap.summary)) {
		$lines.Add(("Last bootstrap: {0}" -f [string]$runtime.lastBootstrap.summary))
	}

	if ($supportContext.Config) {
		$gatewayModeLabel = Get-SuiteGatewayModeLabel -GatewayMode ([string]$supportContext.Config.GatewayMode)
		if (-not [string]::IsNullOrWhiteSpace($gatewayModeLabel)) {
			$lines.Add(("Gateway mode: {0}" -f $gatewayModeLabel))
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Config.CodexConfigPath)) {
			$lines.Add(("Codex config: {0}" -f [string]$supportContext.Config.CodexConfigPath))
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Config.StableSuiteRoot)) {
			$lines.Add(("Stable Suite root: {0}" -f [string]$supportContext.Config.StableSuiteRoot))
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Config.DailyRoot)) {
			$lines.Add(("Daily root: {0}" -f [string]$supportContext.Config.DailyRoot))
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Config.OfficeExecutablePath)) {
			$lines.Add(("Office executable: {0}" -f [string]$supportContext.Config.OfficeExecutablePath))
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Config.SupabaseConfigPath)) {
			$lines.Add(("Supabase config: {0}" -f [string]$supportContext.Config.SupabaseConfigPath))
		}
		if (-not [string]::IsNullOrWhiteSpace([string]$supportContext.Config.GatewayStartupCheckScript)) {
			$lines.Add(("Gateway check: {0}" -f [string]$supportContext.Config.GatewayStartupCheckScript))
		}
	}

	$services = @($RuntimeStatus.services)
	if ($services.Count -gt 0) {
		$lines.Add("Services:")
		foreach ($service in $services) {
			$serviceName = [string]$service.name
			$serviceState = [string]$service.state
			$serviceSummary = [string]$service.summary
			if ([string]::IsNullOrWhiteSpace($serviceName)) {
				$serviceName = [string]$service.id
			}
			if ([string]::IsNullOrWhiteSpace($serviceSummary)) {
				$serviceSummary = "No summary reported."
			}
			if ([string]::IsNullOrWhiteSpace($serviceState)) {
				$serviceState = "unknown"
			}
			$lines.Add(("- {0}: {1} - {2}" -f $serviceName, $serviceState, $serviceSummary))
		}
	}

	return [string[]]$lines.ToArray()
}

function New-SuiteSupportSummaryPayload {
	param(
		[Parameter(Mandatory = $true)][object]$RuntimeStatus,
		[string]$RepoRoot
	)

	$supportContext = Get-SuiteSupportContext -RuntimeStatus $RuntimeStatus -RepoRoot $RepoRoot
	$lines = Convert-ToSuiteSupportSummaryLines -RuntimeStatus $RuntimeStatus -RepoRoot $RepoRoot
	[pscustomobject]@{
		generatedAt = if (-not [string]::IsNullOrWhiteSpace([string]$RuntimeStatus.checkedAt)) { [string]$RuntimeStatus.checkedAt } else { (Get-Date).ToString("o") }
		lines = $lines
		text = [string]::Join([Environment]::NewLine, $lines)
		workstation = $supportContext.Workstation
		config = $supportContext.Config
		paths = $supportContext.Paths
	}
}

function Convert-CommandOutputToText {
	param([object[]]$Output)

	if (-not $Output) {
		return ""
	}

	return [string]::Join(
		[Environment]::NewLine,
		@(
			$Output | ForEach-Object {
				if ($null -eq $_) {
					""
				}
				else {
					$_.ToString()
				}
			}
		)
	).Trim()
}

function Get-OutputTail {
	param(
		[string]$Text,
		[int]$LineCount = 10
	)

	if ([string]::IsNullOrWhiteSpace($Text)) {
		return ""
	}

	$lines = $Text -split "`r?`n"
	return [string]::Join([Environment]::NewLine, ($lines | Select-Object -Last $LineCount)).Trim()
}

function Invoke-JsonPowerShellFile {
	param(
		[Parameter(Mandatory = $true)][string]$ScriptPath,
		[string[]]$Arguments
	)

	try {
		$rawOutput = & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
		$exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
		$exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
		$outputText = Convert-CommandOutputToText -Output $rawOutput
	}
	catch {
		$exitCode = 1
		$outputText = $_.Exception.Message
	}

	$payload = $null
	if (-not [string]::IsNullOrWhiteSpace($outputText)) {
		try {
			$payload = $outputText | ConvertFrom-Json
		}
		catch {
			$firstBrace = $outputText.IndexOf("{")
			$lastBrace = $outputText.LastIndexOf("}")
			if ($firstBrace -ge 0 -and $lastBrace -gt $firstBrace) {
				$jsonText = $outputText.Substring($firstBrace, ($lastBrace - $firstBrace) + 1)
				try {
					$payload = $jsonText | ConvertFrom-Json
				}
				catch {
					$payload = $null
				}
			}
		}
	}

	[pscustomobject]@{
		ExitCode = $exitCode
		Ok = ($exitCode -eq 0)
		OutputText = $outputText
		OutputTail = Get-OutputTail -Text $outputText
		Payload = $payload
	}
}

function Test-PortListening {
	param([int]$Port)

	return ($null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1))
}

function Test-DockerReady {
	$previousErrorActionPreference = $ErrorActionPreference
	try {
		$ErrorActionPreference = "Continue"
		$rawOutput = & docker version --format "{{.Server.Version}}" 2>&1
		$exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
		$exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
		$outputText = Convert-CommandOutputToText -Output $rawOutput
		return (
			$exitCode -eq 0 -and
			-not [string]::IsNullOrWhiteSpace($outputText) -and
			$outputText -notmatch "(?i)failed to connect"
		)
	}
	catch {
		return $false
	}
	finally {
		$ErrorActionPreference = $previousErrorActionPreference
	}
}

function Get-TomlStringValue {
	param(
		[string]$Path,
		[string]$Key
	)

	if (-not $Path -or -not (Test-Path $Path)) {
		return $null
	}

	$pattern = "^\s*$([Regex]::Escape($Key))\s*=\s*""([^""]*)"""
	foreach ($line in Get-Content $Path) {
		$match = [Regex]::Match($line, $pattern)
		if ($match.Success) {
			return $match.Groups[1].Value.Trim()
		}
	}

	return $null
}

function Get-WorkstationIdentity {
	param(
		[string]$TomlPath,
		[string]$ExplicitWorkstationId
	)

	$computerName = [string]($env:COMPUTERNAME)
	$configuredWorkstationId = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ID")
	$resolvedWorkstationId = if ($ExplicitWorkstationId) {
		$ExplicitWorkstationId
	}
	elseif ($configuredWorkstationId) {
		$configuredWorkstationId
	}
	elseif ($computerName) {
		$computerName
	}
	else {
		[System.Net.Dns]::GetHostName()
	}

	[pscustomobject]@{
		WorkstationId = $resolvedWorkstationId.Trim()
		WorkstationLabel = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_LABEL")
		WorkstationRole = [string](Get-TomlStringValue -Path $TomlPath -Key "SUITE_WORKSTATION_ROLE")
		ComputerName = $computerName.Trim()
	}
}

function Get-SuiteCodexConfigPath {
	if (-not [string]::IsNullOrWhiteSpace([string]$env:CODEX_HOME)) {
		return Join-Path $env:CODEX_HOME "config.toml"
	}

	if (-not [string]::IsNullOrWhiteSpace([string]$env:USERPROFILE)) {
		return Join-Path $env:USERPROFILE ".codex\config.toml"
	}

	return $null
}

function Resolve-AbsolutePath {
	param(
		[string]$PathValue,
		[string]$RepoRoot
	)

	if ([string]::IsNullOrWhiteSpace($PathValue)) {
		return $null
	}
	if ([System.IO.Path]::IsPathRooted($PathValue)) {
		return [System.IO.Path]::GetFullPath($PathValue)
	}
	if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
		throw "RepoRoot is required when resolving relative paths."
	}

	return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $PathValue))
}

function Resolve-OptionalAbsolutePath {
	param(
		[string]$PathValue,
		[string]$RepoRoot
	)

	if ([string]::IsNullOrWhiteSpace($PathValue)) {
		return $null
	}

	try {
		return Resolve-AbsolutePath -PathValue $PathValue -RepoRoot $RepoRoot
	}
	catch {
		return $PathValue
	}
}

function New-SuiteWorkstationIdentityPayload {
	param(
		[string]$TomlPath,
		[string]$ExplicitWorkstationId
	)

	$identity = Get-WorkstationIdentity -TomlPath $TomlPath -ExplicitWorkstationId $ExplicitWorkstationId
	[pscustomobject]@{
		workstationId = [string]$identity.WorkstationId
		workstationLabel = if ([string]::IsNullOrWhiteSpace([string]$identity.WorkstationLabel)) { $null } else { [string]$identity.WorkstationLabel }
		workstationRole = if ([string]::IsNullOrWhiteSpace([string]$identity.WorkstationRole)) { $null } else { [string]$identity.WorkstationRole }
		computerName = if ([string]::IsNullOrWhiteSpace([string]$identity.ComputerName)) { $null } else { [string]$identity.ComputerName }
		userName = if ([string]::IsNullOrWhiteSpace([string]$env:USERNAME)) { $null } else { [string]$env:USERNAME }
		codexConfigPath = if ([string]::IsNullOrWhiteSpace([string]$TomlPath)) { $null } else { [string]$TomlPath }
	}
}

function New-SuiteSupportConfigSnapshot {
	param(
		[string]$RepoRoot,
		[string]$TomlPath
	)

	$resolvedRepoRoot = if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot } else { $null }
	$resolvedTomlPath = if ([string]::IsNullOrWhiteSpace($TomlPath)) {
		$null
	}
	else {
		Resolve-OptionalAbsolutePath -PathValue $TomlPath -RepoRoot $resolvedRepoRoot
	}
	$resolvedSupabaseConfigPath = if ($resolvedRepoRoot) {
		Resolve-OptionalAbsolutePath -PathValue "supabase\config.toml" -RepoRoot $resolvedRepoRoot
	}
	else {
		$null
	}

	$filesystemCollectorConfig = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_WATCHDOG_COLLECTOR_CONFIG"
	$filesystemCheckScript = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_WATCHDOG_STARTUP_CHECK_SCRIPT"
	$autocadCollectorConfig = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_COLLECTOR_CONFIG"
	$autocadStatePath = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_STATE_PATH"
	$autocadPluginBundleRoot = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_PLUGIN_BUNDLE_ROOT"
	$autocadStartupCheckScript = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_SCRIPT"
	$watchdogBackendCheckScript = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_WATCHDOG_BACKEND_STARTUP_CHECK_SCRIPT"
	$gatewayStartupCheckScript = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_GATEWAY_STARTUP_CHECK_SCRIPT"
	$runtimeBootstrapScript = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_RUNTIME_BOOTSTRAP_SCRIPT"
	$dailyRoot = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_DAILY_ROOT"
	$officeExecutablePath = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_OFFICE_EXECUTABLE_PATH"
	$stableSuiteRoot = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_STABLE_SUITE_ROOT"
	$stableOfficeExecutableCandidates = @(Get-SuiteStableOfficeExecutableCandidates)
	$existingStableOfficeExecutable = @(
		$stableOfficeExecutableCandidates |
			Where-Object { Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue -PathType Leaf } |
			Select-Object -First 1
	)
	$legacyDailyRoot = Get-SuiteLegacyDailyRoot
	$legacyOfficeExecutableCandidates = if (-not [string]::IsNullOrWhiteSpace($legacyDailyRoot)) {
		@(
			(Join-Path $legacyDailyRoot "artifacts\DailyDesk\publish\DailyDesk.exe"),
			(Join-Path $legacyDailyRoot "DailyDesk\bin\Release\net10.0-windows\DailyDesk.exe")
		)
	}
	else {
		@()
	}
	$existingLegacyOfficeExecutable = @(
		$legacyOfficeExecutableCandidates |
			Where-Object { Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue -PathType Leaf } |
			Select-Object -First 1
	)
	$resolvedStableSuiteRoot = if (-not [string]::IsNullOrWhiteSpace($stableSuiteRoot)) {
		Resolve-OptionalAbsolutePath -PathValue $stableSuiteRoot -RepoRoot $resolvedRepoRoot
	}
	else {
		[System.IO.Path]::GetFullPath((Join-Path (Get-SuiteStableDevRoot) "Suite"))
	}
	$resolvedDailyRoot = if (-not [string]::IsNullOrWhiteSpace($dailyRoot)) {
		Resolve-OptionalAbsolutePath -PathValue $dailyRoot -RepoRoot $resolvedRepoRoot
	}
	elseif ($existingLegacyOfficeExecutable.Count -gt 0) {
		Resolve-OptionalAbsolutePath -PathValue $legacyDailyRoot -RepoRoot $resolvedRepoRoot
	}
	else {
		[System.IO.Path]::GetFullPath((Get-SuiteStableDailyRoot))
	}
	$resolvedOfficeExecutablePath = if (-not [string]::IsNullOrWhiteSpace($officeExecutablePath)) {
		Resolve-OptionalAbsolutePath -PathValue $officeExecutablePath -RepoRoot $resolvedRepoRoot
	}
	elseif ($existingStableOfficeExecutable.Count -gt 0) {
		Resolve-OptionalAbsolutePath -PathValue ([string]$existingStableOfficeExecutable[0]) -RepoRoot $resolvedRepoRoot
	}
	elseif ($existingLegacyOfficeExecutable.Count -gt 0) {
		Resolve-OptionalAbsolutePath -PathValue ([string]$existingLegacyOfficeExecutable[0]) -RepoRoot $resolvedRepoRoot
	}
	else {
		Resolve-OptionalAbsolutePath -PathValue ([string]$stableOfficeExecutableCandidates[0]) -RepoRoot $resolvedRepoRoot
	}

	[pscustomobject]@{
		repoRoot = $resolvedRepoRoot
		stableSuiteRoot = $resolvedStableSuiteRoot
		dailyRoot = $resolvedDailyRoot
		officeExecutablePath = $resolvedOfficeExecutablePath
		codexConfigPath = $resolvedTomlPath
		codexConfigPresent = [bool]($resolvedTomlPath -and (Test-Path -LiteralPath $resolvedTomlPath))
		supabaseConfigPath = $resolvedSupabaseConfigPath
		supabaseConfigPresent = [bool]($resolvedSupabaseConfigPath -and (Test-Path -LiteralPath $resolvedSupabaseConfigPath))
		gatewayStartupCheckScript = Resolve-OptionalAbsolutePath -PathValue $gatewayStartupCheckScript -RepoRoot $resolvedRepoRoot
		runtimeBootstrapScript = Resolve-OptionalAbsolutePath -PathValue $runtimeBootstrapScript -RepoRoot $resolvedRepoRoot
		watchdogCollectorConfigPath = Resolve-OptionalAbsolutePath -PathValue $filesystemCollectorConfig -RepoRoot $resolvedRepoRoot
		watchdogCollectorStartupCheckScript = Resolve-OptionalAbsolutePath -PathValue $filesystemCheckScript -RepoRoot $resolvedRepoRoot
		watchdogAutoCadCollectorConfigPath = Resolve-OptionalAbsolutePath -PathValue $autocadCollectorConfig -RepoRoot $resolvedRepoRoot
		watchdogAutoCadStatePath = Resolve-OptionalAbsolutePath -PathValue $autocadStatePath -RepoRoot $resolvedRepoRoot
		watchdogAutoCadPluginBundleRoot = Resolve-OptionalAbsolutePath -PathValue $autocadPluginBundleRoot -RepoRoot $resolvedRepoRoot
		watchdogAutoCadStartupCheckScript = Resolve-OptionalAbsolutePath -PathValue $autocadStartupCheckScript -RepoRoot $resolvedRepoRoot
		watchdogBackendStartupCheckScript = Resolve-OptionalAbsolutePath -PathValue $watchdogBackendCheckScript -RepoRoot $resolvedRepoRoot
		gatewayMode = Get-SuiteGatewayMode
	}
}

function New-SuiteSupportPathSnapshot {
	param(
		[Parameter(Mandatory = $true)][object]$RuntimeStatus
	)

	$runtime = $RuntimeStatus.runtime
	[pscustomobject]@{
		statusDir = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.statusDir)) { [string]$runtime.statusDir } else { $null }
		statusPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.statusPath)) { [string]$runtime.statusPath } else { $null }
		currentBootstrapPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.currentBootstrapPath)) { [string]$runtime.currentBootstrapPath } else { $null }
		bootstrapLogPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.logPath)) { [string]$runtime.logPath } else { $null }
		frontendLogPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.frontendLogPath)) { [string]$runtime.frontendLogPath } else { $null }
		supportRoot = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.supportRoot)) { [string]$runtime.supportRoot } else { $null }
	}
}

function Get-SuiteSupportContext {
	param(
		[Parameter(Mandatory = $true)][object]$RuntimeStatus,
		[string]$RepoRoot
	)

	$resolvedRepoRoot = if (-not [string]::IsNullOrWhiteSpace([string]$RepoRoot)) {
		$RepoRoot
	}
	elseif (-not [string]::IsNullOrWhiteSpace([string]$RuntimeStatus.repoRoot)) {
		[string]$RuntimeStatus.repoRoot
	}
	else {
		$null
	}

	$support = if ($RuntimeStatus -and $RuntimeStatus.PSObject.Properties.Match("support").Count -gt 0) {
		$RuntimeStatus.support
	}
	else {
		$null
	}
	$workstation = if ($support -and $support.workstation) {
		$support.workstation
	}
	else {
		New-SuiteWorkstationIdentityPayload -TomlPath (Get-SuiteCodexConfigPath) -ExplicitWorkstationId $null
	}
	$config = if ($support -and $support.config) {
		$support.config
	}
	else {
		New-SuiteSupportConfigSnapshot -RepoRoot $resolvedRepoRoot -TomlPath (Get-SuiteCodexConfigPath)
	}
	$paths = if ($support -and $support.paths) {
		$support.paths
	}
	else {
		New-SuiteSupportPathSnapshot -RuntimeStatus $RuntimeStatus
	}

	[pscustomobject]@{
		Workstation = $workstation
		Config = $config
		Paths = $paths
	}
}

function Convert-ToSlug {
	param([string]$Value)

	$slug = [Regex]::Replace(([string]$Value).ToLowerInvariant(), "[^a-z0-9]+", "-")
	return $slug.Trim("-")
}

function Get-CollectorScheduledTask {
	param([string]$Name)

	if ([string]::IsNullOrWhiteSpace($Name)) {
		return $null
	}

	$command = Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue
	if (-not $command) {
		return $null
	}

	try {
		return Get-ScheduledTask -TaskName $Name -ErrorAction Stop
	}
	catch {
		return $null
	}
}

function Get-RunKeyValue {
	param([string]$Name)

	if ([string]::IsNullOrWhiteSpace($Name)) {
		return $null
	}

	$runKey = $null
	try {
		$runKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\Windows\CurrentVersion\Run", $false)
		if ($null -eq $runKey) {
			return $null
		}

		$value = $runKey.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
		if ($null -eq $value) {
			return $null
		}

		return [string]$value
	}
	catch {
		return $null
	}
	finally {
		if ($null -ne $runKey) {
			$runKey.Dispose()
		}
	}
}

function Get-SuiteConfigStringOverride {
	param(
		[string]$TomlPath,
		[Parameter(Mandatory = $true)][string]$Key
	)

	$envEntry = Get-Item -Path ("Env:{0}" -f $Key) -ErrorAction SilentlyContinue
	if ($null -ne $envEntry) {
		$envValue = [string]$envEntry.Value
		if (-not [string]::IsNullOrWhiteSpace($envValue)) {
			return $envValue.Trim()
		}
	}

	$tomlValue = [string](Get-TomlStringValue -Path $TomlPath -Key $Key)
	if (-not [string]::IsNullOrWhiteSpace($tomlValue)) {
		return $tomlValue.Trim()
	}

	return $null
}

function Get-SuiteStableDevRoot {
	if (-not [string]::IsNullOrWhiteSpace([string]$env:SystemDrive)) {
		return Join-Path $env:SystemDrive "Dev"
	}

	return "C:\Dev"
}

function Get-SuiteStableDailyRoot {
	return Join-Path (Get-SuiteStableDevRoot) "Daily"
}

function Get-SuiteStableOfficeExecutableCandidates {
	$stableDailyRoot = Get-SuiteStableDailyRoot
	return @(
		(Join-Path $stableDailyRoot "artifacts\DailyDesk\publish\DailyDesk.exe"),
		(Join-Path $stableDailyRoot "DailyDesk\bin\Release\net10.0-windows\DailyDesk.exe")
	)
}

function Get-SuiteLegacyDailyRoot {
	if (-not [string]::IsNullOrWhiteSpace([string]$env:USERPROFILE)) {
		return Join-Path $env:USERPROFILE "OneDrive\Desktop\Daily"
	}

	return $null
}

function Get-SuiteCompanionAppConfigPath {
	param([Parameter(Mandatory = $true)][string]$CompanionAppId)

	$runtimePaths = Get-SuiteRuntimePaths
	$configDir = $runtimePaths.CompanionConfigDir
	New-Item -ItemType Directory -Path $configDir -Force | Out-Null
	return Join-Path $configDir ("{0}.json" -f $CompanionAppId.Trim().ToLowerInvariant())
}

function Read-SuiteCompanionAppLocalConfig {
	param([Parameter(Mandatory = $true)][string]$CompanionAppId)

	$configPath = Get-SuiteCompanionAppConfigPath -CompanionAppId $CompanionAppId
	if (-not (Test-Path -LiteralPath $configPath)) {
		return $null
	}

	try {
		return (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json)
	}
	catch {
		return $null
	}
}

function Write-SuiteCompanionAppLocalConfig {
	param(
		[Parameter(Mandatory = $true)][string]$CompanionAppId,
		[Parameter(Mandatory = $true)][object]$Config
	)

	$configPath = Get-SuiteCompanionAppConfigPath -CompanionAppId $CompanionAppId
	$Config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
	return $configPath
}

function Remove-SuiteCompanionAppLocalConfig {
	param([Parameter(Mandatory = $true)][string]$CompanionAppId)

	$configPath = Get-SuiteCompanionAppConfigPath -CompanionAppId $CompanionAppId
	if (-not (Test-Path -LiteralPath $configPath)) {
		return $false
	}

	Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
	return $true
}

function Remove-RunKeyValue {
	param([string]$Name)

	if ([string]::IsNullOrWhiteSpace($Name)) {
		return $false
	}

	$runKey = $null
	try {
		$runKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\Windows\CurrentVersion\Run", $true)
		if ($null -eq $runKey) {
			return $false
		}

		$existingValue = $runKey.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
		if ([string]::IsNullOrWhiteSpace([string]$existingValue)) {
			return $false
		}

		$runKey.DeleteValue($Name, $false)
		return $true
	}
	catch {
		return $false
	}
	finally {
		if ($null -ne $runKey) {
			$runKey.Dispose()
		}
	}
}

function Test-DaemonRunning {
	param(
		[string]$DaemonScriptPath,
		[string]$CollectorConfigPath
	)

	$daemonToken = [System.IO.Path]::GetFileName($DaemonScriptPath).ToLowerInvariant()
	$configToken = [string]$CollectorConfigPath
	if ($configToken) {
		$configToken = $configToken.ToLowerInvariant()
	}

	$processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'"
	foreach ($process in $processes) {
		$commandLine = [string]$process.CommandLine
		if ([string]::IsNullOrWhiteSpace($commandLine)) {
			continue
		}

		$normalized = $commandLine.ToLowerInvariant()
		if (-not $normalized.Contains($daemonToken)) {
			continue
		}
		if ($configToken -and -not $normalized.Contains($configToken)) {
			continue
		}

		return $true
	}

	return $false
}

function Start-CollectorDaemonProcess {
	param(
		[Parameter(Mandatory = $true)][string]$WorkingDirectory,
		[Parameter(Mandatory = $true)][string]$DaemonScriptPath,
		[Parameter(Mandatory = $true)][string]$CollectorConfigPath,
		[Parameter(Mandatory = $true)][string]$TomlPath,
		[Parameter(Mandatory = $true)][string]$NamedMutex
	)

	$arguments = @(
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-WindowStyle",
		"Hidden",
		"-File",
		$DaemonScriptPath,
		"-ConfigPath",
		$CollectorConfigPath,
		"-CodexConfigPath",
		$TomlPath,
		"-MutexName",
		$NamedMutex
	)

	Start-SuiteDetachedProcess -FilePath "PowerShell.exe" -WorkingDirectory $WorkingDirectory -Arguments $arguments | Out-Null
}

function Get-SuiteCompanionAppRunValueName {
	param([Parameter(Mandatory = $true)][string]$CompanionAppId)

	switch ($CompanionAppId.Trim().ToLowerInvariant()) {
		"office" { return "DailyDeskOffice" }
		default { return $null }
	}
}

function Get-SuiteCompanionAppStatePath {
	param([Parameter(Mandatory = $true)][string]$CompanionAppId)

	$runtimePaths = Get-SuiteRuntimePaths
	$stateDir = $runtimePaths.CompanionStateDir
	New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
	return Join-Path $stateDir ("{0}.json" -f $CompanionAppId.Trim().ToLowerInvariant())
}

function Get-SuiteCompanionAppConfig {
	param(
		[Parameter(Mandatory = $true)][string]$CompanionAppId,
		[string]$RepoRoot,
		[string]$TomlPath
	)

	$normalizedId = $CompanionAppId.Trim().ToLowerInvariant()
	switch ($normalizedId) {
		"office" {
			$localConfig = Read-SuiteCompanionAppLocalConfig -CompanionAppId $normalizedId
			$stableDailyRoot = Get-SuiteStableDailyRoot
			$stableExecutableCandidates = @(Get-SuiteStableOfficeExecutableCandidates)
			$stableExecutable = [string]$stableExecutableCandidates[0]
			$legacyDailyRoot = Get-SuiteLegacyDailyRoot
			$legacyExecutableCandidates = if (-not [string]::IsNullOrWhiteSpace($legacyDailyRoot)) {
				@(
					(Join-Path $legacyDailyRoot "artifacts\DailyDesk\publish\DailyDesk.exe"),
					(Join-Path $legacyDailyRoot "DailyDesk\bin\Release\net10.0-windows\DailyDesk.exe")
				)
			}
			else {
				@()
			}

			$configuredExecutablePath = if ($localConfig -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.executablePath)) {
				[string]$localConfig.executablePath
			}
			else {
				Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_OFFICE_EXECUTABLE_PATH"
			}
			$configuredRootDirectory = if ($localConfig -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.rootDirectory)) {
				[string]$localConfig.rootDirectory
			}
			else {
				Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_DAILY_ROOT"
			}

			$configSource = if ($localConfig -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.executablePath)) {
				"local_config"
			}
			elseif (-not [string]::IsNullOrWhiteSpace($configuredExecutablePath) -or -not [string]::IsNullOrWhiteSpace($configuredRootDirectory)) {
				"env_or_toml_override"
			}
			elseif (@($stableExecutableCandidates | Where-Object { Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue -PathType Leaf }).Count -gt 0) {
				"stable_default"
			}
			elseif (@($legacyExecutableCandidates | Where-Object { Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue -PathType Leaf }).Count -gt 0) {
				"legacy_default"
			}
			else {
				"stable_default"
			}

			$executablePath = if (-not [string]::IsNullOrWhiteSpace($configuredExecutablePath)) {
				$configuredExecutablePath
			}
			elseif ($configSource -eq "legacy_default") {
				$firstLegacyExecutable = @($legacyExecutableCandidates | Select-Object -First 1)
				if ($firstLegacyExecutable.Count -gt 0) {
					[string]$firstLegacyExecutable[0]
				}
				else {
					$null
				}
			}
			elseif ($configSource -eq "stable_default") {
				$firstStableExecutable = @($stableExecutableCandidates | Select-Object -First 1)
				if ($firstStableExecutable.Count -gt 0) {
					[string]$firstStableExecutable[0]
				}
				else {
					$stableExecutable
				}
			}
			else {
				$stableExecutable
			}
			if ([string]::IsNullOrWhiteSpace($configuredExecutablePath)) {
				if ($configSource -eq "stable_default") {
					$existingStableExecutable = @(
						$stableExecutableCandidates |
							Where-Object { Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue -PathType Leaf } |
							Select-Object -First 1
					)
					if ($existingStableExecutable.Count -gt 0) {
						$executablePath = [string]$existingStableExecutable[0]
					}
				}
				elseif ($configSource -eq "legacy_default") {
					$existingLegacyExecutable = @(
						$legacyExecutableCandidates |
							Where-Object { Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue -PathType Leaf } |
							Select-Object -First 1
					)
					if ($existingLegacyExecutable.Count -gt 0) {
						$executablePath = [string]$existingLegacyExecutable[0]
					}
				}
			}
			$resolvedExecutablePath = Resolve-OptionalAbsolutePath -PathValue $executablePath -RepoRoot $RepoRoot
			$workingDirectory = if (-not [string]::IsNullOrWhiteSpace($resolvedExecutablePath)) {
				Split-Path -Parent $resolvedExecutablePath
			}
			else {
				$null
			}
			$rootDirectory = if (-not [string]::IsNullOrWhiteSpace($configuredRootDirectory)) {
				Resolve-OptionalAbsolutePath -PathValue $configuredRootDirectory -RepoRoot $RepoRoot
			}
			elseif ($configSource -eq "legacy_default") {
				Resolve-OptionalAbsolutePath -PathValue $legacyDailyRoot -RepoRoot $RepoRoot
			}
			else {
				Resolve-OptionalAbsolutePath -PathValue $stableDailyRoot -RepoRoot $RepoRoot
			}
			$timeoutSeconds = 90

			return [pscustomobject]@{
				id = "office"
				title = "Office"
				enabled = $true
				executablePath = $resolvedExecutablePath
				workingDirectory = $workingDirectory
				rootDirectory = $rootDirectory
				configSource = $configSource
				configPath = Get-SuiteCompanionAppConfigPath -CompanionAppId $normalizedId
				launchAfterRuntimeReady = $true
				timeoutSeconds = $timeoutSeconds
				launchMode = "managed_companion"
				processName = "DailyDesk"
			}
		}
		default {
			return $null
		}
	}
}

function Read-SuiteCompanionAppState {
	param([Parameter(Mandatory = $true)][string]$CompanionAppId)

	$statePath = Get-SuiteCompanionAppStatePath -CompanionAppId $CompanionAppId
	if (-not (Test-Path -LiteralPath $statePath)) {
		return $null
	}

	try {
		return (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json)
	}
	catch {
		return $null
	}
}

function Write-SuiteCompanionAppState {
	param(
		[Parameter(Mandatory = $true)][string]$CompanionAppId,
		[Parameter(Mandatory = $true)][object]$State
	)

	$statePath = Get-SuiteCompanionAppStatePath -CompanionAppId $CompanionAppId
	$State | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $statePath -Encoding UTF8
	return $statePath
}

function Get-SuiteCompanionAppProcessInfo {
	param(
		[Parameter(Mandatory = $true)][string]$CompanionAppId,
		[Parameter(Mandatory = $true)][object]$Config
	)

	$processName = [string]$Config.processName
	$expectedPath = if (-not [string]::IsNullOrWhiteSpace([string]$Config.executablePath)) {
		([string]$Config.executablePath).ToLowerInvariant()
	}
	else {
		$null
	}

	$processes = @()
	if (-not [string]::IsNullOrWhiteSpace($processName)) {
		$processes = @(Get-CimInstance Win32_Process -Filter ("Name = '{0}.exe'" -f $processName) -ErrorAction SilentlyContinue)
	}

	foreach ($process in $processes) {
		$commandLine = [string]$process.CommandLine
		if ($expectedPath -and -not [string]::IsNullOrWhiteSpace($commandLine)) {
			if (-not $commandLine.ToLowerInvariant().Contains($expectedPath)) {
				continue
			}
		}

		return [pscustomobject]@{
			running = $true
			pid = [int]$process.ProcessId
			commandLine = $commandLine
		}
	}

	return [pscustomobject]@{
		running = $false
		pid = $null
		commandLine = $null
	}
}

function Get-SuiteCompanionAppSnapshot {
	param(
		[Parameter(Mandatory = $true)][string]$CompanionAppId,
		[string]$RepoRoot,
		[string]$TomlPath
	)

	$config = Get-SuiteCompanionAppConfig -CompanionAppId $CompanionAppId -RepoRoot $RepoRoot -TomlPath $TomlPath
	if ($null -eq $config) {
		return $null
	}

	$state = Read-SuiteCompanionAppState -CompanionAppId $CompanionAppId
	$processInfo = Get-SuiteCompanionAppProcessInfo -CompanionAppId $CompanionAppId -Config $config
	$executableFound = -not [string]::IsNullOrWhiteSpace([string]$config.executablePath) -and (Test-Path -LiteralPath ([string]$config.executablePath))
	$stateKnownPid = if ($state -and $state.PSObject.Properties.Name -contains "lastKnownPid" -and $null -ne $state.lastKnownPid) {
		[int]$state.lastKnownPid
	}
	else {
		$null
	}
	$lastLaunchSource = if ($state -and $state.PSObject.Properties.Name -contains "lastLaunchSource" -and -not [string]::IsNullOrWhiteSpace([string]$state.lastLaunchSource)) {
		[string]$state.lastLaunchSource
	}
	else {
		$null
	}
	$startedOutsideRuntimeControl = [bool]($processInfo.running -and $stateKnownPid -and $processInfo.pid -ne $stateKnownPid)

	[pscustomobject]@{
		id = [string]$config.id
		title = [string]$config.title
		enabled = [bool]$config.enabled
		executablePath = [string]$config.executablePath
		executableFound = $executableFound
		workingDirectory = [string]$config.workingDirectory
		rootDirectory = [string]$config.rootDirectory
		configSource = if ($config.PSObject.Properties.Name -contains "configSource") { [string]$config.configSource } else { $null }
		configPath = if ($config.PSObject.Properties.Name -contains "configPath") { [string]$config.configPath } else { $null }
		launchAfterRuntimeReady = [bool]$config.launchAfterRuntimeReady
		timeoutSeconds = [int]$config.timeoutSeconds
		launchMode = [string]$config.launchMode
		running = [bool]$processInfo.running
		pid = if ($processInfo.running) { [int]$processInfo.pid } else { $null }
		launchSource = if ($startedOutsideRuntimeControl) { "outside-runtime-control" } else { $lastLaunchSource }
		lastLaunchAt = if ($state -and $state.PSObject.Properties.Name -contains "lastLaunchAt") { [string]$state.lastLaunchAt } else { $null }
		lastLaunchStatus = if ($state -and $state.PSObject.Properties.Name -contains "lastLaunchStatus") { [string]$state.lastLaunchStatus } else { $null }
		lastLaunchMessage = if ($state -and $state.PSObject.Properties.Name -contains "lastLaunchMessage") { [string]$state.lastLaunchMessage } else { $null }
		lastKnownPid = $stateKnownPid
		startedOutsideRuntimeControl = $startedOutsideRuntimeControl
	}
}

function Get-SuiteCompanionAppsSnapshot {
	param(
		[string]$RepoRoot,
		[string]$TomlPath
	)

	$officeSnapshot = Get-SuiteCompanionAppSnapshot -CompanionAppId "office" -RepoRoot $RepoRoot -TomlPath $TomlPath
	if ($null -eq $officeSnapshot) {
		return @()
	}

	return @($officeSnapshot)
}

function Remove-SuiteCompanionAppRunKeyEntry {
	param([Parameter(Mandatory = $true)][string]$CompanionAppId)

	$runValueName = Get-SuiteCompanionAppRunValueName -CompanionAppId $CompanionAppId
	if ([string]::IsNullOrWhiteSpace($runValueName)) {
		return $false
	}

	return Remove-RunKeyValue -Name $runValueName
}

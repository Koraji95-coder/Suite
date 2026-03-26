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

	$filesystemCollectorConfig = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_WATCHDOG_COLLECTOR_CONFIG"
	$filesystemCheckScript = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_WATCHDOG_STARTUP_CHECK_SCRIPT"
	$autocadCollectorConfig = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_COLLECTOR_CONFIG"
	$autocadStatePath = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_STATE_PATH"
	$autocadPluginBundleRoot = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_PLUGIN_BUNDLE_ROOT"
	$autocadStartupCheckScript = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_SCRIPT"
	$watchdogBackendCheckScript = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_WATCHDOG_BACKEND_STARTUP_CHECK_SCRIPT"
	$gatewayStartupCheckScript = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_GATEWAY_STARTUP_CHECK_SCRIPT"
	$runtimeBootstrapScript = Get-TomlStringValue -Path $resolvedTomlPath -Key "SUITE_RUNTIME_BOOTSTRAP_SCRIPT"

	[pscustomobject]@{
		repoRoot = $resolvedRepoRoot
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

	$runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
	try {
		return [string](Get-ItemPropertyValue -Path $runKeyPath -Name $Name -ErrorAction Stop)
	}
	catch {
		return $null
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

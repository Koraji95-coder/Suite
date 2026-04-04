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
		BackendLogPath = Join-Path $runtimeStatusDir "backend.log"
		FrontendLogPath = Join-Path $runtimeStatusDir "frontend.log"
		RuntimeLauncherLogPath = Join-Path $runtimeStatusDir "runtime-launcher.log"
		RuntimeShellLogPath = Join-Path $runtimeStatusDir "runtime-shell.log"
		OfficeBrokerLogPath = Join-Path $runtimeStatusDir "office-broker.log"
		ShellWindowStatePath = Join-Path $runtimeStatusDir "shell-window-state.json"
		FilesystemCollectorLogDir = Join-Path $StatusBase "Suite\watchdog-collector\logs"
		AutoCadCollectorLogDir = Join-Path $StatusBase "Suite\watchdog-autocad-collector\logs"
		CompanionConfigDir = Join-Path $runtimeStatusDir "companion-config"
		CompanionStateDir = Join-Path $runtimeStatusDir "companions"
		SupportRoot = Join-Path $StatusBase "Suite\support-bundles"
	}
}

function Get-SuiteRuntimeShellInstanceKey {
	param([Parameter(Mandatory = $true)][string]$RepoRoot)

	$root = if ([string]::IsNullOrWhiteSpace($RepoRoot)) { "." } else { $RepoRoot }
	$normalizedPath = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/').Trim().ToLowerInvariant()
	$hashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
		[System.Text.Encoding]::UTF8.GetBytes($normalizedPath)
	)
	return ([System.BitConverter]::ToString($hashBytes, 0, 8)).Replace("-", "")
}

function Get-SuiteRuntimeShellPaths {
	param(
		[Parameter(Mandatory = $true)][string]$RepoRoot,
		[string]$StatusBase = (Get-SuiteStatusBasePath)
	)

	$runtimePaths = Get-SuiteRuntimePaths -StatusBase $StatusBase
	$instanceKey = Get-SuiteRuntimeShellInstanceKey -RepoRoot $RepoRoot
	$lockDirectory = Join-Path $runtimePaths.RuntimeStatusDir "locks"

	[pscustomobject]@{
		InstanceKey = $instanceKey
		LockDirectory = $lockDirectory
		LockPath = Join-Path $lockDirectory ("runtime-shell-{0}.lock" -f $instanceKey)
		PrimaryStatePath = Join-Path $lockDirectory ("runtime-shell-{0}.primary.json" -f $instanceKey)
		ActivationRequestPath = Join-Path $lockDirectory ("runtime-shell-{0}.activation.json" -f $instanceKey)
		StartupManifestPath = Join-Path $runtimePaths.RuntimeStatusDir "startup-owner.json"
	}
}

function Get-SuiteRuntimeStartupManifestPath {
	param([string]$StatusBase = (Get-SuiteStatusBasePath))

	$runtimePaths = Get-SuiteRuntimePaths -StatusBase $StatusBase
	return Join-Path $runtimePaths.RuntimeStatusDir "startup-owner.json"
}

function Read-SuiteRuntimeStartupManifest {
	param([string]$StatusBase = (Get-SuiteStatusBasePath))

	$manifestPath = Get-SuiteRuntimeStartupManifestPath -StatusBase $StatusBase
	if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
		return $null
	}

	try {
		return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
	}
	catch {
		return $null
	}
}

function Write-SuiteRuntimeStartupManifest {
	param(
		[Parameter(Mandatory = $true)][object]$Manifest,
		[string]$StatusBase = (Get-SuiteStatusBasePath)
	)

	$manifestPath = Get-SuiteRuntimeStartupManifestPath -StatusBase $StatusBase
	$manifestDirectory = Split-Path -Parent $manifestPath
	if (-not [string]::IsNullOrWhiteSpace($manifestDirectory)) {
		New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
	}

	$Manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
	return $manifestPath
}

function Ensure-SuiteOfficeWorkspaceRoots {
	$workspaceRoot = Get-SuiteOfficeWorkspaceRoot
	$knowledgeRoot = Get-SuiteOfficeKnowledgeRoot
	$stateRoot = Get-SuiteOfficeStateRoot

	foreach ($path in @($workspaceRoot, $knowledgeRoot, $stateRoot)) {
		if ([string]::IsNullOrWhiteSpace($path)) {
			continue
		}

		New-Item -ItemType Directory -Path $path -Force | Out-Null
	}

	return [pscustomobject]@{
		workspaceRoot = $workspaceRoot
		workspaceRootExists = (Test-Path -LiteralPath $workspaceRoot -PathType Container)
		knowledgeRoot = $knowledgeRoot
		knowledgeRootExists = (Test-Path -LiteralPath $knowledgeRoot -PathType Container)
		stateRoot = $stateRoot
		stateRootExists = (Test-Path -LiteralPath $stateRoot -PathType Container)
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

	$shell = $RuntimeStatus.shell
	if ($shell) {
		$shellStatus = [string]$shell.status
		if ([string]::IsNullOrWhiteSpace($shellStatus)) {
			$shellStatus = "unknown"
		}

		$shellPhase = [string]$shell.phase
		$shellDetail = [string]$shell.detail
		$parts = @()
		if (-not [string]::IsNullOrWhiteSpace($shellPhase)) {
			$parts += "phase $shellPhase"
		}
		if (-not [string]::IsNullOrWhiteSpace($shellDetail)) {
			$parts += $shellDetail
		}

		if ($parts.Count -gt 0) {
			$lines.Add(("Shared shell: {0}; {1}" -f $shellStatus, [string]::Join(" | ", $parts)))
		}
		else {
			$lines.Add(("Shared shell: {0}" -f $shellStatus))
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

function Get-TomlSectionIntegerValue {
	param(
		[string]$Path,
		[string]$SectionName,
		[string]$Key
	)

	if (
		[string]::IsNullOrWhiteSpace($Path) -or
		[string]::IsNullOrWhiteSpace($SectionName) -or
		[string]::IsNullOrWhiteSpace($Key) -or
		-not (Test-Path -LiteralPath $Path)
	) {
		return $null
	}

	$currentSection = $null
	foreach ($line in Get-Content -LiteralPath $Path) {
		$trimmedLine = $line.Trim()
		if ($trimmedLine -match '^\[(.+)\]$') {
			$currentSection = $Matches[1].Trim()
			continue
		}

		if (
			$currentSection -eq $SectionName -and
			$trimmedLine -match ('^{0}\s*=\s*(\d+)\b' -f [Regex]::Escape($Key))
		) {
			return [int]$Matches[1]
		}
	}

	return $null
}

function Get-TomlSectionBooleanValue {
	param(
		[string]$Path,
		[string]$SectionName,
		[string]$Key
	)

	if (
		[string]::IsNullOrWhiteSpace($Path) -or
		[string]::IsNullOrWhiteSpace($SectionName) -or
		[string]::IsNullOrWhiteSpace($Key) -or
		-not (Test-Path -LiteralPath $Path)
	) {
		return $null
	}

	$currentSection = $null
	foreach ($line in Get-Content -LiteralPath $Path) {
		$trimmedLine = $line.Trim()
		if ($trimmedLine -match '^\[(.+)\]$') {
			$currentSection = $Matches[1].Trim()
			continue
		}

		if (
			$currentSection -eq $SectionName -and
			$trimmedLine -match ('^{0}\s*=\s*(true|false)\b' -f [Regex]::Escape($Key))
		) {
			return [System.Convert]::ToBoolean($Matches[1])
		}
	}

	return $null
}

function Get-DotEnvStringValue {
	param(
		[string]$Path,
		[string]$Key
	)

	if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
		return $null
	}

	$pattern = "^\s*$([Regex]::Escape($Key))\s*=(.*)$"
	foreach ($line in Get-Content -LiteralPath $Path) {
		$match = [Regex]::Match($line, $pattern)
		if (-not $match.Success) {
			continue
		}

		$value = $match.Groups[1].Value.Trim()
		if (
			($value.StartsWith('"') -and $value.EndsWith('"')) -or
			($value.StartsWith("'") -and $value.EndsWith("'"))
		) {
			$value = $value.Substring(1, $value.Length - 2)
		}

		return $value
	}

	return $null
}

function Get-SuiteSupabaseConfigPath {
	param([string]$RepoRoot)

	if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
		return $null
	}

	$configPath = Join-Path ([System.IO.Path]::GetFullPath($RepoRoot)) "supabase\config.toml"
	if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
		return $null
	}

	return $configPath
}

function Test-SuiteSupabaseFunctionsDirectoryPresent {
	param([string]$RepoRoot)

	if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
		return $false
	}

	$functionsPath = Join-Path ([System.IO.Path]::GetFullPath($RepoRoot)) "supabase\functions"
	if (-not (Test-Path -LiteralPath $functionsPath -PathType Container)) {
		return $false
	}

	# Treat placeholder-only folders as "no functions" so Runtime Control does not
	# report local Supabase as degraded when edge runtime is effectively unused.
	$functionDirectories = @(
		Get-ChildItem -LiteralPath $functionsPath -Directory -Force -ErrorAction SilentlyContinue |
			Where-Object {
				$_.Name -notmatch '^\.' -and
				$_.Name -ne "_shared"
			}
	)
	return ($functionDirectories.Count -gt 0)
}

function Test-SuiteSupabaseEdgeRuntimeExpected {
	param([string]$RepoRoot)

	$configPath = Get-SuiteSupabaseConfigPath -RepoRoot $RepoRoot
	if ([string]::IsNullOrWhiteSpace($configPath)) {
		return $false
	}

	$edgeRuntimeEnabled = Get-TomlSectionBooleanValue -Path $configPath -SectionName "edge_runtime" -Key "enabled"
	if ($null -eq $edgeRuntimeEnabled -or -not $edgeRuntimeEnabled) {
		return $false
	}

	return (Test-SuiteSupabaseFunctionsDirectoryPresent -RepoRoot $RepoRoot)
}

function Get-SuiteSupabaseStoppedServices {
	param([string]$Text)

	if ([string]::IsNullOrWhiteSpace($Text)) {
		return @()
	}

	$match = [Regex]::Match($Text, '(?im)^Stopped services:\s*\[(.*?)\]\s*$')
	if (-not $match.Success) {
		return @()
	}

	$rawServices = $match.Groups[1].Value.Trim()
	if ([string]::IsNullOrWhiteSpace($rawServices)) {
		return @()
	}

	return @(
		$rawServices -split '[,\s]+' |
			ForEach-Object { [string]$_ } |
			Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
	)
}

function Get-SuiteSupabaseMissingExpectedServices {
	param(
		[string]$RepoRoot,
		[string]$StatusText
	)

	$missingServices = New-Object System.Collections.Generic.List[string]
	$stoppedServices = @(Get-SuiteSupabaseStoppedServices -Text $StatusText)
	if ($stoppedServices.Count -eq 0) {
		return @()
	}

	if (Test-SuiteSupabaseEdgeRuntimeExpected -RepoRoot $RepoRoot) {
		$edgeRuntimeStopped = @(
			$stoppedServices |
				Where-Object { $_ -match '^(?i)supabase_edge_runtime_' }
		).Count -gt 0
		if ($edgeRuntimeStopped) {
			$missingServices.Add("edge_runtime") | Out-Null
		}
	}

	return @($missingServices.ToArray())
}

function Test-SuiteSupabaseStatusReady {
	param(
		[string]$Text,
		[string]$RepoRoot
	)

	if ([string]::IsNullOrWhiteSpace($Text)) {
		return $false
	}

	if (
		$Text -match "(?im)\bcontainer is not ready\b" -or
		$Text -match "(?im)\bfailed to inspect\b" -or
		$Text -match "(?im)\btry rerunning the command with --debug\b" -or
		$Text -match "(?im)\bno active local containers\b"
	) {
		return $false
	}

	$hasReadyMarker = (
		$Text -match "(?im)\bsupabase local development setup is running\b" -or
		$Text -match "(?im)\bProject URL\b"
	)
	if (-not $hasReadyMarker) {
		return $false
	}

	return (@(Get-SuiteSupabaseMissingExpectedServices -RepoRoot $RepoRoot -StatusText $Text).Count -eq 0)
}

function Get-SuiteSupabaseLocalPorts {
	param([string]$RepoRoot)

	$ports = [ordered]@{
		api = 54321
		db = 54322
		shadowDb = 54320
		pooler = 54329
		studio = 54323
		inbucket = 54324
		smtp = 2500
		edgeInspector = 8083
		analytics = 54327
	}

	if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
		return [pscustomobject]$ports
	}

	$configPath = Join-Path ([System.IO.Path]::GetFullPath($RepoRoot)) "supabase\config.toml"
	if (-not (Test-Path -LiteralPath $configPath)) {
		return [pscustomobject]$ports
	}

	$apiPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "api" -Key "port"
	if ($apiPort) {
		$ports.api = $apiPort
	}

	$dbPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "db" -Key "port"
	if ($dbPort) {
		$ports.db = $dbPort
	}

	$shadowDbPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "db" -Key "shadow_port"
	if ($shadowDbPort) {
		$ports.shadowDb = $shadowDbPort
	}

	$poolerPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "db.pooler" -Key "port"
	if ($poolerPort) {
		$ports.pooler = $poolerPort
	}

	$studioPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "studio" -Key "port"
	if ($studioPort) {
		$ports.studio = $studioPort
	}

	$inbucketPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "inbucket" -Key "port"
	if ($inbucketPort) {
		$ports.inbucket = $inbucketPort
	}

	$smtpPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "auth.email.smtp" -Key "port"
	if ($smtpPort) {
		$ports.smtp = $smtpPort
	}

	$edgeInspectorPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "edge_runtime" -Key "inspector_port"
	if ($edgeInspectorPort) {
		$ports.edgeInspector = $edgeInspectorPort
	}

	$analyticsPort = Get-TomlSectionIntegerValue -Path $configPath -SectionName "analytics" -Key "port"
	if ($analyticsPort) {
		$ports.analytics = $analyticsPort
	}

	$dotenvPaths = @(
		(Join-Path ([System.IO.Path]::GetFullPath($RepoRoot)) ".env.local"),
		(Join-Path ([System.IO.Path]::GetFullPath($RepoRoot)) ".env")
	)
	$overrideMap = [ordered]@{
		api = "SUITE_SUPABASE_LOCAL_API_PORT"
		db = "SUITE_SUPABASE_LOCAL_DB_PORT"
		shadowDb = "SUITE_SUPABASE_LOCAL_SHADOW_PORT"
		pooler = "SUITE_SUPABASE_LOCAL_POOLER_PORT"
		studio = "SUITE_SUPABASE_LOCAL_STUDIO_PORT"
		inbucket = "SUITE_SUPABASE_LOCAL_INBUCKET_PORT"
		smtp = "SUPABASE_LOCAL_SMTP_PORT"
		analytics = "SUITE_SUPABASE_LOCAL_ANALYTICS_PORT"
	}
	foreach ($portKey in $overrideMap.Keys) {
		foreach ($dotenvPath in $dotenvPaths) {
			$rawOverride = Get-DotEnvStringValue -Path $dotenvPath -Key $overrideMap[$portKey]
			if ([string]::IsNullOrWhiteSpace($rawOverride)) {
				continue
			}

			$parsedOverride = 0
			if ([int]::TryParse($rawOverride, [ref]$parsedOverride) -and $parsedOverride -gt 0) {
				$ports[$portKey] = $parsedOverride
				break
			}
		}
	}

	return [pscustomobject]$ports
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
	$runtimeBootstrapScript = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_RUNTIME_BOOTSTRAP_SCRIPT"
	$dailyRoot = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_DAILY_ROOT"
	$officeExecutablePath = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_OFFICE_EXECUTABLE_PATH"
	$officeKnowledgeRoot = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_OFFICE_KNOWLEDGE_ROOT"
	$officeStateRoot = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_OFFICE_STATE_ROOT"
	$officeBrokerBaseUrl = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_OFFICE_BROKER_BASE_URL"
	$runtimeCoreComposePath = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_RUNTIME_CORE_COMPOSE_PATH"
	$runtimeCoreProjectName = Get-SuiteConfigStringOverride -TomlPath $resolvedTomlPath -Key "SUITE_RUNTIME_CORE_PROJECT_NAME"
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
		[System.IO.Path]::GetFullPath((Get-SuiteStableSuiteRoot))
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
	$resolvedOfficeKnowledgeRoot = if (-not [string]::IsNullOrWhiteSpace($officeKnowledgeRoot)) {
		Resolve-OptionalAbsolutePath -PathValue $officeKnowledgeRoot -RepoRoot $resolvedRepoRoot
	}
	else {
		Resolve-OptionalAbsolutePath -PathValue (Get-SuiteOfficeKnowledgeRoot) -RepoRoot $resolvedRepoRoot
	}
	$resolvedOfficeStateRoot = if (-not [string]::IsNullOrWhiteSpace($officeStateRoot)) {
		Resolve-OptionalAbsolutePath -PathValue $officeStateRoot -RepoRoot $resolvedRepoRoot
	}
	else {
		Resolve-OptionalAbsolutePath -PathValue (Get-SuiteOfficeStateRoot) -RepoRoot $resolvedRepoRoot
	}
	$resolvedOfficeBrokerBaseUrl = if (-not [string]::IsNullOrWhiteSpace($officeBrokerBaseUrl)) {
		[string]$officeBrokerBaseUrl
	}
	else {
		"http://127.0.0.1:57420"
	}
	$resolvedRuntimeCoreComposePath = if (-not [string]::IsNullOrWhiteSpace($runtimeCoreComposePath)) {
		Resolve-OptionalAbsolutePath -PathValue $runtimeCoreComposePath -RepoRoot $resolvedRepoRoot
	}
	else {
		Resolve-OptionalAbsolutePath -PathValue "docker\runtime-core\runtime-core.compose.yml" -RepoRoot $resolvedRepoRoot
	}
	$resolvedRuntimeCoreProjectName = if (-not [string]::IsNullOrWhiteSpace($runtimeCoreProjectName)) {
		[string]$runtimeCoreProjectName
	}
	else {
		"suite-runtime-core"
	}
	$officeLocalConfig = Read-SuiteCompanionAppLocalConfig -CompanionAppId "office"
	if ($officeLocalConfig) {
		$localDailyRoot = @(
			if ($officeLocalConfig.PSObject.Properties.Name -contains "dailyRoot") { [string]$officeLocalConfig.dailyRoot } else { $null }
			if ($officeLocalConfig.PSObject.Properties.Name -contains "rootDirectory") { [string]$officeLocalConfig.rootDirectory } else { $null }
		) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
		if (-not [string]::IsNullOrWhiteSpace($localDailyRoot)) {
			$resolvedDailyRoot = Resolve-OptionalAbsolutePath -PathValue $localDailyRoot -RepoRoot $resolvedRepoRoot
		}

		$localOfficeExecutablePath = if ($officeLocalConfig.PSObject.Properties.Name -contains "executablePath") {
			[string]$officeLocalConfig.executablePath
		}
		else {
			$null
		}
		if (-not [string]::IsNullOrWhiteSpace($localOfficeExecutablePath)) {
			$resolvedOfficeExecutablePath = Resolve-OptionalAbsolutePath -PathValue $localOfficeExecutablePath -RepoRoot $resolvedRepoRoot
		}

		$localSuiteRoot = if ($officeLocalConfig.PSObject.Properties.Name -contains "suiteRoot") {
			[string]$officeLocalConfig.suiteRoot
		}
		else {
			$null
		}
		if (-not [string]::IsNullOrWhiteSpace($localSuiteRoot)) {
			$resolvedStableSuiteRoot = Resolve-OptionalAbsolutePath -PathValue $localSuiteRoot -RepoRoot $resolvedRepoRoot
		}

		$localKnowledgeRoot = @(
			if ($officeLocalConfig.PSObject.Properties.Name -contains "knowledgeLibraryPath") { [string]$officeLocalConfig.knowledgeLibraryPath } else { $null }
			if ($officeLocalConfig.PSObject.Properties.Name -contains "knowledgeRoot") { [string]$officeLocalConfig.knowledgeRoot } else { $null }
		) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
		if (-not [string]::IsNullOrWhiteSpace($localKnowledgeRoot)) {
			$resolvedOfficeKnowledgeRoot = Resolve-OptionalAbsolutePath -PathValue $localKnowledgeRoot -RepoRoot $resolvedRepoRoot
		}

		$localStateRoot = @(
			if ($officeLocalConfig.PSObject.Properties.Name -contains "stateRootPath") { [string]$officeLocalConfig.stateRootPath } else { $null }
			if ($officeLocalConfig.PSObject.Properties.Name -contains "stateRoot") { [string]$officeLocalConfig.stateRoot } else { $null }
		) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
		if (-not [string]::IsNullOrWhiteSpace($localStateRoot)) {
			$resolvedOfficeStateRoot = Resolve-OptionalAbsolutePath -PathValue $localStateRoot -RepoRoot $resolvedRepoRoot
		}

		$localLaunchMode = if ($officeLocalConfig.PSObject.Properties.Name -contains "launchMode") {
			[string]$officeLocalConfig.launchMode
		}
		else {
			$null
		}
		$localLegacyClientRetired = if ($officeLocalConfig.PSObject.Properties.Name -contains "legacyClientRetired") {
			[bool]$officeLocalConfig.legacyClientRetired
		}
		else {
			$false
		}
		if ($localLaunchMode -eq "embedded_shell" -or $localLegacyClientRetired) {
			$resolvedOfficeExecutablePath = $null
		}
	}
	elseif (-not [string]::IsNullOrWhiteSpace($resolvedRepoRoot)) {
		$resolvedStableSuiteRoot = $resolvedRepoRoot
	}

	[pscustomobject]@{
		repoRoot = $resolvedRepoRoot
		stableSuiteRoot = $resolvedStableSuiteRoot
		dailyRoot = $resolvedDailyRoot
		officeExecutablePath = if (-not [string]::IsNullOrWhiteSpace([string]$resolvedOfficeExecutablePath)) { $resolvedOfficeExecutablePath } else { "" }
		officeKnowledgeRoot = $resolvedOfficeKnowledgeRoot
		officeStateRoot = $resolvedOfficeStateRoot
		officeBrokerBaseUrl = $resolvedOfficeBrokerBaseUrl
		runtimeCoreComposePath = $resolvedRuntimeCoreComposePath
		runtimeCoreProjectName = $resolvedRuntimeCoreProjectName
		codexConfigPath = $resolvedTomlPath
		codexConfigPresent = [bool]($resolvedTomlPath -and (Test-Path -LiteralPath $resolvedTomlPath))
		supabaseConfigPath = $resolvedSupabaseConfigPath
		supabaseConfigPresent = [bool]($resolvedSupabaseConfigPath -and (Test-Path -LiteralPath $resolvedSupabaseConfigPath))
		runtimeBootstrapScript = Resolve-OptionalAbsolutePath -PathValue $runtimeBootstrapScript -RepoRoot $resolvedRepoRoot
		watchdogCollectorConfigPath = Resolve-OptionalAbsolutePath -PathValue $filesystemCollectorConfig -RepoRoot $resolvedRepoRoot
		watchdogCollectorStartupCheckScript = Resolve-OptionalAbsolutePath -PathValue $filesystemCheckScript -RepoRoot $resolvedRepoRoot
		watchdogAutoCadCollectorConfigPath = Resolve-OptionalAbsolutePath -PathValue $autocadCollectorConfig -RepoRoot $resolvedRepoRoot
		watchdogAutoCadStatePath = Resolve-OptionalAbsolutePath -PathValue $autocadStatePath -RepoRoot $resolvedRepoRoot
		watchdogAutoCadPluginBundleRoot = Resolve-OptionalAbsolutePath -PathValue $autocadPluginBundleRoot -RepoRoot $resolvedRepoRoot
		watchdogAutoCadStartupCheckScript = Resolve-OptionalAbsolutePath -PathValue $autocadStartupCheckScript -RepoRoot $resolvedRepoRoot
		watchdogBackendStartupCheckScript = Resolve-OptionalAbsolutePath -PathValue $watchdogBackendCheckScript -RepoRoot $resolvedRepoRoot
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
		backendLogPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.backendLogPath)) { [string]$runtime.backendLogPath } else { $null }
		runtimeLauncherLogPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.runtimeLauncherLogPath)) { [string]$runtime.runtimeLauncherLogPath } else { $null }
		runtimeShellLogPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.runtimeShellLogPath)) { [string]$runtime.runtimeShellLogPath } else { $null }
		officeBrokerLogPath = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.officeBrokerLogPath)) { [string]$runtime.officeBrokerLogPath } else { $null }
		filesystemCollectorLogDir = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.filesystemCollectorLogDir)) { [string]$runtime.filesystemCollectorLogDir } else { $null }
		autocadCollectorLogDir = if ($runtime -and -not [string]::IsNullOrWhiteSpace([string]$runtime.autocadCollectorLogDir)) { [string]$runtime.autocadCollectorLogDir } else { $null }
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
	if (-not [string]::IsNullOrWhiteSpace([string]$env:USERPROFILE)) {
		return Join-Path $env:USERPROFILE "Documents\GitHub"
	}

	if (
		-not [string]::IsNullOrWhiteSpace([string]$env:HOMEDRIVE) -and
		-not [string]::IsNullOrWhiteSpace([string]$env:HOMEPATH)
	) {
		return Join-Path (Join-Path $env:HOMEDRIVE $env:HOMEPATH) "Documents\GitHub"
	}

	return "C:\Users\Public\Documents\GitHub"
}

function Get-SuiteStableSuiteRoot {
	return Join-Path (Get-SuiteStableDevRoot) "Suite"
}

function Get-SuiteStableDailyRoot {
	return Join-Path (Get-SuiteStableDevRoot) "Office"
}

function Get-SuiteStableOfficeExecutableCandidates {
	return @()
}

function Get-SuiteLegacyDailyRoot {
	if (-not [string]::IsNullOrWhiteSpace([string]$env:USERPROFILE)) {
		return Join-Path $env:USERPROFILE "OneDrive\Desktop\Daily"
	}

	return $null
}

function Get-SuiteDropboxWorkspaceRoot {
	if (-not [string]::IsNullOrWhiteSpace([string]$env:USERPROFILE)) {
		return Join-Path $env:USERPROFILE "Dropbox\SuiteWorkspace"
	}

	return $null
}

function Get-SuiteOfficeWorkspaceRoot {
	$dropboxWorkspaceRoot = Get-SuiteDropboxWorkspaceRoot
	if ([string]::IsNullOrWhiteSpace($dropboxWorkspaceRoot)) {
		return $null
	}

	return Join-Path $dropboxWorkspaceRoot "Office"
}

function Get-SuiteOfficeKnowledgeRoot {
	$officeWorkspaceRoot = Get-SuiteOfficeWorkspaceRoot
	if ([string]::IsNullOrWhiteSpace($officeWorkspaceRoot)) {
		return $null
	}

	return Join-Path $officeWorkspaceRoot "Knowledge"
}

function Get-SuiteOfficeStateRoot {
	$officeWorkspaceRoot = Get-SuiteOfficeWorkspaceRoot
	if ([string]::IsNullOrWhiteSpace($officeWorkspaceRoot)) {
		return $null
	}

	return Join-Path $officeWorkspaceRoot "State"
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

function Remove-SuiteScheduledTaskIfPresent {
	param([string]$TaskName)

	if ([string]::IsNullOrWhiteSpace($TaskName)) {
		return $false
	}

	try {
		$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
		if ($null -eq $task) {
			return $false
		}

		Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop | Out-Null
		return $true
	}
	catch {
		return $false
	}
}

function Remove-SuiteSupabaseRemotePreflightStartup {
	param([string]$TaskName = "SuiteSupabaseRemotePreflight")

	$removedScheduledTask = Remove-SuiteScheduledTaskIfPresent -TaskName $TaskName
	$removedRunKey = Remove-RunKeyValue -Name $TaskName

	[pscustomobject]@{
		taskName = $TaskName
		removedScheduledTask = $removedScheduledTask
		removedRunKey = $removedRunKey
		removed = ($removedScheduledTask -or $removedRunKey)
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
			$localBrokerConfig = if ($localConfig -and $localConfig.PSObject.Properties.Name -contains "broker") {
				$localConfig.broker
			}
			else {
				$null
			}
			$stableDailyRoot = Get-SuiteStableDailyRoot
			$legacyDailyRoot = Get-SuiteLegacyDailyRoot

			$configuredExecutablePath = if ($localConfig -and $localConfig.PSObject.Properties.Name -contains "executablePath" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.executablePath)) {
				[string]$localConfig.executablePath
			}
			else {
				Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_OFFICE_EXECUTABLE_PATH"
			}
			$configuredRootDirectory = if ($localConfig -and $localConfig.PSObject.Properties.Name -contains "rootDirectory" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.rootDirectory)) {
				[string]$localConfig.rootDirectory
			}
			else {
				Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_DAILY_ROOT"
			}
			$configuredKnowledgeRoot = if ($localConfig -and $localConfig.PSObject.Properties.Name -contains "knowledgeLibraryPath" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.knowledgeLibraryPath)) {
				[string]$localConfig.knowledgeLibraryPath
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "knowledgeRoot" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.knowledgeRoot)) {
				[string]$localConfig.knowledgeRoot
			}
			else {
				Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_OFFICE_KNOWLEDGE_ROOT"
			}
			$configuredStateRoot = if ($localConfig -and $localConfig.PSObject.Properties.Name -contains "stateRootPath" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.stateRootPath)) {
				[string]$localConfig.stateRootPath
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "stateRoot" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.stateRoot)) {
				[string]$localConfig.stateRoot
			}
			else {
				Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_OFFICE_STATE_ROOT"
			}
			$configuredBrokerBaseUrl = if ($localBrokerConfig -and -not [string]::IsNullOrWhiteSpace([string]$localBrokerConfig.baseUrl)) {
				[string]$localBrokerConfig.baseUrl
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "brokerBaseUrl" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.brokerBaseUrl)) {
				[string]$localConfig.brokerBaseUrl
			}
			elseif (-not [string]::IsNullOrWhiteSpace([string](Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_OFFICE_BROKER_BASE_URL"))) {
				[string](Get-SuiteConfigStringOverride -TomlPath $TomlPath -Key "SUITE_OFFICE_BROKER_BASE_URL")
			}
			else {
				"http://127.0.0.1:57420"
			}
			$configuredBrokerPublishPath = if ($localBrokerConfig -and -not [string]::IsNullOrWhiteSpace([string]$localBrokerConfig.publishPath)) {
				[string]$localBrokerConfig.publishPath
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "brokerPublishPath" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.brokerPublishPath)) {
				[string]$localConfig.brokerPublishPath
			}
			else {
				$null
			}
			$configuredBrokerHealthPath = if ($localBrokerConfig -and -not [string]::IsNullOrWhiteSpace([string]$localBrokerConfig.healthPath)) {
				[string]$localBrokerConfig.healthPath
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "brokerHealthPath" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.brokerHealthPath)) {
				[string]$localConfig.brokerHealthPath
			}
			else {
				"/health"
			}
			$configuredBrokerStatePath = if ($localBrokerConfig -and -not [string]::IsNullOrWhiteSpace([string]$localBrokerConfig.statePath)) {
				[string]$localBrokerConfig.statePath
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "brokerStatePath" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.brokerStatePath)) {
				[string]$localConfig.brokerStatePath
			}
			else {
				"/state"
			}
			$brokerEnabled = if ($localBrokerConfig -and $localBrokerConfig.PSObject.Properties.Name -contains "enabled") {
				[bool]$localBrokerConfig.enabled
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "brokerEnabled") {
				[bool]$localConfig.brokerEnabled
			}
			else {
				$true
			}
			$brokerPrefixes = if ($localBrokerConfig -and $localBrokerConfig.PSObject.Properties.Name -contains "prefixes" -and $localBrokerConfig.prefixes) {
				@($localBrokerConfig.prefixes | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
			}
			elseif ($localConfig -and $localConfig.PSObject.Properties.Name -contains "brokerPrefixes" -and $localConfig.brokerPrefixes) {
				@($localConfig.brokerPrefixes | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
			}
			else {
				@("", "/api", "/api/office", "/office")
			}

			$configSource = if ($localConfig -and (
				($localConfig.PSObject.Properties.Name -contains "executablePath" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.executablePath)) -or
				($localConfig.PSObject.Properties.Name -contains "rootDirectory" -and -not [string]::IsNullOrWhiteSpace([string]$localConfig.rootDirectory)) -or
				($localConfig.PSObject.Properties.Name -contains "brokerEnabled")
			)) {
				"local_config"
			}
			elseif (-not [string]::IsNullOrWhiteSpace($configuredExecutablePath) -or -not [string]::IsNullOrWhiteSpace($configuredRootDirectory)) {
				"env_or_toml_override"
			}
			else {
				"broker_only"
			}

			$executablePath = if (-not [string]::IsNullOrWhiteSpace($configuredExecutablePath)) {
				$configuredExecutablePath
			}
			else {
				$null
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
			$resolvedKnowledgeRoot = if (-not [string]::IsNullOrWhiteSpace($configuredKnowledgeRoot)) {
				Resolve-OptionalAbsolutePath -PathValue $configuredKnowledgeRoot -RepoRoot $RepoRoot
			}
			else {
				Resolve-OptionalAbsolutePath -PathValue (Get-SuiteOfficeKnowledgeRoot) -RepoRoot $RepoRoot
			}
			$resolvedStateRoot = if (-not [string]::IsNullOrWhiteSpace($configuredStateRoot)) {
				Resolve-OptionalAbsolutePath -PathValue $configuredStateRoot -RepoRoot $RepoRoot
			}
			else {
				Resolve-OptionalAbsolutePath -PathValue (Get-SuiteOfficeStateRoot) -RepoRoot $RepoRoot
			}
			$timeoutSeconds = 90
			$resolvedBrokerPublishPath = if (-not [string]::IsNullOrWhiteSpace($configuredBrokerPublishPath)) {
				Resolve-OptionalAbsolutePath -PathValue $configuredBrokerPublishPath -RepoRoot $RepoRoot
			}
			else {
				$null
			}
			$brokerDetails = [ordered]@{
				enabled = [bool]$brokerEnabled
				baseUrl = [string]$configuredBrokerBaseUrl
				publishPath = $resolvedBrokerPublishPath
				healthPath = [string]$configuredBrokerHealthPath
				statePath = [string]$configuredBrokerStatePath
				prefixes = @($brokerPrefixes)
			}

			return [pscustomobject]@{
				id = "office"
				title = "Office"
				enabled = $true
				executablePath = $resolvedExecutablePath
				workingDirectory = $workingDirectory
				rootDirectory = $rootDirectory
				knowledgeLibraryPath = $resolvedKnowledgeRoot
				stateRootPath = $resolvedStateRoot
				configSource = $configSource
				configPath = Get-SuiteCompanionAppConfigPath -CompanionAppId $normalizedId
				launchAfterRuntimeReady = $false
				timeoutSeconds = $timeoutSeconds
				launchMode = "embedded_shell"
				processName = $null
				legacyClientRetired = $true
				brokerBaseUrl = [string]$configuredBrokerBaseUrl
				brokerPublishPath = $resolvedBrokerPublishPath
				brokerHealthPath = [string]$configuredBrokerHealthPath
				brokerStatePath = [string]$configuredBrokerStatePath
				brokerEnabled = [bool]$brokerEnabled
				broker = [pscustomobject]$brokerDetails
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
	$configExecutablePath = if ($Config.PSObject.Properties.Name -contains "executablePath") {
		[string]$Config.executablePath
	}
	else {
		$null
	}
	$expectedPath = if (-not [string]::IsNullOrWhiteSpace($configExecutablePath)) {
		$configExecutablePath.ToLowerInvariant()
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
	$configExecutablePath = if ($config.PSObject.Properties.Name -contains "executablePath") {
		[string]$config.executablePath
	}
	else {
		$null
	}
	$executableFound = -not [string]::IsNullOrWhiteSpace($configExecutablePath) -and (Test-Path -LiteralPath $configExecutablePath)
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
		executablePath = $configExecutablePath
		executableFound = $executableFound
		workingDirectory = [string]$config.workingDirectory
		rootDirectory = [string]$config.rootDirectory
		configSource = if ($config.PSObject.Properties.Name -contains "configSource") { [string]$config.configSource } else { $null }
		configPath = if ($config.PSObject.Properties.Name -contains "configPath") { [string]$config.configPath } else { $null }
		launchAfterRuntimeReady = [bool]$config.launchAfterRuntimeReady
		timeoutSeconds = [int]$config.timeoutSeconds
		launchMode = [string]$config.launchMode
		brokerBaseUrl = if ($config.PSObject.Properties.Name -contains "brokerBaseUrl") { [string]$config.brokerBaseUrl } else { "http://127.0.0.1:57420" }
		brokerPublishPath = if ($config.PSObject.Properties.Name -contains "brokerPublishPath") { [string]$config.brokerPublishPath } else { $null }
		brokerHealthPath = if ($config.PSObject.Properties.Name -contains "brokerHealthPath") { [string]$config.brokerHealthPath } else { "/health" }
		brokerStatePath = if ($config.PSObject.Properties.Name -contains "brokerStatePath") { [string]$config.brokerStatePath } else { "/state" }
		brokerEnabled = if ($config.PSObject.Properties.Name -contains "brokerEnabled") { [bool]$config.brokerEnabled } else { $true }
		broker = if ($config.PSObject.Properties.Name -contains "broker" -and $config.broker) {
			$config.broker
		}
		else {
			[pscustomobject]@{
				enabled = if ($config.PSObject.Properties.Name -contains "brokerEnabled") { [bool]$config.brokerEnabled } else { $true }
				baseUrl = if ($config.PSObject.Properties.Name -contains "brokerBaseUrl") { [string]$config.brokerBaseUrl } else { "http://127.0.0.1:57420" }
				publishPath = if ($config.PSObject.Properties.Name -contains "brokerPublishPath") { [string]$config.brokerPublishPath } else { $null }
				healthPath = if ($config.PSObject.Properties.Name -contains "brokerHealthPath") { [string]$config.brokerHealthPath } else { "/health" }
				statePath = if ($config.PSObject.Properties.Name -contains "brokerStatePath") { [string]$config.brokerStatePath } else { "/state" }
				prefixes = @("", "/api", "/api/office", "/office")
			}
		}
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

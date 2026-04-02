Set-StrictMode -Version Latest

function Get-SuiteSha256Hex {
	param([Parameter(Mandatory = $true)][string]$Value)

	$bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
	$hashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
	return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
}

function Get-SuiteFileSha256Hex {
	param([Parameter(Mandatory = $true)][string]$Path)

	if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
		return $null
	}

	$sha = [System.Security.Cryptography.SHA256]::Create()
	try {
		$stream = [System.IO.File]::OpenRead($Path)
		try {
			$hashBytes = $sha.ComputeHash($stream)
			return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
		}
		finally {
			$stream.Dispose()
		}
	}
	finally {
		$sha.Dispose()
	}
}

function Read-SuiteEnvFileValues {
	param([string]$Path)

	$values = [ordered]@{}
	if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
		return $values
	}

	foreach ($line in Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue) {
		if ([string]::IsNullOrWhiteSpace($line)) {
			continue
		}

		$trimmed = $line.Trim()
		if ($trimmed.StartsWith("#")) {
			continue
		}

		$separatorIndex = $trimmed.IndexOf("=")
		if ($separatorIndex -lt 1) {
			continue
		}

		$key = $trimmed.Substring(0, $separatorIndex).Trim()
		if ([string]::IsNullOrWhiteSpace($key)) {
			continue
		}

		$value = $trimmed.Substring($separatorIndex + 1).Trim()
		if ($value.Length -ge 2) {
			$leading = $value.Substring(0, 1)
			$trailing = $value.Substring($value.Length - 1, 1)
			if (($leading -eq '"' -and $trailing -eq '"') -or ($leading -eq "'" -and $trailing -eq "'")) {
				$value = $value.Substring(1, $value.Length - 2)
			}
		}

		$values[$key] = $value
	}

	return $values
}

function Get-SuiteMergedEnvValues {
	param([Parameter(Mandatory = $true)][string]$RepoRoot)

	$merged = [ordered]@{}
	foreach ($path in @(
		(Join-Path $RepoRoot ".env"),
		(Join-Path $RepoRoot ".env.local")
	)) {
		$current = Read-SuiteEnvFileValues -Path $path
		foreach ($entry in $current.GetEnumerator()) {
			$merged[$entry.Key] = [string]$entry.Value
		}
	}

	return $merged
}

function Get-SuiteEnvFingerprintSummary {
	param([Parameter(Mandatory = $true)][string]$RepoRoot)

	$envPath = Join-Path $RepoRoot ".env"
	$envLocalPath = Join-Path $RepoRoot ".env.local"
	$requiredEnvVars = @(
		"OPENAI_API_KEY",
		"HF_TOKEN",
		"GITHUB_PERSONAL_ACCESS_TOKEN",
		"SUPABASE_URL",
		"SUPABASE_SERVICE_ROLE_KEY",
		"SUPABASE_REMOTE_PROJECT_REF",
		"VITE_DEV_ADMIN_EMAIL",
		"VITE_DEV_ADMIN_EMAILS"
	)

	[pscustomobject]@{
		env = [pscustomobject]@{
			path = $envPath
			exists = (Test-Path -LiteralPath $envPath -PathType Leaf)
			sha256 = Get-SuiteFileSha256Hex -Path $envPath
		}
		envLocal = [pscustomobject]@{
			path = $envLocalPath
			exists = (Test-Path -LiteralPath $envLocalPath -PathType Leaf)
			sha256 = Get-SuiteFileSha256Hex -Path $envLocalPath
		}
		userEnv = @(
			foreach ($name in $requiredEnvVars) {
				$userValue = [Environment]::GetEnvironmentVariable($name, "User")
				$processValue = [Environment]::GetEnvironmentVariable($name, "Process")
				$effectiveValue = if (-not [string]::IsNullOrWhiteSpace($processValue)) { $processValue } else { $userValue }
				[pscustomobject]@{
					name = $name
					present = (-not [string]::IsNullOrWhiteSpace($effectiveValue))
					scope = if (-not [string]::IsNullOrWhiteSpace($processValue)) { "process" } elseif (-not [string]::IsNullOrWhiteSpace($userValue)) { "user" } else { "missing" }
					sha256 = if (-not [string]::IsNullOrWhiteSpace($effectiveValue)) { Get-SuiteSha256Hex -Value $effectiveValue } else { $null }
				}
			}
		)
	}
}

function Get-SuiteCodexMcpInventory {
	param([string]$CodexConfigPath)

	if ([string]::IsNullOrWhiteSpace($CodexConfigPath) -or -not (Test-Path -LiteralPath $CodexConfigPath -PathType Leaf)) {
		return @()
	}

	$serverNames = New-Object System.Collections.Generic.List[string]
	foreach ($line in Get-Content -LiteralPath $CodexConfigPath -ErrorAction SilentlyContinue) {
		if ($line -match '^\s*\[mcp_servers\.([^\]]+)\]\s*$') {
			$name = [string]$matches[1]
			if (-not [string]::IsNullOrWhiteSpace($name) -and -not $serverNames.Contains($name)) {
				$serverNames.Add($name) | Out-Null
			}
		}
	}

	return @(
		$serverNames | ForEach-Object {
			[pscustomobject]@{
				name = [string]$_
			}
		}
	)
}

function Get-SuiteSkillInventory {
	param([string]$SkillsRoot = (Join-Path $env:USERPROFILE ".codex\skills"))

	if ([string]::IsNullOrWhiteSpace($SkillsRoot) -or -not (Test-Path -LiteralPath $SkillsRoot -PathType Container)) {
		return @()
	}

	return @(
		Get-ChildItem -LiteralPath $SkillsRoot -Directory -ErrorAction SilentlyContinue |
			Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") -PathType Leaf } |
			Sort-Object Name |
			ForEach-Object {
				[pscustomobject]@{
					name = $_.Name
					path = $_.FullName
				}
			}
	)
}

function Read-SuiteJsonFileObject {
	param([string]$Path)

	if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
		return $null
	}

	try {
		return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
	}
	catch {
		return $null
	}
}

function Get-SuiteStartupOwnerSummary {
	param([Parameter(Mandatory = $true)][string]$RepoRoot)

	$resolvedRepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
	$taskName = "SuiteRuntimeBootstrap"
	$preflightTaskName = "SuiteSupabaseRemotePreflight"
	$launcherScript = Join-Path $resolvedRepoRoot "scripts\launch-suite-runtime-control.vbs"
	$scheduledTask = $null
	try {
		$scheduledTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
	}
	catch {
		$scheduledTask = $null
	}

	$runValue = $null
	try {
		$runValue = Get-ItemPropertyValue -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name $taskName -ErrorAction Stop
	}
	catch {
		$runValue = $null
	}

	$preflightScheduledTask = $null
	try {
		$preflightScheduledTask = Get-ScheduledTask -TaskName $preflightTaskName -ErrorAction Stop
	}
	catch {
		$preflightScheduledTask = $null
	}

	$preflightRunValue = $null
	try {
		$preflightRunValue = Get-ItemPropertyValue -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name $preflightTaskName -ErrorAction Stop
	}
	catch {
		$preflightRunValue = $null
	}

	$scheduledTaskMatches = $false
	if ($scheduledTask) {
		foreach ($action in @($scheduledTask.Actions)) {
			$execute = [string]$action.Execute
			$arguments = [string]$action.Arguments
			if ($execute -match "(?i)wscript(?:\.exe)?$" -and $arguments -like "*$launcherScript*") {
				$scheduledTaskMatches = $true
				break
			}
		}
	}

	$runKeyMatches = (-not [string]::IsNullOrWhiteSpace([string]$runValue)) -and ([string]$runValue -like "*launch-suite-runtime-control.vbs*")
	$manifest = Read-SuiteRuntimeStartupManifest
	$owner = if ($scheduledTaskMatches) {
		"scheduled_task"
	}
	elseif ($runKeyMatches) {
		"hkcu_run"
	}
	else {
		"none"
	}

	$secondaryOwners = @()
	if ($preflightScheduledTask) {
		$secondaryOwners += [pscustomobject]@{
			name = $preflightTaskName
			owner = "scheduled_task"
		}
	}
	elseif (-not [string]::IsNullOrWhiteSpace([string]$preflightRunValue)) {
		$secondaryOwners += [pscustomobject]@{
			name = $preflightTaskName
			owner = "hkcu_run"
		}
	}

	$status = if ($owner -eq "none") {
		if ($secondaryOwners.Count -gt 0) { "drift" } else { "missing" }
	}
	elseif ($secondaryOwners.Count -gt 0) {
		"drift"
	}
	else {
		"aligned"
	}

	$detail = switch ($owner) {
		"scheduled_task" { "Windows logon startup is owned by the Suite runtime scheduled task login orchestrator." }
		"hkcu_run" { "Windows logon startup is using the hidden HKCU Run login orchestrator fallback." }
		default { "No Suite runtime startup owner is registered for Windows sign-in." }
	}

	if ($secondaryOwners.Count -gt 0) {
		$detail = "{0} Extra startup owners still exist: {1}." -f $detail.TrimEnd('.'), ([string]::Join(", ", @($secondaryOwners | ForEach-Object { "{0} ({1})" -f $_.name, $_.owner })))
	}

	return [pscustomobject]@{
		owner = $owner
		status = $status
		detail = $detail
		scheduledTaskName = $taskName
		scheduledTaskPresent = ($null -ne $scheduledTask)
		scheduledTaskMatches = $scheduledTaskMatches
		runKeyPresent = (-not [string]::IsNullOrWhiteSpace([string]$runValue))
		runKeyMatches = $runKeyMatches
		launcherPath = $launcherScript
		secondaryOwners = @($secondaryOwners)
		preferredOwner = if ($manifest -and -not [string]::IsNullOrWhiteSpace([string]$manifest.preferredOwner)) { [string]$manifest.preferredOwner } else { "scheduled_task" }
		startupMode = if ($manifest -and -not [string]::IsNullOrWhiteSpace([string]$manifest.startupMode)) { [string]$manifest.startupMode } else { "login_orchestrator" }
		fallbackReason = if ($manifest -and -not [string]::IsNullOrWhiteSpace([string]$manifest.fallbackReason)) { [string]$manifest.fallbackReason } else { $null }
		manifestPath = Get-SuiteRuntimeStartupManifestPath
		manifestPresent = ($null -ne $manifest)
	}
}

function Get-SuiteRuntimeShellSummary {
	param(
		[Parameter(Mandatory = $true)][string]$RepoRoot,
		[ValidateRange(5, 120)][int]$HealthyHeartbeatSeconds = 20,
		[ValidateRange(15, 300)][int]$StartingHeartbeatSeconds = 60
	)

	$paths = Get-SuiteRuntimeShellPaths -RepoRoot $RepoRoot
	$primaryState = Read-SuiteJsonFileObject -Path $paths.PrimaryStatePath
	$processId = $null
	if ($primaryState -and $primaryState.PSObject.Properties.Name -contains "processId" -and $null -ne $primaryState.processId) {
		try {
			$processId = [int]$primaryState.processId
		}
		catch {
			$processId = $null
		}
	}

	$process = $null
	$processRunning = $false
	$processResponding = $false
	$mainWindowHandle = [int64]0
	$mainWindowTitle = $null
	$processPath = $null
	if ($processId) {
		try {
			$process = Get-Process -Id $processId -ErrorAction Stop
			$processRunning = -not $process.HasExited
			$processResponding = [bool]$process.Responding
			$mainWindowHandle = [int64]$process.MainWindowHandle
			$mainWindowTitle = [string]$process.MainWindowTitle
			$processPath = [string]$process.Path
		}
		catch {
			$process = $null
			$processRunning = $false
		}
	}

	$phase = if (
		$primaryState -and
		$primaryState.PSObject.Properties.Name -contains "phase" -and
		-not [string]::IsNullOrWhiteSpace([string]$primaryState.phase)
	) {
		([string]$primaryState.phase).Trim().ToLowerInvariant()
	}
	else {
		$null
	}
	$statusMessage = if (
		$primaryState -and
		$primaryState.PSObject.Properties.Name -contains "statusMessage" -and
		-not [string]::IsNullOrWhiteSpace([string]$primaryState.statusMessage)
	) {
		[string]$primaryState.statusMessage
	}
	else {
		$null
	}

	$lastHeartbeatText = if (
		$primaryState -and
		$primaryState.PSObject.Properties.Name -contains "lastHeartbeat" -and
		-not [string]::IsNullOrWhiteSpace([string]$primaryState.lastHeartbeat)
	) {
		[string]$primaryState.lastHeartbeat
	}
	elseif (
		$primaryState -and
		$primaryState.PSObject.Properties.Name -contains "updatedAt" -and
		-not [string]::IsNullOrWhiteSpace([string]$primaryState.updatedAt)
	) {
		[string]$primaryState.updatedAt
	}
	else {
		$null
	}
	$lastHeartbeat = $null
	if (-not [string]::IsNullOrWhiteSpace($lastHeartbeatText)) {
		$parsedLastHeartbeat = [DateTimeOffset]::MinValue
		if ([DateTimeOffset]::TryParse($lastHeartbeatText, [ref]$parsedLastHeartbeat)) {
			$lastHeartbeat = $parsedLastHeartbeat
		}
	}

	$heartbeatAgeSeconds = $null
	if ($lastHeartbeat) {
		$heartbeatAgeSeconds = [int][Math]::Max(0, ((Get-Date) - $lastHeartbeat.LocalDateTime).TotalSeconds)
	}

	$startedAt = $null
	if (
		$primaryState -and
		$primaryState.PSObject.Properties.Name -contains "startedAt" -and
		-not [string]::IsNullOrWhiteSpace([string]$primaryState.startedAt)
	) {
		$parsedStartedAt = [DateTimeOffset]::MinValue
		if ([DateTimeOffset]::TryParse([string]$primaryState.startedAt, [ref]$parsedStartedAt)) {
			$startedAt = $parsedStartedAt
		}
	}

	$updatedAt = $null
	if (
		$primaryState -and
		$primaryState.PSObject.Properties.Name -contains "updatedAt" -and
		-not [string]::IsNullOrWhiteSpace([string]$primaryState.updatedAt)
	) {
		$parsedUpdatedAt = [DateTimeOffset]::MinValue
		if ([DateTimeOffset]::TryParse([string]$primaryState.updatedAt, [ref]$parsedUpdatedAt)) {
			$updatedAt = $parsedUpdatedAt
		}
	}

	$stateActivatable = [bool](
		$primaryState -and
		$primaryState.PSObject.Properties.Name -contains "activatable" -and
		$primaryState.activatable
	)
	$windowDetected = $processRunning -and $mainWindowHandle -ne 0
	$activatable = $windowDetected -and ($stateActivatable -or $phase -in @("shown", "ui_ready"))

	$status = "missing"
	$detail = "No primary shell state was recorded for this workstation runtime."
	if ($primaryState -and -not $processRunning) {
		$status = "stale"
		$detail = "Primary shell state points to a process that is no longer running."
	}
	elseif ($processRunning -and $windowDetected -and $phase -in @("shown", "ui_ready") -and ($null -eq $heartbeatAgeSeconds -or $heartbeatAgeSeconds -le $HealthyHeartbeatSeconds)) {
		$status = "healthy"
		$detail = if ($phase -eq "ui_ready") {
			"Shared shell is visible and its embedded UI is ready."
		}
		else {
			"Shared shell is visible and finishing its UI warm-up."
		}
	}
	elseif ($processRunning -and $phase -in @("starting", "form_constructing", "form_created") -and ($null -eq $heartbeatAgeSeconds -or $heartbeatAgeSeconds -le $StartingHeartbeatSeconds)) {
		$status = "starting"
		$detail = "Shared shell is still initializing."
	}
	elseif ($processRunning -and $windowDetected -and ($null -eq $heartbeatAgeSeconds -or $heartbeatAgeSeconds -le $StartingHeartbeatSeconds)) {
		$status = "starting"
		$detail = "Shared shell window exists but has not reported a ready UI heartbeat yet."
	}
	elseif ($processRunning) {
		$status = "stale"
		$detail = if ($phase -in @("shown", "ui_ready")) {
			"Shell reported a visible phase, but Windows does not expose an activatable top-level window."
		}
		elseif ($null -ne $heartbeatAgeSeconds -and $heartbeatAgeSeconds -gt $StartingHeartbeatSeconds) {
			"Shell heartbeat is stale and the launcher should replace this instance."
		}
		else {
			"Shell process is running but it does not look activatable."
		}
	}

	[pscustomobject]@{
		status = $status
		present = ($null -ne $primaryState)
		processId = $processId
		processRunning = $processRunning
		processResponding = $processResponding
		processPath = $processPath
		phase = $phase
		statusMessage = $statusMessage
		activatable = $activatable
		stateActivatable = $stateActivatable
		windowDetected = $windowDetected
		mainWindowHandle = $mainWindowHandle
		mainWindowTitle = $mainWindowTitle
		primaryStatePath = $paths.PrimaryStatePath
		lockPath = $paths.LockPath
		activationRequestPath = $paths.ActivationRequestPath
		lastHeartbeat = if ($lastHeartbeat) { $lastHeartbeat.ToString("o") } else { $null }
		heartbeatAgeSeconds = $heartbeatAgeSeconds
		startedAt = if ($startedAt) { $startedAt.ToString("o") } else { $null }
		updatedAt = if ($updatedAt) { $updatedAt.ToString("o") } else { $null }
		stale = ($status -eq "stale")
		healthy = ($status -eq "healthy")
		detail = $detail
	}
}

function Get-SuiteEnvDriftSummary {
	param(
		[Parameter(Mandatory = $true)][string]$RepoRoot,
		[string]$MirroredManifestPath = (Join-Path $env:USERPROFILE "Dropbox\SuiteLocalStateMirror\env-fingerprint-manifest.json")
	)

	$current = Get-SuiteEnvFingerprintSummary -RepoRoot $RepoRoot
	$mirrored = $null
	if (-not [string]::IsNullOrWhiteSpace($MirroredManifestPath) -and (Test-Path -LiteralPath $MirroredManifestPath -PathType Leaf)) {
		try {
			$mirrored = Get-Content -LiteralPath $MirroredManifestPath -Raw | ConvertFrom-Json
		}
		catch {
			$mirrored = $null
		}
	}

	$fileDrift = @()
	foreach ($entry in @(
		[pscustomobject]@{ name = ".env"; current = $current.env; mirrored = if ($mirrored) { $mirrored.env } else { $null } },
		[pscustomobject]@{ name = ".env.local"; current = $current.envLocal; mirrored = if ($mirrored) { $mirrored.envLocal } else { $null } }
	)) {
		$currentSha = if ($entry.current) { [string]$entry.current.sha256 } else { $null }
		$mirroredSha = if ($entry.mirrored) { [string]$entry.mirrored.sha256 } else { $null }
		$fileDrift += [pscustomobject]@{
			name = $entry.name
			currentSha256 = $currentSha
			mirroredSha256 = $mirroredSha
			drifted = (-not [string]::IsNullOrWhiteSpace($mirroredSha)) -and ($currentSha -ne $mirroredSha)
		}
	}

	$userEnvDrift = @(
		foreach ($currentEntry in @($current.userEnv)) {
			$mirroredEntry = if ($mirrored -and $mirrored.userEnv) {
				@($mirrored.userEnv | Where-Object { [string]$_.name -eq [string]$currentEntry.name }) | Select-Object -First 1
			}
			else {
				$null
			}

			$currentSha = [string]$currentEntry.sha256
			$mirroredSha = if ($mirroredEntry) { [string]$mirroredEntry.sha256 } else { $null }
			[pscustomobject]@{
				name = [string]$currentEntry.name
				present = [bool]$currentEntry.present
				scope = [string]$currentEntry.scope
				currentSha256 = $currentSha
				mirroredSha256 = $mirroredSha
				drifted = (-not [string]::IsNullOrWhiteSpace($mirroredSha)) -and ($currentSha -ne $mirroredSha)
			}
		}
	)

	$driftedFiles = @($fileDrift | Where-Object { $_.drifted })
	$driftedUserEnv = @($userEnvDrift | Where-Object { $_.drifted })
	$missingUserEnv = @($userEnvDrift | Where-Object { -not $_.present })

	return [pscustomobject]@{
		current = $current
		mirroredManifestPath = if ($mirrored) { $MirroredManifestPath } else { $null }
		files = $fileDrift
		userEnv = $userEnvDrift
		summary = [pscustomobject]@{
			driftedFileCount = $driftedFiles.Count
			driftedUserEnvCount = $driftedUserEnv.Count
			missingUserEnvCount = $missingUserEnv.Count
			overall = if ($driftedFiles.Count -gt 0 -or $driftedUserEnv.Count -gt 0) {
				"drift"
			}
			elseif ($missingUserEnv.Count -gt 0) {
				"missing"
			}
			else {
				"aligned"
			}
		}
	}
}

function Test-SuiteAdminRoleFromUser {
	param($User)

	if ($null -eq $User) {
		return $false
	}

	$appMetadata = $User.app_metadata
	if ($null -eq $appMetadata) {
		return $false
	}

	$role = [string]$appMetadata.role
	if ($role.Trim().ToLowerInvariant() -eq "admin") {
		return $true
	}

	$roles = @($appMetadata.roles)
	foreach ($entry in $roles) {
		if ([string]$entry -and ([string]$entry).Trim().ToLowerInvariant() -eq "admin") {
			return $true
		}
	}

	return $false
}

function Get-SuiteExpectedAdminEmails {
	param([Parameter(Mandatory = $true)][string]$RepoRoot)

	$merged = Get-SuiteMergedEnvValues -RepoRoot $RepoRoot
	$emails = New-Object System.Collections.Generic.List[string]

	foreach ($value in @(
		[string]$merged["VITE_DEV_ADMIN_EMAIL"],
		[string]$merged["VITE_DEV_ADMIN_EMAILS"]
	)) {
		if ([string]::IsNullOrWhiteSpace($value)) {
			continue
		}

		foreach ($segment in ($value -split ",")) {
			$email = [string]$segment
			if ([string]::IsNullOrWhiteSpace($email)) {
				continue
			}

			$normalized = $email.Trim().ToLowerInvariant()
			if ($normalized -eq "your-email@example.com") {
				continue
			}

			if (-not $emails.Contains($normalized)) {
				$emails.Add($normalized) | Out-Null
			}
		}
	}

	return @($emails.ToArray())
}

function Get-SuiteSupabaseAdminContinuityProbe {
	param(
		[Parameter(Mandatory = $true)][string]$Label,
		[string]$Url,
		[string]$ServiceRoleKey,
		[string[]]$ExpectedEmails
	)

	$trimmedUrl = [string]$Url
	$trimmedKey = [string]$ServiceRoleKey
	$expected = @($ExpectedEmails | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

	if ([string]::IsNullOrWhiteSpace($trimmedUrl) -or [string]::IsNullOrWhiteSpace($trimmedKey)) {
		return [pscustomobject]@{
			label = $Label
			status = "skipped"
			reason = "Missing URL or service-role key."
			matches = @()
			missing = @()
		}
	}

	if ($expected.Count -eq 0) {
		return [pscustomobject]@{
			label = $Label
			status = "skipped"
			reason = "No expected admin emails are configured."
			matches = @()
			missing = @()
		}
	}

	try {
		$baseUrl = $trimmedUrl.TrimEnd("/")
		$response = Invoke-RestMethod `
			-Method Get `
			-Uri "$baseUrl/auth/v1/admin/users?page=1&per_page=200" `
			-Headers @{
				apikey = $trimmedKey
				Authorization = "Bearer $trimmedKey"
			} `
			-ErrorAction Stop

		$users = @($response.users)
		$matches = New-Object System.Collections.Generic.List[object]
		$missing = New-Object System.Collections.Generic.List[string]
		foreach ($expectedEmail in $expected) {
			$user = @($users | Where-Object { ([string]$_.email).Trim().ToLowerInvariant() -eq $expectedEmail }) | Select-Object -First 1
			if ($null -eq $user) {
				$missing.Add($expectedEmail) | Out-Null
				continue
			}

			$matches.Add([pscustomobject]@{
				email = $expectedEmail
				admin = (Test-SuiteAdminRoleFromUser -User $user)
				userId = [string]$user.id
			}) | Out-Null
		}

		$adminMatches = @($matches | Where-Object { $_.admin })
		$status = if ($missing.Count -gt 0) {
			"drift"
		}
		elseif ($adminMatches.Count -ne $matches.Count) {
			"drift"
		}
		else {
			"verified"
		}

		return [pscustomobject]@{
			label = $Label
			status = $status
			reason = $null
			matches = @($matches)
			missing = @($missing)
		}
	}
	catch {
		return [pscustomobject]@{
			label = $Label
			status = "warning"
			reason = $_.Exception.Message
			matches = @()
			missing = @($expected)
		}
	}
}

function Get-SuiteAdminContinuitySummary {
	param([Parameter(Mandatory = $true)][string]$RepoRoot)

	$baseEnv = Read-SuiteEnvFileValues -Path (Join-Path $RepoRoot ".env")
	$localEnv = Read-SuiteEnvFileValues -Path (Join-Path $RepoRoot ".env.local")
	$expectedEmails = @(Get-SuiteExpectedAdminEmails -RepoRoot $RepoRoot)

	$localProbe = Get-SuiteSupabaseAdminContinuityProbe `
		-Label "local" `
		-Url ([string]$localEnv["SUPABASE_URL"]) `
		-ServiceRoleKey ([string]$localEnv["SUPABASE_SERVICE_ROLE_KEY"]) `
		-ExpectedEmails $expectedEmails
	$hostedProbe = Get-SuiteSupabaseAdminContinuityProbe `
		-Label "hosted" `
		-Url ([string]$baseEnv["SUPABASE_URL"]) `
		-ServiceRoleKey ([string]$baseEnv["SUPABASE_SERVICE_ROLE_KEY"]) `
		-ExpectedEmails $expectedEmails

	$probes = @($localProbe, $hostedProbe)
	$overall = if (@($probes | Where-Object { $_.status -eq "drift" }).Count -gt 0) {
		"drift"
	}
	elseif (@($probes | Where-Object { $_.status -eq "warning" }).Count -gt 0) {
		"warning"
	}
	elseif ($localProbe.status -eq "verified" -or $hostedProbe.status -eq "verified") {
		"verified"
	}
	else {
		"skipped"
	}

	return [pscustomobject]@{
		expectedEmails = @($expectedEmails)
		overall = $overall
		local = $localProbe
		hosted = $hostedProbe
	}
}

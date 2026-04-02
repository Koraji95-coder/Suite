[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)]
	[ValidateSet("up", "down", "stop", "ps", "logs")]
	[string]$Action,
	[string]$RepoRoot,
	[string[]]$Services = @(),
	[int]$Tail = 200,
	[switch]$Build,
	[switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$normalizedServices = New-Object System.Collections.Generic.List[string]
foreach ($serviceEntry in @($Services)) {
	if ($null -eq $serviceEntry) {
		continue
	}

	foreach ($candidate in ([string]$serviceEntry -split ",")) {
		$serviceName = $candidate.Trim()
		if (-not [string]::IsNullOrWhiteSpace($serviceName)) {
			$normalizedServices.Add($serviceName) | Out-Null
		}
	}
}
$Services = @($normalizedServices)

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
	$RepoRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
. (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")

$runtimePaths = Get-SuiteRuntimePaths
$supabasePorts = Get-SuiteSupabaseLocalPorts -RepoRoot $resolvedRepoRoot
$composePath = Join-Path $resolvedRepoRoot "docker\runtime-core\runtime-core.compose.yml"
$projectName = "suite-runtime-core"

if (-not (Test-Path -LiteralPath $composePath -PathType Leaf)) {
	throw "Runtime core compose file was not found: $composePath"
}

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCommand) {
	$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
}
if (-not $dockerCommand) {
	throw "docker is not available on PATH."
}

$composeArgs = @("compose", "-f", $composePath, "-p", $projectName)
$composeEnv = [ordered]@{
	SUITE_RUNTIME_STATUS_DIR = $runtimePaths.RuntimeStatusDir
	SUITE_SUPABASE_LOCAL_API_PORT = [string]$supabasePorts.api
	SUITE_SUPABASE_LOCAL_DB_PORT = [string]$supabasePorts.db
	SUITE_SUPABASE_LOCAL_SHADOW_PORT = [string]$supabasePorts.shadowDb
	SUITE_SUPABASE_LOCAL_POOLER_PORT = [string]$supabasePorts.pooler
	SUITE_SUPABASE_LOCAL_STUDIO_PORT = [string]$supabasePorts.studio
	SUITE_SUPABASE_LOCAL_INBUCKET_PORT = [string]$supabasePorts.inbucket
	SUPABASE_LOCAL_SMTP_PORT = [string]$supabasePorts.smtp
	SUITE_SUPABASE_LOCAL_ANALYTICS_PORT = [string]$supabasePorts.analytics
}

function Invoke-ComposeCommand {
	param([string[]]$Arguments)

	$previousValues = @{}
	foreach ($entry in $composeEnv.GetEnumerator()) {
		$previousValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
		[Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
	}

	try {
		$previousErrorActionPreference = $ErrorActionPreference
		$ErrorActionPreference = "Continue"
		$rawOutput = & $dockerCommand.Source @($composeArgs + $Arguments) 2>&1
		$exitCode = if (Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue) { [int]$LASTEXITCODE } else { 0 }
		$outputText = [string]::Join(
			[Environment]::NewLine,
			@(
				$rawOutput | ForEach-Object {
					if ($null -eq $_) { "" } else { $_.ToString() }
				}
			)
		).Trim()

		return [pscustomobject]@{
			Ok = ($exitCode -eq 0)
			ExitCode = $exitCode
			OutputText = $outputText
		}
	}
	finally {
		$ErrorActionPreference = $previousErrorActionPreference
		foreach ($entry in $composeEnv.GetEnumerator()) {
			[Environment]::SetEnvironmentVariable($entry.Key, $previousValues[$entry.Key], "Process")
		}
	}
}

switch ($Action) {
	"up" {
		$upArgs = @("up", "-d")
		if ($Build) {
			$upArgs += "--build"
		}
		$upArgs += @($Services)
		$result = Invoke-ComposeCommand -Arguments $upArgs
	}
	"down" {
		$result = Invoke-ComposeCommand -Arguments @("down", "--remove-orphans")
	}
	"stop" {
		$stopArgs = @("stop") + @($Services)
		$result = Invoke-ComposeCommand -Arguments $stopArgs
	}
	"logs" {
		$logArgs = @("logs", "--tail", [string]$Tail)
		if (-not $Json) {
			$logArgs += "-f"
		}
		$result = Invoke-ComposeCommand -Arguments ($logArgs + @($Services))
	}
	"ps" {
		$result = Invoke-ComposeCommand -Arguments @("ps", "--format", "json")
	}
	default {
		throw "Unsupported runtime core action '$Action'."
	}
}

if ($Json) {
	$payload = $null
	if ($Action -eq "ps" -and -not [string]::IsNullOrWhiteSpace($result.OutputText)) {
		$jsonLines = @(
			$result.OutputText -split "`r?`n" |
				ForEach-Object { [string]$_ } |
				Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
		)

		if ($jsonLines.Count -gt 0) {
			try {
				$payload = @(
					$jsonLines | ForEach-Object {
						$_ | ConvertFrom-Json
					}
				)
			}
			catch {
				$payload = $null
			}
		}
	}

	[pscustomobject]@{
		ok = $result.Ok
		action = $Action
		composePath = $composePath
		projectName = $projectName
		services = @($Services)
		build = [bool]$Build
		supabasePorts = $supabasePorts
		payload = $payload
		outputText = $result.OutputText
	} | ConvertTo-Json -Depth 8
	return
}

if (-not [string]::IsNullOrWhiteSpace($result.OutputText)) {
	Write-Host $result.OutputText
}

if (-not $result.Ok) {
	exit $result.ExitCode
}

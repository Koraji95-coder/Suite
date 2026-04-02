function Convert-ToSuiteTomlString {
    param([Parameter(Mandatory = $true)][string]$Value)

    $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    return '"' + $escaped + '"'
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

function Get-SuiteTomlStringValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (
        [string]::IsNullOrWhiteSpace($Path) -or
        [string]::IsNullOrWhiteSpace($Key) -or
        -not (Test-Path -LiteralPath $Path)
    ) {
        return $null
    }

    $pattern = "^\s*$([Regex]::Escape($Key))\s*=\s*""([^""]*)"""
    foreach ($line in Get-Content -LiteralPath $Path) {
        $match = [Regex]::Match($line, $pattern)
        if ($match.Success) {
            return $match.Groups[1].Value.Trim()
        }
    }

    return $null
}

function Convert-ToSuiteSlug {
    param([Parameter(Mandatory = $true)][string]$Value)

    $slug = [Regex]::Replace($Value.ToLowerInvariant(), "[^a-z0-9]+", "-")
    return $slug.Trim("-")
}

function Get-SuiteLocalAppDataRoot {
    if ($env:LOCALAPPDATA) {
        return $env:LOCALAPPDATA
    }

    return Join-Path $env:USERPROFILE "AppData\Local"
}

function Get-SuiteRoamingAppDataRoot {
    if ($env:APPDATA) {
        return $env:APPDATA
    }

    return Join-Path $env:USERPROFILE "AppData\Roaming"
}

function Get-SuitePreferredDevRoot {
    if (-not [string]::IsNullOrWhiteSpace([string]$env:USERPROFILE)) {
        return Join-Path $env:USERPROFILE "Documents\GitHub"
    }

    return "C:\Users\DustinWard\Documents\GitHub"
}

function Get-SuiteStableSuiteRoot {
    return Join-Path (Get-SuitePreferredDevRoot) "Suite"
}

function Get-SuiteStableDailyRoot {
    return Join-Path (Get-SuitePreferredDevRoot) "Office"
}

function Get-SuiteDropboxWorkspaceRoot {
    if (-not [string]::IsNullOrWhiteSpace([string]$env:USERPROFILE)) {
        return Join-Path $env:USERPROFILE "Dropbox\SuiteWorkspace"
    }

    return "C:\Users\DustinWard\Dropbox\SuiteWorkspace"
}

function Get-SuiteOfficeWorkspaceRoot {
    return Join-Path (Get-SuiteDropboxWorkspaceRoot) "Office"
}

function Get-SuiteOfficeKnowledgeRoot {
    return Join-Path (Get-SuiteOfficeWorkspaceRoot) "Knowledge"
}

function Get-SuiteOfficeStateRoot {
    return Join-Path (Get-SuiteOfficeWorkspaceRoot) "State"
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
        knowledgeRoot = $knowledgeRoot
        stateRoot = $stateRoot
    }
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

function Resolve-SuitePreferredDailyRoot {
    $stableDailyRoot = Get-SuiteStableDailyRoot
    if (Test-Path -LiteralPath $stableDailyRoot) {
        return [System.IO.Path]::GetFullPath($stableDailyRoot)
    }

    $legacyDailyRoot = Get-SuiteLegacyDailyRoot
    if (-not [string]::IsNullOrWhiteSpace($legacyDailyRoot) -and (Test-Path -LiteralPath $legacyDailyRoot)) {
        return [System.IO.Path]::GetFullPath($legacyDailyRoot)
    }

    return [System.IO.Path]::GetFullPath($stableDailyRoot)
}

function Resolve-SuitePreferredOfficeExecutablePath {
    return $null
}

function Test-SuiteDirectoryWriteAccess {
    param([Parameter(Mandatory = $true)][string]$DirectoryPath)

    try {
        $null = New-Item -ItemType Directory -Path $DirectoryPath -Force
        $probePath = Join-Path $DirectoryPath (".suite-write-test-" + [Guid]::NewGuid().ToString("N") + ".tmp")
        Set-Content -Path $probePath -Value "ok" -Encoding ASCII
        Remove-Item -Path $probePath -Force
        return $true
    }
    catch {
        return $false
    }
}

function Get-SuitePreferredAutoCadPluginBundleRoot {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:ProgramFiles) {
        $candidates.Add((Join-Path $env:ProgramFiles "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates.Add((Join-Path ${env:ProgramFiles(x86)} "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }

    $roamingAppData = Get-SuiteRoamingAppDataRoot
    if ($roamingAppData) {
        $candidates.Add((Join-Path $roamingAppData "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if ($env:ProgramData) {
        $candidates.Add((Join-Path $env:ProgramData "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }
    if ($env:ALLUSERSPROFILE) {
        $candidates.Add((Join-Path $env:ALLUSERSPROFILE "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"))
    }

    $normalizedCandidates = @(
        $candidates |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            ForEach-Object { [System.IO.Path]::GetFullPath($_) } |
            Select-Object -Unique
    )

    foreach ($candidate in $normalizedCandidates) {
        $parentPath = Split-Path -Parent $candidate
        if (Test-SuiteDirectoryWriteAccess -DirectoryPath $parentPath) {
            return $candidate
        }
    }

    if ($normalizedCandidates.Count -gt 0) {
        return $normalizedCandidates[0]
    }

    return Join-Path (Get-SuiteRoamingAppDataRoot) "Autodesk\ApplicationPlugins\SuiteWatchdogCadTracker.bundle"
}

function Convert-ToSuiteWorkstationLabel {
    param([Parameter(Mandatory = $true)][string]$Value)

    $segments = @(
        [Regex]::Split($Value.Trim(), "[-_]+") | Where-Object {
            -not [string]::IsNullOrWhiteSpace($_)
        }
    )
    if ($segments.Count -eq 0) {
        return "$Value workstation"
    }

    $textInfo = [System.Globalization.CultureInfo]::InvariantCulture.TextInfo
    $friendlyName = ($segments | ForEach-Object {
        $textInfo.ToTitleCase($_.ToLowerInvariant())
    }) -join " "
    return "$friendlyName workstation"
}

function Get-SuiteWorkstationProfilesPath {
    param([Parameter(Mandatory = $true)][string]$ResolvedRepoRoot)

    return Join-Path $ResolvedRepoRoot "tools\suite-repo-mcp\workstation-profiles.json"
}

function Get-SuiteWorkstationProfiles {
    param([Parameter(Mandatory = $true)][string]$ResolvedRepoRoot)

    $profilesPath = Get-SuiteWorkstationProfilesPath -ResolvedRepoRoot $ResolvedRepoRoot
    if (-not (Test-Path -LiteralPath $profilesPath)) {
        throw "Suite workstation profile file was not found: $profilesPath"
    }

    $parsed = Get-Content -LiteralPath $profilesPath -Raw | ConvertFrom-Json
    $profiles = @($parsed.profiles)
    if ($profiles.Count -eq 0) {
        throw "Suite workstation profile file does not define any profiles: $profilesPath"
    }

    return [pscustomobject]@{
        Path = $profilesPath
        Profiles = $profiles
    }
}

function Find-SuiteWorkstationProfileMatch {
    param(
        [Parameter(Mandatory = $true)][object[]]$Profiles,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $needle = $Value.Trim().ToUpperInvariant()
    foreach ($profile in $Profiles) {
        $profileId = [string]$profile.id
        if (-not [string]::IsNullOrWhiteSpace($profileId)) {
            if ($profileId.Trim().ToUpperInvariant() -eq $needle) {
                return [pscustomobject]@{
                    Profile = $profile
                    MatchSource = "id"
                }
            }
        }

        foreach ($computerName in @($profile.computerNames)) {
            $candidate = [string]$computerName
            if ([string]::IsNullOrWhiteSpace($candidate)) {
                continue
            }

            if ($candidate.Trim().ToUpperInvariant() -eq $needle) {
                return [pscustomobject]@{
                    Profile = $profile
                    MatchSource = "computer_name"
                }
            }
        }
    }

    return $null
}

function Get-SuiteFallbackWorkstationProfile {
    param([Parameter(Mandatory = $true)][string]$ResolvedWorkstationId)

    return [pscustomobject]@{
        id = $ResolvedWorkstationId
        label = (Convert-ToSuiteWorkstationLabel -Value $ResolvedWorkstationId)
        role = "secondary"
    }
}

function Get-SuiteOptionalProfileString {
    param(
        [Parameter(Mandatory = $false)]$Profile,
        [Parameter(Mandatory = $true)][string]$PropertyName
    )

    if ($null -eq $Profile) {
        return $null
    }

    $property = $Profile.PSObject.Properties[$PropertyName]
    if ($null -eq $property) {
        return $null
    }

    return [string]$property.Value
}

function Resolve-SuiteWorkstationProfile {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedRepoRoot,
        [string]$ExplicitWorkstationId,
        [string]$ExplicitWorkstationLabel,
        [string]$ExplicitWorkstationRole,
        [string]$ExplicitGitUserName,
        [string]$ExplicitGitUserEmail
    )

    $profileSet = Get-SuiteWorkstationProfiles -ResolvedRepoRoot $ResolvedRepoRoot
    $computerName = [string]($env:COMPUTERNAME)
    $resolvedComputerName = if ([string]::IsNullOrWhiteSpace($computerName)) {
        [System.Net.Dns]::GetHostName()
    }
    else {
        $computerName.Trim()
    }
    $codexConfigPath = Get-SuiteCodexConfigPath
    $configuredWorkstationId = [string](Get-SuiteTomlStringValue -Path $codexConfigPath -Key "SUITE_WORKSTATION_ID")

    $match = Find-SuiteWorkstationProfileMatch `
        -Profiles $profileSet.Profiles `
        -Value $ExplicitWorkstationId
    if ($null -eq $match) {
        $match = Find-SuiteWorkstationProfileMatch `
            -Profiles $profileSet.Profiles `
            -Value $configuredWorkstationId
        if ($null -ne $match) {
            $match = [pscustomobject]@{
                Profile = $match.Profile
                MatchSource = "codex_config"
            }
        }
    }
    if ($null -eq $match) {
        $match = Find-SuiteWorkstationProfileMatch `
            -Profiles $profileSet.Profiles `
            -Value $resolvedComputerName
    }

    $baseProfile = if ($null -ne $match) {
        $match.Profile
    }
    else {
        $fallbackWorkstationId = if (-not [string]::IsNullOrWhiteSpace($ExplicitWorkstationId)) {
            $ExplicitWorkstationId.Trim()
        }
        elseif (-not [string]::IsNullOrWhiteSpace($configuredWorkstationId)) {
            $configuredWorkstationId.Trim()
        }
        else {
            $resolvedComputerName
        }
        Get-SuiteFallbackWorkstationProfile -ResolvedWorkstationId $fallbackWorkstationId
    }

    $resolvedWorkstationId = [string]$baseProfile.id
    if ([string]::IsNullOrWhiteSpace($resolvedWorkstationId)) {
        throw "Resolved workstation profile is missing an id."
    }

    $resolvedWorkstationLabel = if ([string]::IsNullOrWhiteSpace($ExplicitWorkstationLabel)) {
        Get-SuiteOptionalProfileString -Profile $baseProfile -PropertyName "label"
    }
    else {
        $ExplicitWorkstationLabel.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($resolvedWorkstationLabel)) {
        $resolvedWorkstationLabel = Convert-ToSuiteWorkstationLabel -Value $resolvedWorkstationId
    }

    $resolvedWorkstationRole = if ([string]::IsNullOrWhiteSpace($ExplicitWorkstationRole)) {
        Get-SuiteOptionalProfileString -Profile $baseProfile -PropertyName "role"
    }
    else {
        $ExplicitWorkstationRole.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($resolvedWorkstationRole)) {
        $resolvedWorkstationRole = "secondary"
    }

    return [pscustomobject]@{
        WorkstationId = $resolvedWorkstationId.Trim()
        WorkstationLabel = $resolvedWorkstationLabel.Trim()
        WorkstationRole = $resolvedWorkstationRole.Trim()
        GitUserName = if ([string]::IsNullOrWhiteSpace($ExplicitGitUserName)) {
            Get-SuiteOptionalProfileString -Profile $baseProfile -PropertyName "gitUserName"
        }
        else {
            $ExplicitGitUserName.Trim()
        }
        GitUserEmail = if ([string]::IsNullOrWhiteSpace($ExplicitGitUserEmail)) {
            Get-SuiteOptionalProfileString -Profile $baseProfile -PropertyName "gitUserEmail"
        }
        else {
            $ExplicitGitUserEmail.Trim()
        }
        ComputerName = $resolvedComputerName
        ProfileSource = if ($null -ne $match) { "matrix" } else { "fallback" }
        ProfilePath = $profileSet.Path
        MatchSource = if ($null -ne $match) { $match.MatchSource } else { "fallback" }
    }
}

function Get-SuiteWorkstationMcpEnv {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedRepoRoot,
        [Parameter(Mandatory = $true)]$WorkstationProfile
    )

    $slug = Convert-ToSuiteSlug -Value $WorkstationProfile.WorkstationId
    if (-not $slug) {
        $slug = "workstation"
    }

    $localAppData = Get-SuiteLocalAppDataRoot
    $roamingAppData = Get-SuiteRoamingAppDataRoot
    $preferredSuiteRoot = Get-SuiteStableSuiteRoot
    $preferredDailyRoot = Resolve-SuitePreferredDailyRoot
    $preferredOfficeExecutablePath = Resolve-SuitePreferredOfficeExecutablePath
    $preferredOfficeKnowledgeRoot = Get-SuiteOfficeKnowledgeRoot
    $preferredOfficeStateRoot = Get-SuiteOfficeStateRoot
    $filesystemCollectorId = "watchdog-fs-$slug"
    $autocadCollectorId = "autocad-$slug"
    $filesystemTaskName = "SuiteWatchdogFilesystemCollector-$($WorkstationProfile.WorkstationId)"
    $autocadTaskName = "SuiteWatchdogAutoCADCollector-$($WorkstationProfile.WorkstationId)"

    $envValues = [ordered]@{
        SUITE_MCP_ENV_STAMPED_BY = "scripts/sync-suite-workstation-profile.ps1"
        SUITE_WORKSTATION_ID = $WorkstationProfile.WorkstationId
        SUITE_WORKSTATION_LABEL = $WorkstationProfile.WorkstationLabel
        SUITE_WORKSTATION_ROLE = $WorkstationProfile.WorkstationRole
        SUITE_WATCHDOG_COLLECTOR_ID = $filesystemCollectorId
        SUITE_WATCHDOG_COLLECTOR_CONFIG = (Join-Path $localAppData "Suite\watchdog-collector\config\$($WorkstationProfile.WorkstationId).json")
        SUITE_WATCHDOG_STARTUP_TASK_NAME = $filesystemTaskName
        SUITE_WATCHDOG_STARTUP_CHECK_TASK_NAME = "SuiteWatchdogFilesystemCollectorCheck-$($WorkstationProfile.WorkstationId)"
        SUITE_WATCHDOG_STARTUP_RUN_KEY_NAME = $filesystemTaskName
        SUITE_WATCHDOG_STARTUP_MUTEX_NAME = "Local\SuiteWatchdogFilesystemCollectorDaemon-$slug"
        SUITE_WATCHDOG_STARTUP_CHECK_SCRIPT = (Join-Path $ResolvedRepoRoot "scripts\check-watchdog-filesystem-collector-startup.ps1")
        SUITE_WATCHDOG_AUTOCAD_COLLECTOR_ID = $autocadCollectorId
        SUITE_WATCHDOG_AUTOCAD_COLLECTOR_CONFIG = (Join-Path $localAppData "Suite\watchdog-autocad-collector\config\$($WorkstationProfile.WorkstationId)-autocad.json")
        SUITE_WATCHDOG_AUTOCAD_STATE_PATH = (Join-Path $roamingAppData "CadCommandCenter\tracker-state.json")
        SUITE_WATCHDOG_AUTOCAD_BUFFER_DIR = (Join-Path $localAppData "Suite\watchdog-autocad-collector\$autocadCollectorId")
        SUITE_WATCHDOG_AUTOCAD_STARTUP_TASK_NAME = $autocadTaskName
        SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_TASK_NAME = "SuiteWatchdogAutoCADCollectorCheck-$($WorkstationProfile.WorkstationId)"
        SUITE_WATCHDOG_AUTOCAD_STARTUP_RUN_KEY_NAME = $autocadTaskName
        SUITE_WATCHDOG_AUTOCAD_STARTUP_MUTEX_NAME = "Local\SuiteWatchdogAutoCADCollectorDaemon-$slug"
        SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_SCRIPT = (Join-Path $ResolvedRepoRoot "scripts\check-watchdog-autocad-collector-startup.ps1")
        SUITE_WATCHDOG_AUTOCAD_PLUGIN_BUNDLE_ROOT = (Get-SuitePreferredAutoCadPluginBundleRoot)
        SUITE_WATCHDOG_AUTOCAD_PLUGIN_CHECK_SCRIPT = (Join-Path $ResolvedRepoRoot "scripts\check-watchdog-autocad-plugin.ps1")
        SUITE_WATCHDOG_AUTOCAD_READINESS_CHECK_SCRIPT = (Join-Path $ResolvedRepoRoot "scripts\check-watchdog-autocad-readiness.ps1")
        SUITE_WATCHDOG_BACKEND_STARTUP_CHECK_SCRIPT = (Join-Path $ResolvedRepoRoot "scripts\check-watchdog-backend-startup.ps1")
        SUITE_GATEWAY_STARTUP_CHECK_SCRIPT = (Join-Path $ResolvedRepoRoot "scripts\check-gateway-startup.ps1")
        SUITE_RUNTIME_BOOTSTRAP_SCRIPT = (Join-Path $ResolvedRepoRoot "scripts\run-suite-runtime-startup.ps1")
        SUITE_STABLE_SUITE_ROOT = $preferredSuiteRoot
        SUITE_DAILY_ROOT = $preferredDailyRoot
        SUITE_OFFICE_BROKER_BASE_URL = "http://127.0.0.1:57420"
        SUITE_OFFICE_KNOWLEDGE_ROOT = $preferredOfficeKnowledgeRoot
        SUITE_OFFICE_STATE_ROOT = $preferredOfficeStateRoot
        SUITE_RUNTIME_CORE_COMPOSE_PATH = (Join-Path $ResolvedRepoRoot "docker\runtime-core\runtime-core.compose.yml")
        SUITE_RUNTIME_CORE_PROJECT_NAME = "suite-runtime-core"
    }

    if (-not [string]::IsNullOrWhiteSpace($preferredOfficeExecutablePath)) {
        $envValues["SUITE_OFFICE_EXECUTABLE_PATH"] = $preferredOfficeExecutablePath
    }

    return $envValues
}

function Set-SuiteTomlKeyInSection {
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

function Remove-SuiteTomlKeysInSection {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$SectionName,
        [Parameter(Mandatory = $true)][string[]]$Keys
    )

    $sectionPattern = "(?ms)(^\[" + [regex]::Escape($SectionName) + "\]\s*)(.*?)(?=^\[|\z)"
    if ($Content -notmatch $sectionPattern) {
        return $Content
    }

    return [regex]::Replace(
        $Content,
        $sectionPattern,
        {
            param($match)

            $header = $match.Groups[1].Value
            $body = $match.Groups[2].Value
            foreach ($key in $Keys) {
                $keyPattern = "(?m)^" + [regex]::Escape($key) + "\s*=.*(?:\r?\n)?"
                $body = [regex]::Replace($body, $keyPattern, "")
            }

            return $header + $body
        },
        1
    )
}

function Update-SuiteCodexConfig {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ResolvedRepoRoot,
        [Parameter(Mandatory = $true)]$WorkstationProfile
    )

    if (Test-Path -LiteralPath $Path) {
        $content = Get-Content -LiteralPath $Path -Raw
    }
    else {
        $content = ""
    }

    $serverPath = Join-Path $ResolvedRepoRoot "tools\suite-repo-mcp\server.mjs"
    $content = Set-SuiteTomlKeyInSection `
        -Content $content `
        -SectionName "mcp_servers.suite_repo_mcp" `
        -Key "command" `
        -ValueLiteral (Convert-ToSuiteTomlString -Value "node")
    $content = Set-SuiteTomlKeyInSection `
        -Content $content `
        -SectionName "mcp_servers.suite_repo_mcp" `
        -Key "args" `
        -ValueLiteral ("[" + (Convert-ToSuiteTomlString -Value $serverPath) + "]")
    $content = Set-SuiteTomlKeyInSection `
        -Content $content `
        -SectionName "mcp_servers.suite_repo_mcp" `
        -Key "startup_timeout_sec" `
        -ValueLiteral "20"
    $content = Set-SuiteTomlKeyInSection `
        -Content $content `
        -SectionName "mcp_servers.suite_repo_mcp" `
        -Key "tool_timeout_sec" `
        -ValueLiteral "180"

    $mcpEnvValues = Get-SuiteWorkstationMcpEnv `
        -ResolvedRepoRoot $ResolvedRepoRoot `
        -WorkstationProfile $WorkstationProfile

    $content = Remove-SuiteTomlKeysInSection `
        -Content $content `
        -SectionName "mcp_servers.suite_repo_mcp.env" `
        -Keys (@($mcpEnvValues.Keys) + @("SUITE_OFFICE_EXECUTABLE_PATH"))

    foreach ($key in $mcpEnvValues.Keys) {
        $content = Set-SuiteTomlKeyInSection `
            -Content $content `
            -SectionName "mcp_servers.suite_repo_mcp.env" `
            -Key $key `
            -ValueLiteral (Convert-ToSuiteTomlString -Value ([string]$mcpEnvValues[$key]))
    }

    $content = Set-SuiteTomlKeyInSection `
        -Content $content `
        -SectionName "features" `
        -Key "rmcp_client" `
        -ValueLiteral "true"

    Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

function Format-SuiteRepoMcpToml {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedRepoRoot,
        [Parameter(Mandatory = $true)]$WorkstationProfile
    )

    $serverPath = Join-Path $ResolvedRepoRoot "tools\suite-repo-mcp\server.mjs"
    $mcpEnvValues = Get-SuiteWorkstationMcpEnv `
        -ResolvedRepoRoot $ResolvedRepoRoot `
        -WorkstationProfile $WorkstationProfile

    $lines = @(
        "[mcp_servers.suite_repo_mcp]",
        "command = $(Convert-ToSuiteTomlString -Value 'node')",
        "args = [$(Convert-ToSuiteTomlString -Value $serverPath)]",
        "startup_timeout_sec = 20",
        "tool_timeout_sec = 180",
        "",
        "[mcp_servers.suite_repo_mcp.env]"
    )

    foreach ($key in $mcpEnvValues.Keys) {
        $lines += "$key = $(Convert-ToSuiteTomlString -Value ([string]$mcpEnvValues[$key]))"
    }

    $lines += ""
    $lines += "[features]"
    $lines += "rmcp_client = true"

    return ($lines -join "`r`n") + "`r`n"
}

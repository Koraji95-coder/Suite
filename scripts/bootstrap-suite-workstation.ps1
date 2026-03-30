[CmdletBinding()]
param(
    [string]$SuiteRoot,
    [string]$DailyRoot,
    [string]$SuiteRepoUrl,
    [string]$DailyRepoUrl,
    [string]$DailySourcePath,
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
    [string]$WorkstationId,
    [string]$WorkstationLabel,
    [string]$WorkstationRole,
    [switch]$InstallMissing,
    [switch]$ValidateOnly,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "suite-workstation-config.ps1")
. (Join-Path $PSScriptRoot "lib\suite-runtime-shared.ps1")

$resolvedSuiteRoot = [System.IO.Path]::GetFullPath($(if ([string]::IsNullOrWhiteSpace($SuiteRoot)) { Get-SuiteStableSuiteRoot } else { $SuiteRoot }))
$resolvedDailyRoot = [System.IO.Path]::GetFullPath($(if ([string]::IsNullOrWhiteSpace($DailyRoot)) { Get-SuiteStableDailyRoot } else { $DailyRoot }))
$legacyDailyRoot = Get-SuiteLegacyDailyRoot
$resolvedDailySourcePath = if (-not [string]::IsNullOrWhiteSpace($DailySourcePath)) {
    [System.IO.Path]::GetFullPath($DailySourcePath)
}
elseif (-not [string]::IsNullOrWhiteSpace($legacyDailyRoot) -and (Test-Path -LiteralPath $legacyDailyRoot)) {
    [System.IO.Path]::GetFullPath($legacyDailyRoot)
}
else {
    $null
}

$steps = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]
$dailyPublishRoot = Join-Path $resolvedDailyRoot "artifacts\DailyDesk\publish"
$plannedOfficeExecutablePath = Join-Path $dailyPublishRoot "DailyDesk.exe"
$resolvedOfficeExecutablePath = $plannedOfficeExecutablePath
$resolvedSuiteRepoUrl = $SuiteRepoUrl
$resolvedDailyRepoUrl = $DailyRepoUrl
$runtimeStatusPayload = $null
$suiteSyncMode = $null
$dailySyncMode = $null

function Add-Warning {
    param([string]$Message)

    if ([string]::IsNullOrWhiteSpace($Message)) {
        return
    }

    if (-not $warnings.Contains($Message)) {
        $warnings.Add($Message)
    }
}

function Add-StepResult {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][bool]$Ok,
        [Parameter(Mandatory = $true)][string]$Summary,
        [string]$Details,
        [string[]]$Warnings
    )

    $normalizedWarnings = @($Warnings | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    foreach ($warning in $normalizedWarnings) {
        Add-Warning -Message $warning
    }

    $steps.Add([pscustomobject]@{
        id = $Id
        label = $Label
        ok = $Ok
        summary = $Summary
        details = if ([string]::IsNullOrWhiteSpace($Details)) { $null } else { $Details }
        warnings = @($normalizedWarnings)
    }) | Out-Null
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
            Push-Location $WorkingDirectory
        }

        $rawOutput = & $FilePath @Arguments 2>&1
        $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } else { 0 }
        $outputText = Convert-CommandOutputToText -Output $rawOutput
    }
    catch {
        $exitCode = 1
        $outputText = $_.Exception.Message
    }
    finally {
        if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
            Pop-Location
        }
        $ErrorActionPreference = $previousErrorActionPreference
    }

    [pscustomobject]@{
        Ok = ($exitCode -eq 0)
        ExitCode = $exitCode
        OutputText = $outputText
        OutputTail = Get-OutputTail -Text $outputText
    }
}

function Get-CommandVersionText {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    if ([string]::IsNullOrWhiteSpace($FilePath)) {
        return $null
    }

    $result = Invoke-ExternalCommand -FilePath $FilePath -Arguments $Arguments
    if (-not $result.Ok -or [string]::IsNullOrWhiteSpace($result.OutputText)) {
        return $null
    }

    return ($result.OutputText -split "`r?`n" | Select-Object -First 1).Trim()
}

function Get-GitRemoteOriginUrl {
    param([string]$RepoPath)

    if ([string]::IsNullOrWhiteSpace($RepoPath) -or -not (Test-Path -LiteralPath (Join-Path $RepoPath ".git"))) {
        return $null
    }

    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($null -eq $gitCommand) {
        return $null
    }

    $result = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @("-C", $RepoPath, "remote", "get-url", "origin")
    if (-not $result.Ok) {
        return $null
    }

    return ($result.OutputText -split "`r?`n" | Select-Object -First 1).Trim()
}

function Test-GitRepositoryPath {
    param([string]$Path)

    return (-not [string]::IsNullOrWhiteSpace($Path)) -and (Test-Path -LiteralPath (Join-Path $Path ".git"))
}

function Test-DailyWorkspacePath {
    param([string]$Path)

    return (
        -not [string]::IsNullOrWhiteSpace($Path) -and
        (Test-Path -LiteralPath (Join-Path $Path "DailyDesk\DailyDesk.csproj"))
    )
}

function Get-WebView2ExecutablePath {
    $candidates = @()
    if (${env:ProgramFiles(x86)}) {
        $candidates += Join-Path ${env:ProgramFiles(x86)} "Microsoft\EdgeWebView\Application"
    }
    if ($env:ProgramFiles) {
        $candidates += Join-Path $env:ProgramFiles "Microsoft\EdgeWebView\Application"
    }

    foreach ($basePath in $candidates) {
        if (-not (Test-Path -LiteralPath $basePath)) {
            continue
        }

        $versions = Get-ChildItem -LiteralPath $basePath -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
        foreach ($versionDirectory in $versions) {
            $candidate = Join-Path $versionDirectory.FullName "msedgewebview2.exe"
            if (Test-Path -LiteralPath $candidate) {
                return [System.IO.Path]::GetFullPath($candidate)
            }
        }
    }

    return $null
}

function Get-DockerDesktopExecutablePath {
    $candidates = @(
        (Join-Path ${env:ProgramFiles} "Docker\Docker\Docker Desktop.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\Docker Desktop.exe")
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    return $null
}

function Get-AutoCadInstallPath {
    $candidates = @(
        "C:\Program Files\Autodesk\AutoCAD Electrical 2026",
        "C:\Program Files\Autodesk\AutoCAD 2026",
        "C:\Program Files\Autodesk\AutoCAD Electrical 2025",
        "C:\Program Files\Autodesk\AutoCAD 2025"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate "acad.exe")) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    return $null
}

function Get-DotNetSdkVersions {
    $dotnetCommand = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($null -eq $dotnetCommand) {
        return @()
    }

    $result = Invoke-ExternalCommand -FilePath $dotnetCommand.Source -Arguments @("--list-sdks")
    if (-not $result.Ok) {
        return @()
    }

    return @(
        $result.OutputText -split "`r?`n" |
            ForEach-Object { $_.Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
}

function Get-PrerequisiteSnapshot {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    $dotnetCommand = Get-Command dotnet -ErrorAction SilentlyContinue
    $supabaseCommand = Get-Command supabase -ErrorAction SilentlyContinue
    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    $webView2Path = Get-WebView2ExecutablePath
    $dockerDesktopPath = Get-DockerDesktopExecutablePath
    $autoCadInstallPath = Get-AutoCadInstallPath
    $dotNetSdkVersions = @(Get-DotNetSdkVersions)
    $hasNet10Sdk = @($dotNetSdkVersions | Where-Object { $_ -match "^10\." }).Count -gt 0

    return @(
        [pscustomobject]@{
            id = "git"
            label = "Git"
            required = $true
            ok = ($null -ne $gitCommand)
            version = if ($gitCommand) { Get-CommandVersionText -FilePath $gitCommand.Source -Arguments @("--version") } else { $null }
            location = if ($gitCommand) { $gitCommand.Source } else { $null }
            installHint = "winget install --id Git.Git -e --silent"
        }
        [pscustomobject]@{
            id = "node"
            label = "Node.js"
            required = $true
            ok = ($null -ne $nodeCommand)
            version = if ($nodeCommand) { Get-CommandVersionText -FilePath $nodeCommand.Source -Arguments @("--version") } else { $null }
            location = if ($nodeCommand) { $nodeCommand.Source } else { $null }
            installHint = "winget install --id OpenJS.NodeJS.LTS -e --silent"
        }
        [pscustomobject]@{
            id = "python"
            label = "Python"
            required = $true
            ok = ($null -ne $pythonCommand)
            version = if ($pythonCommand) { Get-CommandVersionText -FilePath $pythonCommand.Source -Arguments @("--version") } else { $null }
            location = if ($pythonCommand) { $pythonCommand.Source } else { $null }
            installHint = "winget install --id Python.Python.3.12 -e --silent"
        }
        [pscustomobject]@{
            id = "dotnet"
            label = ".NET SDK"
            required = $true
            ok = ($null -ne $dotnetCommand) -and $hasNet10Sdk
            version = if ($dotNetSdkVersions.Count -gt 0) { $dotNetSdkVersions[0] } else { $null }
            location = if ($dotnetCommand) { $dotnetCommand.Source } else { $null }
            installHint = "winget install --id Microsoft.DotNet.SDK.10 -e --silent"
        }
        [pscustomobject]@{
            id = "docker"
            label = "Docker Desktop"
            required = $true
            ok = ($null -ne $dockerCommand)
            version = if ($dockerCommand) { Get-CommandVersionText -FilePath $dockerCommand.Source -Arguments @("--version") } else { $null }
            location = if ($dockerDesktopPath) { $dockerDesktopPath } else { if ($dockerCommand) { $dockerCommand.Source } else { $null } }
            installHint = "winget install --id Docker.DockerDesktop -e --silent"
        }
        [pscustomobject]@{
            id = "supabase"
            label = "Supabase CLI"
            required = $true
            ok = ($null -ne $supabaseCommand) -or ($null -ne $npmCommand)
            version = if ($supabaseCommand) { Get-CommandVersionText -FilePath $supabaseCommand.Source -Arguments @("--version") } else { "resolved via npx" }
            location = if ($supabaseCommand) { $supabaseCommand.Source } else { if ($npmCommand) { $npmCommand.Source } else { $null } }
            installHint = "npm install -g supabase"
        }
        [pscustomobject]@{
            id = "webview2"
            label = "WebView2 Runtime"
            required = $true
            ok = (-not [string]::IsNullOrWhiteSpace($webView2Path))
            version = $null
            location = $webView2Path
            installHint = "winget install --id Microsoft.EdgeWebView2Runtime -e --silent"
        }
        [pscustomobject]@{
            id = "autocad"
            label = "AutoCAD / ACADE"
            required = $false
            ok = (-not [string]::IsNullOrWhiteSpace($autoCadInstallPath))
            version = $null
            location = $autoCadInstallPath
            installHint = "Install AutoCAD or AutoCAD Electrical manually if this workstation needs CAD plugin automation."
        }
    )
}

function Install-MissingPrerequisite {
    param([Parameter(Mandatory = $true)][object]$Prerequisite)

    switch ([string]$Prerequisite.id) {
        "supabase" {
            $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
            if ($null -eq $npmCommand) {
                return [pscustomobject]@{
                    Ok = $false
                    ExitCode = 1
                    OutputText = "Supabase CLI install skipped because npm is not available."
                    OutputTail = "Supabase CLI install skipped because npm is not available."
                }
            }

            return Invoke-ExternalCommand -FilePath $npmCommand.Source -Arguments @("install", "-g", "supabase")
        }
        "autocad" {
            return [pscustomobject]@{
                Ok = $false
                ExitCode = 1
                OutputText = "AutoCAD installation stays manual."
                OutputTail = "AutoCAD installation stays manual."
            }
        }
        default {
            $wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
            if ($null -eq $wingetCommand) {
                return [pscustomobject]@{
                    Ok = $false
                    ExitCode = 1
                    OutputText = "winget is not available on this workstation."
                    OutputTail = "winget is not available on this workstation."
                }
            }

            $packageId = switch ([string]$Prerequisite.id) {
                "git" { "Git.Git" }
                "node" { "OpenJS.NodeJS.LTS" }
                "python" { "Python.Python.3.12" }
                "dotnet" { "Microsoft.DotNet.SDK.10" }
                "docker" { "Docker.DockerDesktop" }
                "webview2" { "Microsoft.EdgeWebView2Runtime" }
                default { $null }
            }

            if ([string]::IsNullOrWhiteSpace($packageId)) {
                return [pscustomobject]@{
                    Ok = $false
                    ExitCode = 1
                    OutputText = "No package id is defined for $($Prerequisite.label)."
                    OutputTail = "No package id is defined for $($Prerequisite.label)."
                }
            }

            return Invoke-ExternalCommand `
                -FilePath $wingetCommand.Source `
                -Arguments @("install", "--id", $packageId, "-e", "--silent", "--accept-source-agreements", "--accept-package-agreements")
        }
    }
}

function Copy-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$TargetRoot
    )

    New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
    $children = Get-ChildItem -LiteralPath $SourceRoot -Force -ErrorAction Stop
    foreach ($child in $children) {
        Copy-Item -LiteralPath $child.FullName -Destination $TargetRoot -Recurse -Force
    }
}

function Sync-SuiteRepository {
    param(
        [Parameter(Mandatory = $true)][string]$TargetRoot,
        [string]$RepoUrl
    )

    if ([string]::Equals($scriptRepoRoot, $TargetRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return [pscustomobject]@{
            ok = $true
            summary = "Using the current Suite repo as the workstation root."
            details = $scriptRepoRoot
            syncMode = "current_repo"
            root = $scriptRepoRoot
        }
    }

    if (Test-GitRepositoryPath -Path $TargetRoot) {
        if ($ValidateOnly) {
            return [pscustomobject]@{
                ok = $true
                summary = "Would update the existing Suite repo."
                details = $TargetRoot
                syncMode = "git_pull"
                root = $TargetRoot
            }
        }

        $gitCommand = Get-Command git -ErrorAction Stop
        $statusResult = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @("-C", $TargetRoot, "status", "--porcelain")
        if (-not $statusResult.Ok) {
            return [pscustomobject]@{
                ok = $false
                summary = "Could not inspect the existing Suite repo."
                details = $statusResult.OutputTail
                syncMode = "git_pull"
                root = $TargetRoot
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($statusResult.OutputText)) {
            return [pscustomobject]@{
                ok = $true
                summary = "Using the existing Suite repo without pulling because the worktree is dirty."
                details = $TargetRoot
                syncMode = "dirty_existing_repo"
                root = $TargetRoot
                warnings = @("Suite repo at $TargetRoot has local changes, so bootstrap skipped git pull.")
            }
        }

        $pullResult = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @("-C", $TargetRoot, "pull", "--ff-only")
        return [pscustomobject]@{
            ok = $pullResult.Ok
            summary = if ($pullResult.Ok) { "Updated the Suite repo." } else { "Suite repo update failed." }
            details = $pullResult.OutputTail
            syncMode = "git_pull"
            root = $TargetRoot
        }
    }

    if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
        return [pscustomobject]@{
            ok = $false
            summary = "Suite repo URL is required to clone into the workstation root."
            details = $TargetRoot
            syncMode = "missing_repo_url"
            root = $TargetRoot
        }
    }

    if ($ValidateOnly) {
        return [pscustomobject]@{
            ok = $true
            summary = "Would clone the Suite repo into the workstation root."
            details = "$RepoUrl -> $TargetRoot"
            syncMode = "git_clone"
            root = $TargetRoot
        }
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $TargetRoot) -Force | Out-Null
    $gitCommand = Get-Command git -ErrorAction Stop
    $cloneResult = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @("clone", $RepoUrl, $TargetRoot)
    return [pscustomobject]@{
        ok = $cloneResult.Ok
        summary = if ($cloneResult.Ok) { "Cloned the Suite repo into the workstation root." } else { "Suite repo clone failed." }
        details = $cloneResult.OutputTail
        syncMode = "git_clone"
        root = $TargetRoot
    }
}

function Sync-DailyRepository {
    param(
        [Parameter(Mandatory = $true)][string]$TargetRoot,
        [string]$RepoUrl,
        [string]$SourcePath
    )

    if (Test-GitRepositoryPath -Path $TargetRoot) {
        if ($ValidateOnly) {
            return [pscustomobject]@{
                ok = $true
                summary = "Would update the existing Daily repo."
                details = $TargetRoot
                syncMode = "git_pull"
                root = $TargetRoot
            }
        }

        $gitCommand = Get-Command git -ErrorAction Stop
        $statusResult = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @("-C", $TargetRoot, "status", "--porcelain")
        if (-not $statusResult.Ok) {
            return [pscustomobject]@{
                ok = $false
                summary = "Could not inspect the existing Daily repo."
                details = $statusResult.OutputTail
                syncMode = "git_pull"
                root = $TargetRoot
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($statusResult.OutputText)) {
            return [pscustomobject]@{
                ok = $true
                summary = "Using the existing Daily repo without pulling because the worktree is dirty."
                details = $TargetRoot
                syncMode = "dirty_existing_repo"
                root = $TargetRoot
                warnings = @("Daily repo at $TargetRoot has local changes, so bootstrap skipped git pull.")
            }
        }

        $pullResult = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @("-C", $TargetRoot, "pull", "--ff-only")
        return [pscustomobject]@{
            ok = $pullResult.Ok
            summary = if ($pullResult.Ok) { "Updated the Daily repo." } else { "Daily repo update failed." }
            details = $pullResult.OutputTail
            syncMode = "git_pull"
            root = $TargetRoot
        }
    }

    if (Test-DailyWorkspacePath -Path $TargetRoot) {
        return [pscustomobject]@{
            ok = $true
            summary = "Using the existing Daily workspace at the workstation root."
            details = $TargetRoot
            syncMode = "existing_workspace"
            root = $TargetRoot
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($RepoUrl)) {
        if ($ValidateOnly) {
            return [pscustomobject]@{
                ok = $true
                summary = "Would clone the Daily repo into the workstation root."
                details = "$RepoUrl -> $TargetRoot"
                syncMode = "git_clone"
                root = $TargetRoot
            }
        }

        New-Item -ItemType Directory -Path (Split-Path -Parent $TargetRoot) -Force | Out-Null
        $gitCommand = Get-Command git -ErrorAction Stop
        $cloneResult = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @("clone", $RepoUrl, $TargetRoot)
        return [pscustomobject]@{
            ok = $cloneResult.Ok
            summary = if ($cloneResult.Ok) { "Cloned the Daily repo into the workstation root." } else { "Daily repo clone failed." }
            details = $cloneResult.OutputTail
            syncMode = "git_clone"
            root = $TargetRoot
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($SourcePath) -and (Test-DailyWorkspacePath -Path $SourcePath)) {
        if ($ValidateOnly) {
            return [pscustomobject]@{
                ok = $true
                summary = "Would hydrate the Daily workspace from a local source path."
                details = "$SourcePath -> $TargetRoot"
                syncMode = "local_copy"
                root = $TargetRoot
                warnings = @("Daily repo URL was not provided, so bootstrap will rely on a local source copy.")
            }
        }

        Copy-DirectoryContents -SourceRoot $SourcePath -TargetRoot $TargetRoot
        return [pscustomobject]@{
            ok = $true
            summary = "Hydrated the Daily workspace from a local source path."
            details = "$SourcePath -> $TargetRoot"
            syncMode = "local_copy"
            root = $TargetRoot
            warnings = @("Daily repo URL was not provided, so bootstrap used a local source copy.")
        }
    }

    return [pscustomobject]@{
        ok = $false
        summary = "Daily repo source could not be resolved."
        details = "Provide -DailyRepoUrl or -DailySourcePath, or place the Daily workspace at $TargetRoot."
        syncMode = "missing_source"
        root = $TargetRoot
    }
}

function Invoke-SuitePowerShellScript {
    param(
        [Parameter(Mandatory = $true)][string]$SuiteRepoRoot,
        [Parameter(Mandatory = $true)][string]$ScriptRelativePath,
        [string[]]$Arguments
    )

    $scriptPath = Join-Path $SuiteRepoRoot $ScriptRelativePath
    return Invoke-ExternalCommand `
        -FilePath "PowerShell.exe" `
        -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath) + @($Arguments) `
        -WorkingDirectory $SuiteRepoRoot
}

function Invoke-SuitePowerShellJsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$SuiteRepoRoot,
        [Parameter(Mandatory = $true)][string]$ScriptRelativePath,
        [string[]]$Arguments
    )

    $scriptPath = Join-Path $SuiteRepoRoot $ScriptRelativePath
    return Invoke-JsonPowerShellFile -ScriptPath $scriptPath -Arguments $Arguments
}

$resolvedSuiteRepoUrl = if ([string]::IsNullOrWhiteSpace($resolvedSuiteRepoUrl)) {
    Get-GitRemoteOriginUrl -RepoPath $scriptRepoRoot
}
else {
    $resolvedSuiteRepoUrl
}

$initialPrerequisites = @(Get-PrerequisiteSnapshot)
if ($InstallMissing) {
    foreach ($prerequisite in ($initialPrerequisites | Where-Object { -not $_.ok -and $_.required })) {
        $installResult = Install-MissingPrerequisite -Prerequisite $prerequisite
        Add-StepResult `
            -Id ("install-{0}" -f $prerequisite.id) `
            -Label ("Install {0}" -f $prerequisite.label) `
            -Ok ([bool]$installResult.Ok) `
            -Summary $(if ($installResult.Ok) { "Installed $($prerequisite.label)." } else { "Failed to install $($prerequisite.label)." }) `
            -Details ([string]$installResult.OutputTail)
    }
}

$prerequisites = @(Get-PrerequisiteSnapshot)
$requiredPrerequisitesMissing = @($prerequisites | Where-Object { $_.required -and -not $_.ok })
Add-StepResult `
    -Id "prerequisites" `
    -Label "Prerequisites" `
    -Ok ($requiredPrerequisitesMissing.Count -eq 0) `
    -Summary $(if ($requiredPrerequisitesMissing.Count -eq 0) { "Required workstation prerequisites are present." } else { "Some required workstation prerequisites are missing." }) `
    -Details ([string]::Join("; ", @($prerequisites | ForEach-Object {
        $status = if ($_.ok) { "ok" } else { if ($_.required) { "missing" } else { "optional" } }
        "{0}: {1}" -f $_.label, $status
    }))) `
    -Warnings @($requiredPrerequisitesMissing | ForEach-Object { "{0} is missing. {1}" -f $_.label, $_.installHint })

$suiteSync = Sync-SuiteRepository -TargetRoot $resolvedSuiteRoot -RepoUrl $resolvedSuiteRepoUrl
$suiteSyncMode = [string]$suiteSync.syncMode
Add-StepResult `
    -Id "suite-root" `
    -Label "Suite Repo" `
    -Ok ([bool]$suiteSync.ok) `
    -Summary ([string]$suiteSync.summary) `
    -Details ([string]$suiteSync.details) `
    -Warnings $(if ($suiteSync.PSObject.Properties.Name -contains "warnings") { @($suiteSync.warnings) } else { @() })

$dailySync = Sync-DailyRepository -TargetRoot $resolvedDailyRoot -RepoUrl $resolvedDailyRepoUrl -SourcePath $resolvedDailySourcePath
$dailySyncMode = [string]$dailySync.syncMode
Add-StepResult `
    -Id "daily-root" `
    -Label "Daily Repo" `
    -Ok ([bool]$dailySync.ok) `
    -Summary ([string]$dailySync.summary) `
    -Details ([string]$dailySync.details) `
    -Warnings $(if ($dailySync.PSObject.Properties.Name -contains "warnings") { @($dailySync.warnings) } else { @() })

$canContinue = ($requiredPrerequisitesMissing.Count -eq 0) -and [bool]$suiteSync.ok -and [bool]$dailySync.ok
if (-not $ValidateOnly -and $canContinue) {
    $suitePackageInstall = Invoke-ExternalCommand -FilePath "npm" -Arguments @("install") -WorkingDirectory $resolvedSuiteRoot
    Add-StepResult -Id "suite-npm-install" -Label "Suite npm install" -Ok $suitePackageInstall.Ok -Summary $(if ($suitePackageInstall.Ok) { "Installed Suite npm dependencies." } else { "Suite npm install failed." }) -Details $suitePackageInstall.OutputTail
    if (-not $suitePackageInstall.Ok) {
        $canContinue = $false
    }

    if ($canContinue) {
        $pythonRequirements = Invoke-ExternalCommand -FilePath "python" -Arguments @("-m", "pip", "install", "-r", "backend\\requirements-api.lock.txt") -WorkingDirectory $resolvedSuiteRoot
        Add-StepResult -Id "suite-python-deps" -Label "Suite Python dependencies" -Ok $pythonRequirements.Ok -Summary $(if ($pythonRequirements.Ok) { "Installed Suite Python dependencies." } else { "Suite Python dependency install failed." }) -Details $pythonRequirements.OutputTail
        if (-not $pythonRequirements.Ok) {
            $canContinue = $false
        }
    }

    if ($canContinue) {
        foreach ($project in @(
            @{ Id = "suite-runtime-control"; Label = "Suite Runtime Control"; Path = "dotnet\\Suite.RuntimeControl\\Suite.RuntimeControl.csproj" },
            @{ Id = "suite-pipe-bridge"; Label = "Named Pipe Bridge"; Path = "dotnet\\named-pipe-bridge\\NamedPipeServer.csproj" },
            @{ Id = "suite-autodraft-contract"; Label = "AutoDraft API Contract"; Path = "dotnet\\autodraft-api-contract\\AutoDraft.ApiContract.csproj" }
        )) {
            $restoreResult = Invoke-ExternalCommand -FilePath "dotnet" -Arguments @("restore", $project.Path) -WorkingDirectory $resolvedSuiteRoot
            Add-StepResult -Id ("restore-" + $project.Id) -Label ("Restore " + $project.Label) -Ok $restoreResult.Ok -Summary $(if ($restoreResult.Ok) { "$($project.Label) restore completed." } else { "$($project.Label) restore failed." }) -Details $restoreResult.OutputTail
            if (-not $restoreResult.Ok) {
                $canContinue = $false
                break
            }

            $buildResult = Invoke-ExternalCommand -FilePath "dotnet" -Arguments @("build", $project.Path, "-c", "Debug", "-v", "minimal") -WorkingDirectory $resolvedSuiteRoot
            Add-StepResult -Id ("build-" + $project.Id) -Label ("Build " + $project.Label) -Ok $buildResult.Ok -Summary $(if ($buildResult.Ok) { "$($project.Label) build completed." } else { "$($project.Label) build failed." }) -Details $buildResult.OutputTail
            if (-not $buildResult.Ok) {
                $canContinue = $false
                break
            }
        }
    }

    $dailyProjectPath = Join-Path $resolvedDailyRoot "DailyDesk\DailyDesk.csproj"
    if ($canContinue -and (Test-Path -LiteralPath $dailyProjectPath)) {
        $publishResult = Invoke-ExternalCommand `
            -FilePath "dotnet" `
            -Arguments @("publish", $dailyProjectPath, "-c", "Release", "-o", $dailyPublishRoot, "-v", "minimal") `
            -WorkingDirectory $resolvedDailyRoot
        if (Test-Path -LiteralPath $plannedOfficeExecutablePath) {
            $resolvedOfficeExecutablePath = [System.IO.Path]::GetFullPath($plannedOfficeExecutablePath)
        }
        Add-StepResult -Id "publish-dailydesk" -Label "Publish Office" -Ok $publishResult.Ok -Summary $(if ($publishResult.Ok) { "Published DailyDesk.exe for Runtime Control." } else { "DailyDesk publish failed." }) -Details $publishResult.OutputTail
        if (-not $publishResult.Ok) {
            $canContinue = $false
        }
    }
    elseif ($canContinue) {
        Add-StepResult -Id "publish-dailydesk" -Label "Publish Office" -Ok $false -Summary "DailyDesk project was not found in the configured Daily root." -Details $dailyProjectPath
        $canContinue = $false
    }

    if ($canContinue) {
        $syncArguments = @("-RepoRoot", $resolvedSuiteRoot, "-CodexConfigPath", $CodexConfigPath, "-Json")
        if (-not [string]::IsNullOrWhiteSpace($WorkstationId)) {
            $syncArguments += @("-WorkstationId", $WorkstationId)
        }
        if (-not [string]::IsNullOrWhiteSpace($WorkstationLabel)) {
            $syncArguments += @("-WorkstationLabel", $WorkstationLabel)
        }
        if (-not [string]::IsNullOrWhiteSpace($WorkstationRole)) {
            $syncArguments += @("-WorkstationRole", $WorkstationRole)
        }

        $syncResult = Invoke-SuitePowerShellJsonScript -SuiteRepoRoot $resolvedSuiteRoot -ScriptRelativePath "scripts\sync-suite-workstation-profile.ps1" -Arguments $syncArguments
        $syncOk = [bool]$syncResult.Ok -and $null -ne $syncResult.Payload -and [bool]$syncResult.Payload.ok
        Add-StepResult -Id "apply-workstation-profile" -Label "Apply workstation profile" -Ok $syncOk -Summary $(if ($syncOk) { "Applied the workstation profile for Suite." } else { "Workstation profile apply failed." }) -Details $(if ($syncResult.Payload) { "$($syncResult.Payload.workstationId) | $($syncResult.Payload.workstationLabel) | $($syncResult.Payload.workstationRole)" } else { $syncResult.OutputTail })
        if (-not $syncOk) {
            $canContinue = $false
        }
    }

    if ($canContinue) {
        $officeConfigPath = Write-SuiteCompanionAppLocalConfig -CompanionAppId "office" -Config ([ordered]@{
            executablePath = $resolvedOfficeExecutablePath
            workingDirectory = Split-Path -Parent $resolvedOfficeExecutablePath
            rootDirectory = $resolvedDailyRoot
            configuredAt = (Get-Date).ToString("o")
            configuredBy = "scripts/bootstrap-suite-workstation.ps1"
            suiteRoot = $resolvedSuiteRoot
            dailyRoot = $resolvedDailyRoot
            syncMode = $dailySyncMode
        })

        Add-StepResult -Id "office-config" -Label "Office companion config" -Ok $true -Summary "Wrote the workstation-local Office launch config." -Details $officeConfigPath
    }

    if ($canContinue) {
        $startupInstall = Invoke-SuitePowerShellScript -SuiteRepoRoot $resolvedSuiteRoot -ScriptRelativePath "scripts\install-suite-runtime-startup.ps1" -Arguments @("-RunNow:`$false")
        Add-StepResult -Id "runtime-startup-install" -Label "Runtime startup install" -Ok $startupInstall.Ok -Summary $(if ($startupInstall.Ok) { "Installed Suite Runtime startup." } else { "Runtime startup install failed." }) -Details $startupInstall.OutputTail
    }

    if ($canContinue) {
        $filesystemInstall = Invoke-SuitePowerShellScript -SuiteRepoRoot $resolvedSuiteRoot -ScriptRelativePath "scripts\install-watchdog-filesystem-collector-startup.ps1" -Arguments @()
        Add-StepResult -Id "filesystem-watchdog-install" -Label "Filesystem collector startup" -Ok $filesystemInstall.Ok -Summary $(if ($filesystemInstall.Ok) { "Installed filesystem collector startup." } else { "Filesystem collector startup install failed." }) -Details $filesystemInstall.OutputTail
    }

    $autoCadInstallPath = Get-AutoCadInstallPath
    if ($canContinue -and -not [string]::IsNullOrWhiteSpace($autoCadInstallPath)) {
        $autocadInstall = Invoke-SuitePowerShellScript -SuiteRepoRoot $resolvedSuiteRoot -ScriptRelativePath "scripts\install-watchdog-autocad-collector-startup.ps1" -Arguments @()
        Add-StepResult -Id "autocad-watchdog-install" -Label "AutoCAD collector startup" -Ok $autocadInstall.Ok -Summary $(if ($autocadInstall.Ok) { "Installed AutoCAD collector startup." } else { "AutoCAD collector startup install failed." }) -Details $autocadInstall.OutputTail

        $cadAuthoringInstall = Invoke-SuitePowerShellScript -SuiteRepoRoot $resolvedSuiteRoot -ScriptRelativePath "scripts\install-suite-cad-authoring-plugin.ps1" -Arguments @("-Configuration", "Debug")
        Add-StepResult -Id "cad-authoring-plugin" -Label "Suite CAD authoring plugin" -Ok $cadAuthoringInstall.Ok -Summary $(if ($cadAuthoringInstall.Ok) { "Installed the Suite CAD authoring plugin." } else { "Suite CAD authoring plugin install failed." }) -Details $cadAuthoringInstall.OutputTail
    }
    elseif ($canContinue) {
        Add-StepResult -Id "autocad-optional" -Label "AutoCAD optional setup" -Ok $true -Summary "Skipped AutoCAD-specific startup and plugin setup because AutoCAD was not detected." -Details $null -Warnings @("AutoCAD was not detected on this workstation, so CAD collector and plugin installation were skipped.")
    }

    if ($canContinue) {
        $runtimeBootstrap = Invoke-SuitePowerShellJsonScript -SuiteRepoRoot $resolvedSuiteRoot -ScriptRelativePath "scripts\run-suite-runtime-startup.ps1" -Arguments @("-RepoRoot", $resolvedSuiteRoot, "-Json")
        $runtimeBootstrapOk = [bool]$runtimeBootstrap.Ok -and $null -ne $runtimeBootstrap.Payload
        Add-StepResult -Id "runtime-bootstrap" -Label "Runtime bootstrap" -Ok $runtimeBootstrapOk -Summary $(if ($runtimeBootstrapOk) { "Bootstrapped the local Suite runtime." } else { "Runtime bootstrap reported an issue." }) -Details $(if ($runtimeBootstrap.Payload) { [string]$runtimeBootstrap.Payload.summary } else { $runtimeBootstrap.OutputTail })
    }

    $runtimeStatus = Invoke-SuitePowerShellJsonScript -SuiteRepoRoot $resolvedSuiteRoot -ScriptRelativePath "scripts\get-suite-runtime-status.ps1" -Arguments @("-RepoRoot", $resolvedSuiteRoot, "-Json")
    $runtimeStatusPayload = if ($runtimeStatus.Payload) { $runtimeStatus.Payload } else { $null }
    Add-StepResult -Id "runtime-status" -Label "Runtime health" -Ok ([bool]$runtimeStatus.Ok -and $null -ne $runtimeStatusPayload) -Summary $(if ($runtimeStatusPayload) { [string]$runtimeStatusPayload.overall.text } else { "Runtime status is unavailable." }) -Details $(if ($runtimeStatusPayload) { [string]$runtimeStatusPayload.support.text } else { $runtimeStatus.OutputTail })
}
elseif ($ValidateOnly) {
    Add-StepResult -Id "validation-only" -Label "Validation only" -Ok $canContinue -Summary "Validation completed without cloning, building, or installing startup tasks." -Details "Run without -ValidateOnly to clone/update repos, build DailyDesk, stamp the workstation profile, install startup tasks, and run health checks."
}

$effectiveOfficeExecutablePath = if (Test-Path -LiteralPath $plannedOfficeExecutablePath) {
    [System.IO.Path]::GetFullPath($plannedOfficeExecutablePath)
}
elseif (-not [string]::IsNullOrWhiteSpace($resolvedOfficeExecutablePath)) {
    [System.IO.Path]::GetFullPath($resolvedOfficeExecutablePath)
}
else {
    $null
}

$allWarnings = @(
    $warnings |
        ForEach-Object { $_ }
)
if ($allWarnings.Count -eq 0) {
    $allWarnings = @(
        $steps |
            ForEach-Object { @($_.warnings) } |
            ForEach-Object { $_ } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Select-Object -Unique
    )
}

$result = [pscustomobject]@{
    ok = (@($steps | Where-Object { -not $_.ok }).Count -eq 0)
    validateOnly = [bool]$ValidateOnly
    suiteRoot = $resolvedSuiteRoot
    dailyRoot = $resolvedDailyRoot
    dailySourcePath = $resolvedDailySourcePath
    suiteRepoUrl = $resolvedSuiteRepoUrl
    dailyRepoUrl = $resolvedDailyRepoUrl
    suiteSyncMode = $suiteSyncMode
    dailySyncMode = $dailySyncMode
    officeExecutablePath = $effectiveOfficeExecutablePath
    codexConfigPath = $CodexConfigPath
    prerequisites = @($prerequisites | ForEach-Object { $_ })
    steps = @($steps | ForEach-Object { $_ })
    warnings = @($allWarnings)
    runtimeStatus = $runtimeStatusPayload
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Suite workstation bootstrap"
    Write-Host "Suite root: $resolvedSuiteRoot"
    Write-Host "Daily root: $resolvedDailyRoot"
    if (-not [string]::IsNullOrWhiteSpace($effectiveOfficeExecutablePath)) {
        Write-Host "Office executable: $effectiveOfficeExecutablePath"
    }
    foreach ($step in $steps) {
        $prefix = if ($step.ok) { "[ok]" } else { "[warn]" }
        Write-Host "$prefix $($step.label): $($step.summary)"
        if ($step.details) {
            Write-Host "       $($step.details)"
        }
    }
    foreach ($warning in $warnings) {
        Write-Warning $warning
    }
}

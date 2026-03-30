Set-StrictMode -Version Latest

function ConvertTo-SuiteProcessArgument {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return '""'
    }

    $text = [string]$Value
    if ($text.Length -eq 0) {
        return '""'
    }

    if ($text -notmatch '[\s"]') {
        return $text
    }

    $escaped = $text -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
}

function ConvertTo-SuiteProcessCommandLine {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments
    )

    return [string]::Join(
        " ",
        @(
            (ConvertTo-SuiteProcessArgument -Value $FilePath)
            foreach ($argument in @($Arguments)) {
                ConvertTo-SuiteProcessArgument -Value $argument
            }
        )
    )
}

function ConvertTo-SuiteVbScriptStringLiteral {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return '""'
    }

    return '"' + ([string]$Value -replace '"', '""') + '"'
}

function Get-SuiteWindowsPowerShellExecutablePath {
    return Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
}

function Get-SuiteWindowsScriptHostExecutablePath {
    return Join-Path $env:SystemRoot "System32\wscript.exe"
}

function Write-SuiteHiddenPowerShellLauncher {
    param(
        [Parameter(Mandatory = $true)][string]$LauncherPath,
        [Parameter(Mandatory = $true)][string]$PowerShellScriptPath,
        [string]$WorkingDirectory,
        [string[]]$Arguments
    )

    $launcherDirectory = Split-Path -Parent $LauncherPath
    if (-not [string]::IsNullOrWhiteSpace($launcherDirectory)) {
        New-Item -ItemType Directory -Path $launcherDirectory -Force | Out-Null
    }

    $command = ConvertTo-SuiteProcessCommandLine `
        -FilePath (Get-SuiteWindowsPowerShellExecutablePath) `
        -Arguments (@(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            $PowerShellScriptPath
        ) + @($Arguments))

    $launcherLines = @(
        "Option Explicit",
        "",
        "Dim shell",
        "Set shell = CreateObject(""WScript.Shell"")"
    )

    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
        $launcherLines += "shell.CurrentDirectory = " + (ConvertTo-SuiteVbScriptStringLiteral -Value $WorkingDirectory)
    }

    $launcherLines += "shell.Run " + (ConvertTo-SuiteVbScriptStringLiteral -Value $command) + ", 0, False"

    Set-Content -LiteralPath $LauncherPath -Value $launcherLines -Encoding ASCII
    return $LauncherPath
}

function Start-SuiteDetachedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string]$WorkingDirectory,
        [string[]]$Arguments
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    # Keep detached long-lived services from inheriting the caller's output pipe.
    $startInfo.UseShellExecute = $true
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
        $startInfo.WorkingDirectory = $WorkingDirectory
    }

    $startInfo.Arguments = [string]::Join(
        " ",
        @(foreach ($argument in @($Arguments)) {
            ConvertTo-SuiteProcessArgument -Value $argument
        })
    )

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Failed to start detached process '$FilePath'."
    }

    return $process
}

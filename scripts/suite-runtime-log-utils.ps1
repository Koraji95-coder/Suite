Set-StrictMode -Version Latest

function Remove-SuiteRuntimeAnsiCodes {
    param([AllowNull()][string]$Text)

    if ($null -eq $Text) {
        return ""
    }

    return [Regex]::Replace([string]$Text, "\x1B\[[0-9;?]*[ -/]*[@-~]", "")
}

function Normalize-SuiteRuntimeTranscriptLine {
    param([AllowNull()][string]$Line)

    if ($null -eq $Line) {
        return $null
    }

    $text = [string]$Line
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }

    $text = Remove-SuiteRuntimeAnsiCodes -Text $text
    $text = [Regex]::Replace($text, "[\u0000-\u0008\u000B\u000C\u000E-\u001F]", "")
    $text = [Regex]::Replace($text, "[\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\uFFFD]", " ")
    $text = [Regex]::Replace($text, "[^\u0020-\u007E]", " ")
    $text = [Regex]::Replace($text, "(^|\s)G(?=\s|$)", '$1')
    $text = [Regex]::Replace($text, "(?i)\b(sb_publishable_[A-Za-z0-9._-]+)\b", "[redacted]")
    $text = [Regex]::Replace($text, "(?i)\b(sb_secret_[A-Za-z0-9._-]+)\b", "[redacted]")
    $text = [Regex]::Replace($text, "(?i)(Access Key\s*[:=]?\s*)([A-Za-z0-9._-]+)", '$1[redacted]')
    $text = [Regex]::Replace($text, "(?i)(Secret Key\s*[:=]?\s*)([A-Za-z0-9._-]+)", '$1[redacted]')
    $text = [Regex]::Replace($text, "(?i)(Publishable\s*[:=]?\s*)([A-Za-z0-9._-]+)", '$1[redacted]')
    $text = [Regex]::Replace($text, "(?i)(Secret\s*[:=]?\s*)([A-Za-z0-9._-]+)", '$1[redacted]')
    $text = [Regex]::Replace($text, "\s+", " ").Trim()

    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }

    if ($text -eq "System.Management.Automation.RemoteException") {
        return $null
    }

    if ($text -match "^(?:[Gg]\s*){4,}$" -or $text -match "^[\|\-+=_:. ]+$") {
        return $null
    }

    return $text
}

function Get-SuiteRuntimeTranscriptLines {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace([string]$Text)) {
        return @()
    }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in ([string]$Text -split "`r?`n")) {
        $normalized = Normalize-SuiteRuntimeTranscriptLine -Line $candidate
        if ([string]::IsNullOrWhiteSpace($normalized)) {
            continue
        }

        if ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -eq $normalized) {
            continue
        }

        $lines.Add($normalized)
    }

    return @($lines)
}

function Write-SuiteRuntimeTranscriptEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("SYS", "INFO", "OK", "WARN", "ERR", "START")][string]$Tag = "INFO"
    )

    $lines = @(Get-SuiteRuntimeTranscriptLines -Text $Message)
    if ($lines.Count -eq 0) {
        return
    }

    $directory = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    foreach ($line in $lines) {
        $timestamp = (Get-Date).ToString("o")
        Add-Content -Path $Path -Value "[$timestamp] [$Tag] $line"
    }
}

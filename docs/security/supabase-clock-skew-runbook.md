# Supabase Callback Clock-Skew Warning Runbook (Windows)

## Symptom

Browser or terminal logs can repeat:

```
@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew
```

Example values seen in this workspace:

- `issuedAt=1772946292` -> `2026-03-08 05:04:52 UTC`
- `timeNow=1772946291` -> `2026-03-08 05:04:51 UTC`

This is a benign 1-second delta, but it can still trigger the warning.

## Quick Checks

1. Check local UTC clock:

   ```powershell
   Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
   ```

2. Compare local time with an external Date header:

   ```powershell
   $remote=(Invoke-WebRequest -Uri https://www.google.com -Method Head).Headers.Date
   $local=[DateTimeOffset]::UtcNow
   "Remote UTC: $remote"
   "Local UTC : $($local.ToString('r'))"
   ```

3. Check Windows Time service status:

   ```powershell
   w32tm /query /status
   ```

## If `w32time` Is Not Running

```powershell
Set-Service w32time -StartupType Automatic
Start-Service w32time
w32tm /resync /force
w32tm /query /status
```

If service start fails due policy/permissions, run PowerShell as Administrator.

## App-Side Mitigation

Suite now restricts Supabase callback parsing to auth callback routes and suppresses duplicate callback processing in the same tab, which prevents warning spam when callback fragments are revisited.

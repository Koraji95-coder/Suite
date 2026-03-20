# Supabase Local/Hosted Workflow

Suite now treats local and hosted Supabase as explicit targets instead of one blended runtime.

## Daily Commands

Switch the app to local Supabase:

```powershell
npm run supabase:mode:local
```

Switch the app back to hosted Supabase:

```powershell
npm run supabase:mode:hosted
```

Keep local auth email on Gmail:

```powershell
npm run supabase:mail:gmail
```

Switch local auth email to Mailpit:

```powershell
npm run supabase:mail:mailpit
```

## Guarded Hosted Push

Run the hosted preflight:

```powershell
npm run supabase:remote:target:auto
npm run supabase:remote:login
npm run supabase:remote:preflight
```

Review the dry run:

```powershell
npm run supabase:remote:push:dry
```

Push tracked migrations to hosted Supabase:

```powershell
npm run supabase:remote:push
```

The hosted push is migrations-only. It does not sync:

- auth users
- sessions
- application row data

## Windows Sign-In Preflight

Install the sign-in task once:

```powershell
npm run supabase:remote:task:install
```

Behavior:

- it runs after Windows user logon
- it writes `last-preflight.json`, `last-push.json`, and `supabase-sync.log`
- it does not push to hosted automatically
- it only raises a Windows notification when the hosted preflight fails

Status artifact location by default:

- `%LOCALAPPDATA%\Suite\supabase-sync\`

## Command Center

`/app/command-center` now shows:

- the latest preflight result
- hosted push readiness
- the last hosted push result
- the recent Supabase sync log tail

The command presets in the `Supabase` group remain copy-only. Command Center does not execute shell commands.

## Failure Meaning

If hosted preflight fails:

- hosted CLI auth may be missing
- the remote project may not be linked
- the dry-run push may have failed

If hosted push is blocked but preflight is otherwise okay:

- local mode may be active while local Supabase or the gateway is not healthy
- Command Center will still show the recorded preflight and the current block reason

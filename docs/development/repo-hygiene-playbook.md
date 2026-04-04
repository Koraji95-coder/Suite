# Repo Hygiene Playbook (Safe Mode)

Date: March 2, 2026  
Repo: `Suite`

## Purpose

This playbook cleans tracked build artifacts from git history going forward without deleting your local working files.

This is intentionally conservative:
- No `git reset --hard`
- No `git clean`
- No destructive checkout commands

## Safety Rules (Read First)

1. Use `git rm --cached` only when removing tracked artifacts.
2. Never run `git rm` without `--cached` for this cleanup.
3. Stage only targeted files/paths, not the whole repo.
4. Confirm `git status --short` before committing.

## Current Repo Risks Identified

Tracked generated artifacts include:
- `backend/Transmittal-Builder/core/__pycache__/...`
- `dotnet/named-pipe-bridge/bin/...`
- `dotnet/named-pipe-bridge/obj/...`
- `dotnet/Suite.RuntimeControl/artifacts/publish/...`

These should be ignored and untracked.

## Step-by-Step Cleanup

### 1. Create a safety branch

```bash
git checkout -b chore/repo-hygiene-sweep
```

### 2. Optional snapshot backup (extra safety)

```bash
mkdir -p ../Suite-backups
tar -czf ../Suite-backups/suite-pre-hygiene-$(date +%F-%H%M%S).tar.gz .
```

### 3. Audit currently tracked generated files

```bash
git ls-files | grep -E '__pycache__|\.pyc$|/obj/|/bin/'
```

### 4. Update `.gitignore`

Add these entries (append if missing):

```gitignore
# Python build/runtime artifacts
__pycache__/
*.py[cod]
*.pyo

# .NET build artifacts
**/bin/
**/obj/

# Runtime Control local publish artifacts
dotnet/Suite.RuntimeControl/artifacts/
```

### 5. Untrack generated files (keep local files on disk)

```bash
git rm -r --cached backend/Transmittal-Builder/core/__pycache__
git rm -r --cached dotnet/named-pipe-bridge/bin
git rm -r --cached dotnet/named-pipe-bridge/obj
git rm -r --cached dotnet/Suite.RuntimeControl/artifacts/publish
```

If a path is already untracked, git may print an error for that path; that is fine.

### 6. Stage only hygiene changes

```bash
git add .gitignore
git add -u backend/Transmittal-Builder/core/__pycache__ dotnet/named-pipe-bridge/bin dotnet/named-pipe-bridge/obj dotnet/Suite.RuntimeControl/artifacts/publish
```

### 7. Verify staged changes

```bash
git status --short
```

Expected for this cleanup:
- `M .gitignore`
- `D ...` entries under the generated paths above

### 8. Commit

```bash
git commit -m "chore(repo): stop tracking generated build artifacts"
```

## Rollback / Recovery

If you staged something by mistake:

```bash
git restore --staged <path>
```

If you accidentally modified `.gitignore` incorrectly:

```bash
git restore --source=HEAD -- .gitignore
```

If you accidentally removed a tracked file from working tree:

```bash
git restore --source=HEAD -- <path>
```

## Ongoing Hygiene Checklist

- Keep generated artifacts ignored (`bin`, `obj`, `__pycache__`, `*.pyc`).
- Keep Runtime Control publish output under `dotnet/Suite.RuntimeControl/artifacts/` local-only and untracked.
- Do not commit `.env` or secrets.
- Before PR/commit, run:

```bash
git status --short
git ls-files | grep -E '__pycache__|\.pyc$|/obj/|/bin/|Suite\.RuntimeControl/artifacts/publish/' || true
```

- If generated files appear again in `git status`, repeat the untrack step with `--cached`.

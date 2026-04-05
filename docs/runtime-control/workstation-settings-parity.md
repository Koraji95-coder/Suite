# Workstation Settings Parity

Date: April 5, 2026

Use this to keep `DEV-HOME` and `DEV-WORK` functionally identical without trying to copy machine-only state that should stay local.

## Target State

- VS Code user configuration stays in sync across machines, excluding extensions
- Codex shared defaults live in the repo so they follow Git
- Codex workstation identity and machine-local MCP env stay in `%USERPROFILE%\.codex\config.toml`
- Local mirror/restore remains the offline fallback for machine-local settings and session metadata

## Canonical Workstation IDs

- Home workstation: `DEV-HOME`
- Work workstation: `DEV-WORK`

Re-stamp the local workstation explicitly when needed:

```powershell
npm run workstation:sync -- -WorkstationId DEV-HOME
npm run workstation:sync -- -WorkstationId DEV-WORK
```

## VS Code

Primary path:

1. Turn on VS Code Settings Sync.
2. Keep these sync categories enabled:
   - Settings
   - Keyboard shortcuts
   - User snippets
   - User tasks
   - UI State
   - Profiles
3. Exclude `Extensions`.
4. Rename the synced machine entries in VS Code to `DEV-HOME` and `DEV-WORK`.

Local fallback path:

- `npm run workstation:mirror` now mirrors these VS Code user assets from `%APPDATA%\Code\User`:
  - `settings.json`
  - `keybindings.json`
  - `tasks.json`
  - `snippets/`
  - `profiles/`
- `npm run workstation:restore -- -WorkstationId <TARGET_ID>`

Use `DEV-HOME` on the home workstation and `DEV-WORK` on the work workstation.

What not to mirror:

- installed extensions
- `workspaceStorage/`
- `globalStorage/`
- `History/`

Those are intentionally machine-specific, noisy, or auth/cache heavy.

## Codex

Shared repo-level defaults now live in:

- `.codex/config.toml`

Use that file for stable shared settings such as:

- default model
- reasoning effort
- personality
- portable, non-machine-specific MCP server definitions
- repo-scoped feature flags

Machine-local Codex state still lives in:

- `%USERPROFILE%\.codex\config.toml`

That user-level file is still the right place for:

- `suite_repo_mcp` server config, because it carries workstation env and absolute paths
- workstation identity env (`SUITE_WORKSTATION_ID`, label, role)
- machine-specific absolute paths
- personal/global MCP servers outside this repo
- auth/session storage

The current repo scripts already support that split:

- `npm run workstation:sync` re-stamps the machine-local workstation block
- `npm run workstation:mirror` copies local Codex config, skills, session index, and recent session files into the mirror root
- `npm run workstation:restore` restores that local Codex state on the destination machine

## Recommended Flow

### Normal day-to-day parity

1. Keep VS Code Settings Sync enabled with `Extensions` excluded.
2. Keep this repo trusted in Codex so `.codex/config.toml` loads.
3. Re-run `npm run workstation:sync -- -WorkstationId DEV-HOME` or `DEV-WORK` after any workstation-profile change.
4. `workstation:sync` now preserves the current repo/global Git identity unless you explicitly pass `-GitUserName` or `-GitUserEmail`.

### Before switching machines

```powershell
npm run workstation:mirror
```

### After switching machines

```powershell
npm run workstation:restore -- -WorkstationId <TARGET_ID>
```

Use `DEV-HOME` on the home workstation and `DEV-WORK` on the work workstation.

## Practical Rule

If a setting should be identical on both machines, prefer one of these homes, in this order:

1. repo `.codex/config.toml`
2. VS Code built-in Settings Sync
3. workstation mirror/restore fallback

If a setting contains absolute paths, machine identity, startup tasks, or auth, keep it machine-local and let `workstation:sync` regenerate it.

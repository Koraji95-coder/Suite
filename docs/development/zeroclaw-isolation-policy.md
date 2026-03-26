# ZeroClaw Removal Policy

The old `zeroclaw-main` subtree has been removed from the active Suite repo.

## What this means

- Suite web, backend, scripts, and Runtime Control must not depend on `zeroclaw-main/web` or other old ZeroClaw workshop artifacts.
- Adopted ideas from ZeroClaw must live in Suite-native modules only.
- Historical references are allowed only in migration/adoption notes under `docs/development/zeroclaw-*.md`.

## Allowed relationship

- the default Suite-native gateway owns the external passkey callback bridge at `GET /suite/passkey/callback`
- runtime/bootstrap scripts may detect and stop stale legacy gateway processes so old installs do not drift back into active use
- historical docs may describe what was extracted and why the subtree was removed

## Blocked relationship

- no imports or direct references to `zeroclaw-main/web` inside Suite codepaths
- no reuse of `agent-office.html` or other ZeroClaw workshop artifacts inside Suite codepaths
- no reintroduction of the removed subtree into the active repo

## Guardrail

The repo enforces this with:

- `scripts/guard-zeroclaw-isolation.mjs`
- `scripts/guard-zeroclaw-removed.mjs`

Those guards keep ZeroClaw references out of active Suite codepaths and ensure the removed subtree does not come back.

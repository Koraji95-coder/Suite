# Gateway Stability Policy (Suite)

## Purpose

Lock one stable operational path for gateway work so MCP/Codex sessions stop re-deciding launch strategy and stop accumulating speculative workarounds.

## Locked Default

- Default launch path: Suite-native gateway (`scripts/suite-agent-gateway.mjs`)
- Canonical command: `npm run gateway:dev`
- Legacy ZeroClaw CLI fallback is retired from the active Suite workflow.
- If a legacy process is detected, stop it and relaunch `npm run gateway:dev`.
- Do not reintroduce legacy gateway launchers or runtime toggles into active Suite tooling.

## Deterministic Decision Tree

1. Start on default path.
   - Run: `npm run gateway:dev`
2. If gateway starts, continue normal development.
3. If gateway status reports an unexpected legacy process mode:
   - stop the detected legacy process,
   - relaunch `npm run gateway:dev`,
   - confirm runtime status returns to `Suite-native`.
4. Historical rust/toolchain failures from the retired legacy CLI path stay archived as diagnostics only.

## Path Definitions

- `npm run gateway:dev`
  - launches the Suite-native gateway
- legacy launcher
  - removed from the active Suite workflow
  - any remaining legacy process should be treated as stale drift, not a supported mode

## Incident Protocol (Compiler/Toolchain Instability)

Capture this once per incident window if a historical legacy diagnostic is being reviewed:

1. Toolchain versions:
   - `rustc --version`
   - `cargo --version`
   - `rustup show active-toolchain`
2. Launch path and command used:
   - default or diagnostic
   - exact command line
3. Failure signature:
   - first panic/ICE line
   - crash code/signature (`0xc0000005`, stack overflow, ICE identifier)
4. Classification:
   - `compiler/toolchain instability` when signatures match above.
5. Resolution action:
   - keep the live runtime on `npm run gateway:dev`.

## Upstream Escalation Rule

Open upstream report only when a minimal reproducible diagnostic capture exists:

- reproducible command
- minimal code path or crate set
- toolchain versions
- signature/backtrace excerpt

If minimal repro is not available, do not churn local workaround flags in active feature sessions.

## Adjacent Auth-Noise Guidance

Supabase callback warning spam can look operationally noisy but is not a gateway-build signal.

- Runbook: `docs/security/supabase-clock-skew-runbook.md`
- Do not trigger gateway workaround cycles from clock-skew warning noise alone.

## Handoff Requirements

Every MCP/Codex handoff should state:

1. selected gateway path (`default` or `diagnostic`),
2. exact command used,
3. rust/toolchain evidence (if incident occurred),
4. failure signature and classification (if incident occurred),
5. confirmation that session returned to default path for ongoing work.

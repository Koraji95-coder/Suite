# Gateway Stability Policy (Suite)

## Purpose

Lock one stable operational path for gateway work so MCP/Codex sessions stop re-deciding launch strategy and stop accumulating speculative workarounds.

## Locked Default

- Default launch path: `zeroclaw-gateway`
- Canonical command: `npm run gateway:dev`
- Full CLI path (`zeroclaw gateway`) is incident-only diagnostics, not a daily alternative.
- Diagnostic toggle: `SUITE_GATEWAY_USE_FULL_CLI=1 npm run gateway:dev`

## Deterministic Decision Tree

1. Start on default path.
   - Run: `npm run gateway:dev`
2. If gateway starts, continue normal development.
3. If gateway fails and diagnostics are explicitly needed:
   - Run: `SUITE_GATEWAY_USE_FULL_CLI=1 npm run gateway:dev`
4. If full CLI diagnostic compile fails with rustc crash signatures (stack overflow, `0xc0000005`, ICE):
   - capture evidence once,
   - classify as compiler/toolchain instability,
   - stop workaround iteration,
   - return to default path (`npm run gateway:dev`).
5. Do not stack speculative build-flag changes in-session after classification.

## Incident Protocol (Compiler/Toolchain Instability)

Capture this once per incident window:

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
   - revert to default path and continue work.

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

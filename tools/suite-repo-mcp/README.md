# Suite Repo MCP Server

Repo-native MCP server for coding workflows in this repository.

Server name (to avoid conflicts): `suite_repo_mcp`

## What it provides

### Build/Test
- `repo.run_tests`
- `repo.run_typecheck`
- `repo.run_lint_fix` (Biome)

### Code intelligence
- `repo.search`
- `repo.find_symbol_usages`
- `repo.dependency_graph` (simple import graph + Mermaid output)

### Project conventions
- `repo.generate_component`
- `repo.generate_route`
- `repo.generate_db_migration`

### Observability
- `repo.add_structured_log`
- `repo.add_error_boundary`
- `repo.add_api_error_wrapper`

### Prompt templates
- `repo.pr_description`
- `repo.commit_message`
- `repo.test_plan`
- `repo.suite_guardrails`
- `repo.agent_profile_playbook`
- `repo.agent_orchestration_runbook`
- `repo.agent_handoff_packet`

### Verification
- `repo.verify_agent_routing_guardrails`

## Location

- Server entry: `tools/suite-repo-mcp/server.mjs`
- Server package: `tools/suite-repo-mcp/package.json`

## Codex config snippet

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.suite_repo_mcp]
command = "node"
args = ["/workspaces/Suite/tools/suite-repo-mcp/server.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 180
```

If your Codex build requires RMCP client mode for MCP servers, enable this once:

```toml
[features]
rmcp_client = true
```

Then restart Codex.

## Notes

- The server only operates inside this repo root (`/workspaces/Suite`).
- Tooling is aligned to your stack (`Biome`, `TypeScript`, `Flask`, `Supabase SQL`).
- No Git push/commit automation is included.
- `repo.generate_route` intentionally does not auto-edit `src/App.tsx`; it returns a registration hint.

## Example tool calls

- Typecheck all:
  - `repo.run_typecheck` with `{ "scope": "all" }`
- Biome autofix for frontend route files:
  - `repo.run_lint_fix` with `{ "scope": "src/routes" }`
- Search auth passkey code:
  - `repo.search` with `{ "pattern": "passkey", "paths": ["src", "backend"] }`
- Generate protected route scaffold:
  - `repo.generate_route` with `{ "name": "Drawing Audit", "auth_policy": "protected" }`
- Add structured log after a marker:
  - `repo.add_structured_log` with
    `{ "file": "src/routes/LoginPage.tsx", "event_name": "auth.login.submit", "fields": { "flow": "email-link" }, "insert_after": "const onSubmit = async () => {" }`

## Safety and behavior details

- `repo.add_structured_log` edits files only when `insert_after` marker is provided.
- `repo.add_error_boundary` creates a wrapper file and does not mutate the original page.
- `repo.add_api_error_wrapper` ensures `backend/api_error_helpers.py` exists and decorates a target Flask route function.

## Monorepo conflict avoidance

- Uses unique MCP server id: `suite_repo_mcp`.
- Lives under `tools/suite-repo-mcp` and does not replace existing tooling.
- Does not register itself automatically into any shared config in this repo.

## Suite handoff defaults

Future Codex sessions should preserve the repository guardrails in `AGENTS.md`, especially:

- no Tailwind usage in Suite app paths,
- no major auth-flow changes without explicit approval,
- AutoCAD error envelope + `requestId` observability contract,
- profile-based agent model routing with configured fallback models.

Gateway policy is locked for handoffs and MCP usage:

- default path: `zeroclaw-gateway` via `npm run gateway:dev`,
- full CLI path (`zeroclaw gateway`) is incident-only diagnostics,
- diagnostics command: `SUITE_GATEWAY_USE_FULL_CLI=1 npm run gateway:dev`,
- if full CLI rustc compile fails with stack overflow, `0xc0000005`, or ICE:
  - capture toolchain versions + failure signature once,
  - classify as compiler/toolchain instability,
  - stop workaround iteration and continue on default gateway path.
- upstream bug report only after collecting a minimal reproducible diagnostic capture.

Runbooks:

- gateway decision tree and incident protocol: `docs/development/gateway-stability-policy.md`
- Supabase callback warning noise handling: `docs/security/supabase-clock-skew-runbook.md`

## Parallel agent run operator flow

Use backend orchestration endpoints to run agents while coding continues in parallel:

1. `POST /api/agent/runs`
- body: `objective`, `profiles[]`, optional `synthesisProfile`, `context`, `timeoutMs`
2. `GET /api/agent/runs/:runId`
- poll for current step/status snapshot
3. `GET /api/agent/runs/:runId/events`
- SSE stream for live progress
4. `POST /api/agent/runs/:runId/cancel`
- cancel in-flight background run

Recommended startup checks before orchestration:

1. `repo.verify_agent_routing_guardrails`
2. `repo.run_typecheck` with `{ \"scope\": \"all\" }`
3. `repo.run_tests` with a focused target for changed modules

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
- `repo.ui_semantics_sweep`
- `repo.suite_guardrails`
- `repo.agent_profile_playbook`
- `repo.agent_orchestration_runbook`
- `repo.agent_handoff_packet`

### Verification
- `repo.verify_agent_routing_guardrails`

### Resources
- `repo://docs/development/autocad-electrical-2026-project-flow`
- `repo://docs/development/autocad-electrical-2026-autolisp-api-reference` (generated from `ACE_API.chm` plus local ACADE asset inventory)
- `repo://docs/development/autocad-electrical-2026-installation-context`
- `repo://docs/development/autocad-electrical-2026-installation-context-yaml`
- `repo://docs/development/autocad-electrical-2026-lookup-index`
- `repo://docs/development/autocad-electrical-2026-regression-fixtures`
- `repo://docs/development/autocad-electrical-2026-suite-integration-playbook`
- `repo://docs/development/autocad-electrical-2026-reference-pack`

## Location

- Server entry: `tools/suite-repo-mcp/server.mjs`
- Server package: `tools/suite-repo-mcp/package.json`

## Codex config sync

Preferred local setup on the workstation:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1
```

The canonical workstation profile source lives in `tools/suite-repo-mcp/workstation-profiles.json`.
Human-facing matrix notes live in `docs/runtime-control/mcp-workstation-matrix.md`.
This sync script is the only supported path for stamping `mcp_servers.suite_repo_mcp.env`.

To preview the generated MCP block without writing `~/.codex/config.toml`:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -PrintToml
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
- Optional workstation identity env vars are supported: `SUITE_WORKSTATION_ID`, `SUITE_WORKSTATION_LABEL`, `SUITE_WORKSTATION_ROLE`.
- Optional Autodesk offline help env var is supported: `SUITE_AUTODESK_OFFLINE_HELP_ROOT`.
- `repo.check_suite_workstation` provides a combined workstation doctor payload (`ok/workstation/backend/filesystemCollector/autocadCollector/autocadPlugin/autocadReadiness/issues/recommendedActions`).
- The sync helper also stamps explicit Watchdog filesystem, AutoCAD, plugin, readiness, and backend startup metadata into `mcp_servers.suite_repo_mcp.env`.
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
- Generate UI form/dialog semantics checklist:
  - `repo.ui_semantics_sweep` with `{ "scope": "src/components src/routes" }`
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
- deterministic profile-based single-model routing (no fallback retries).

Gateway policy is locked for handoffs and MCP usage:

- default path: Suite-native gateway via `npm run gateway:dev`,
- legacy ZeroClaw CLI fallback is retired from the active workflow,
- if runtime status detects an unexpected legacy gateway process, stop it and relaunch `npm run gateway:dev`,
- historical rust/toolchain failures from the retired path should stay archived as diagnostics only.
- upstream bug report only after collecting a minimal reproducible diagnostic capture.

Local Ollama startup gate is required before booting conversations or orchestration:

1. Run `npm run gateway:dev` (canonical path).
2. Confirm gateway startup logs show `provider=ollama` and `mode=local`.
3. Confirm gateway preflight reports all required profile models are available.
4. If preflight reports missing models, stop and pull missing models before starting agent conversation or orchestration.

Default required model pack (unless overridden):

- `gemma3:12b`
- `devstral-small-2:latest`
- `qwen2.5-coder:14b`
- `qwen3:14b`
- `joshuaokolo/C3Dv0:latest`
- `ALIENTELLIGENCE/electricalengineerv2:latest`

Override rule:

- If `AGENT_MODEL_*` and/or `VITE_AGENT_MODEL_*` model routing values are changed, those configured model IDs replace the defaults above and become the required pull set.

Conversation start policy:

- "Starting conversation" includes both single-agent interaction and orchestration run creation.

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

1. `npm run gateway:dev`
2. Confirm startup logs include `provider=ollama` and `mode=local`.
3. Confirm preflight reports all required profile models are available.
4. If any model is missing, stop and run `ollama pull <model>` for each missing model before proceeding.
5. `repo.verify_agent_routing_guardrails`
6. `repo.run_typecheck` with `{ \"scope\": \"all\" }`
7. `repo.run_tests` with a focused target for changed modules

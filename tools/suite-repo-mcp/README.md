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

# MCP Workstation Matrix

Canonical workstation profile data lives in `tools/suite-repo-mcp/workstation-profiles.json`.

Use the profile sync script to rewrite the local `suite_repo_mcp` block in `%USERPROFILE%\.codex\config.toml`:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTIN-HOME
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTIN-WORK
```

If you want to preview the generated MCP block without writing `config.toml`, use:

```powershell
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sync-suite-workstation-profile.ps1 -WorkstationId DUSTIN-WORK -PrintToml
```

Restart Codex after any MCP config change.

`scripts/sync-suite-workstation-profile.ps1` is the only supported path for stamping `mcp_servers.suite_repo_mcp.env`. Avoid manual edits to the MCP env block.

## Profiles

| Workstation ID | Computer names | Label | Role |
| --- | --- | --- | --- |
| `DUSTIN-WORK` | `DUSTIN-WORK` | `Dustin Work station` | `work` |
| `DUSTIN-HOME` | `DUSTIN-HOME` | `Dustin Home station` | `home` |

If a machine is not listed in the matrix, the sync helper falls back to:

- `workstationId = COMPUTERNAME`
- `workstationLabel = "<Computer Name> workstation"`
- `workstationRole = secondary`

## Tools

### Repo Workflow Tools

| Tool | Description |
| --- | --- |
| `repo.run_check` | Full `npm run check` pipeline (guards, lint, typecheck) |
| `repo.run_tests` | Run tests with auto-detected or explicit runner |
| `repo.run_typecheck` | Frontend, backend, or all type/syntax checks |
| `repo.run_lint_fix` | Biome lint+format autofix |
| `repo.env_check` | Env parity check |
| `repo.docs_manifest_verify` | Docs manifest verification |
| `repo.architecture_verify` | Architecture model verification |

### Code Navigation Tools

| Tool | Description |
| --- | --- |
| `repo.search` | Ripgrep-powered regex search |
| `repo.find_symbol_usages` | Word-boundary symbol search |
| `repo.dependency_graph` | TS/JS import graph with Mermaid output |
| `repo.read_file` | Read a repo-relative file (max 512 KB) |
| `repo.list_directory` | List directory tree with configurable depth |
| `repo.git_status` | Current branch and working tree status |
| `repo.git_log` | Recent commit log (oneline) |

### Code Generation Tools

| Tool | Description |
| --- | --- |
| `repo.generate_component` | React component scaffold |
| `repo.generate_route` | Route scaffold (protected/public) |
| `repo.generate_db_migration` | Supabase SQL migration scaffold |
| `repo.add_structured_log` | Structured log insertion |
| `repo.add_error_boundary` | Error boundary wrapper |
| `repo.add_api_error_wrapper` | Flask API error wrapper |

### Workstation Health Tools

| Tool | Description |
| --- | --- |
| `repo.get_workstation_context` | Current workstation identity |
| `repo.check_suite_workstation` | Combined workstation doctor |
| `repo.check_watchdog_collector_startup` | Filesystem collector startup |
| `repo.check_watchdog_autocad_collector_startup` | AutoCAD collector startup |
| `repo.check_watchdog_autocad_plugin` | AutoCAD plugin install check |
| `repo.check_watchdog_autocad_readiness` | AutoCAD readiness doctor |
| `repo.check_watchdog_backend_startup` | Backend API server startup |

## Prompts

| Prompt | Description |
| --- | --- |
| `repo.pr_description` | Structured PR description |
| `repo.commit_message` | Conventional commit message |
| `repo.test_plan` | Test plan scaffold |
| `repo.ui_semantics_sweep` | UI semantics audit |
| `repo.suite_guardrails` | Suite guardrails reference |
| `repo.workstation_context` | Workstation identity summary |
| `repo.handoff_context` | Cold-start session handoff |
| `repo.code_review` | Structured code review with guardrails |
| `repo.tranche_planning` | Tranche planning with backlog docs |

## Resources

### AutoCAD Electrical 2026

| Resource URI | Description |
| --- | --- |
| `repo://docs/development/autocad-electrical-2026-project-flow` | Project flow reference |
| `repo://docs/development/autocad-electrical-2026-autolisp-api-reference` | AutoLISP API reference |
| `repo://docs/development/autocad-electrical-2026-reference-pack` | Combined reference pack |
| `repo://docs/development/autocad-electrical-2026-installation-context` | Installation context |
| `repo://docs/development/autocad-electrical-2026-installation-context-yaml` | Install context (YAML) |
| `repo://docs/development/autocad-electrical-2026-lookup-index` | Lookup database index |
| `repo://docs/development/autocad-electrical-2026-regression-fixtures` | Regression fixtures |
| `repo://docs/development/autocad-electrical-2026-suite-integration-playbook` | Integration playbook |

### Suite Project Docs

| Resource URI | Description |
| --- | --- |
| `repo://docs/development/long-term-overhaul-todo-plan` | Master overhaul backlog |
| `repo://docs/development/post-bridge-tranche-handoff` | Latest tranche handoff |
| `repo://docs/app-feature-roadmap-opinions` | Product roadmap |
| `repo://docs/runtime-control/mcp-workstation-matrix` | This document |
| `repo://docs/runtime-control/workstation-bringup` | Bring-up guide |
| `repo://docs/security/auth-architecture-canonical` | Auth architecture |
| `repo://docs/development/documentation-structure` | Doc structure guide |
| `repo://docs/deep-repo-hardening-backlog` | Hardening backlog |

## Optional Companion MCP Servers

These can be added to `config.toml` alongside `suite_repo_mcp`. See `tools/suite-repo-mcp/examples/dustin-home-workstation.toml` for the full reference config.

### Core Companions

| Server | What it adds |
| --- | --- |
| `@modelcontextprotocol/server-github` | Issues, PRs, commits, repo browsing |
| `@modelcontextprotocol/server-filesystem` | Sandboxed file read/write/search |
| `@modelcontextprotocol/server-fetch` | Web page retrieval for docs/reference |
| `@modelcontextprotocol/server-memory` | Persistent cross-session knowledge |
| `chrome-devtools-mcp` | Live browser inspection/debugging |

### Future / ML / Data Science Companions

| Server | When to activate | What it adds |
| --- | --- | --- |
| `jupyter-mcp-server` | ML pilot lane active | Notebook execution, kernel management |
| `@modelcontextprotocol/server-postgres` | Direct Supabase introspection needed | SQL queries, schema browsing |
| `@modelcontextprotocol/server-docker` | Container management needed | Docker lifecycle, logs, exec |

## Future-Proofing: ML & Data Science

Suite's ML roadmap is documented in `docs/backend/local-learning-opportunities.md`. The recommended stack order:

### Stack Progression

| Technology | When to use | Suite domain |
| --- | --- | --- |
| **scikit-learn** (installed) | First. Tabular features, small datasets, fast training | `transmittal_titleblock`, `autodraft_replacement`, watchdog anomaly |
| **PyTorch** | Second. Image crops, multi-modal, sequence modeling | `autodraft_markup`, title-block crop classification |
| **TensorFlow/Keras** | Alternative to PyTorch when TFLite/Keras deployment matters | Same domains as PyTorch |
| **Anaconda/conda** | ML dependencies conflict with Flask API deps | Environment isolation for training workloads |
| **Jupyter** | Training experimentation, model evaluation | All ML domains |
| **pandas** (installed) | Tabular data wrangling for ML features | All ML domains |
| **NumPy** | Core numerical operations | All ML domains |

### MCP Tools for ML Work

| Tool | Description |
| --- | --- |
| `repo.check_python_env` | Check Python version, ML packages, conda, Jupyter availability |
| `repo.run_python_tests` | Run pytest on backend/ML tests |
| `repo.run_backend_tests` | Run unittest discovery on backend modules |

### MCP Prompts for ML Work

| Prompt | Description |
| --- | --- |
| `repo.ml_pilot_planning` | Planning prompt with ML stack order, domains, and guardrails |

### MCP Resources for ML Work

| Resource URI | Description |
| --- | --- |
| `repo://docs/backend/local-learning-opportunities` | Concrete ML opportunities and stack recommendations |
| `repo://docs/development/post-overhaul-feature-backlog` | Where ML fits in the feature backlog |

## Future-Proofing: Autodesk API & AutoCAD

Suite's AutoCAD integration spans COM bridge, .NET plugin, and potential cloud API work. The relevant MCP surfaces:

### Current AutoCAD Integration Points

| Layer | Technology | Status |
| --- | --- | --- |
| COM/pywin32 bridge | Flask → AutoCAD process | Active, stable |
| .NET plugin (WatchdogCadTracker) | In-process ObjectARX/.NET | Active, production |
| Named-pipe bridge | .NET ↔ Python IPC | Opt-in, manual only |
| AutoLISP/Visual LISP | In-process scripting | Reference only |

### Future Autodesk API Considerations

| API | What it enables | When to pursue |
| --- | --- | --- |
| **APS Design Automation** | Headless batch CAD processing in the cloud | When a concrete batch use case exists (plot-to-PDF, metadata extraction) |
| **APS Model Derivative** | Cloud-based model translation and viewing | When web-based DWG viewing is needed |
| **APS Viewer** | Embeddable 3D/2D viewer for web | When in-browser CAD preview becomes a product lane |
| **AutoCAD .NET API (ObjectARX)** | Deep in-process plugin beyond WatchdogCadTracker | When new plugin features are needed |
| **AutoCAD Electrical API** | ACADE-specific commands (AEPROJECT, etc.) | Active via integration playbook |

### MCP Prompts for Autodesk Work

| Prompt | Description |
| --- | --- |
| `repo.autodesk_api_planning` | Planning prompt with integration architecture and API landscape |

### MCP Resources for Autodesk Work

| Resource URI | Description |
| --- | --- |
| `repo://docs/cad/autodesk-local-install-reference` | Local install inventory and sample assets |
| `repo://docs/cad/coordinates-grabber-api` | Flask-to-COM bridge reference |
| `repo://docs/cad/autodesk-standards-checker-comparison` | Standards checking comparison |

## Codex CLI Quick Reference

When launching Codex for advanced Suite tasks, use these extras:

```bash
# Full-auto mode with filesystem write permissions
codex --approval-mode full-auto --sandbox-permissions filesystem:write

# Fast iteration (lint, type, small fixes)
codex --model o4-mini

# Complex refactors, architecture changes
codex --model o3

# MCP-aware invocation (loads all suite_repo_mcp tools)
codex --mcp-config %USERPROFILE%\.codex\config.toml
```

## Deterministic Naming Rules

- Filesystem collector id: `watchdog-fs-{slug(workstationId)}`
- Filesystem config path: `%LOCALAPPDATA%\Suite\watchdog-collector\config\{workstationId}.json`
- Filesystem startup task/run key: `SuiteWatchdogFilesystemCollector-{workstationId}`
- Filesystem startup check task: `SuiteWatchdogFilesystemCollectorCheck-{workstationId}`
- Filesystem mutex: `Local\SuiteWatchdogFilesystemCollectorDaemon-{slug(workstationId)}`
- AutoCAD collector id: `autocad-{slug(workstationId)}`
- AutoCAD config path: `%LOCALAPPDATA%\Suite\watchdog-autocad-collector\config\{workstationId}-autocad.json`
- AutoCAD state path: `%APPDATA%\CadCommandCenter\tracker-state.json`
- AutoCAD buffer dir: `%LOCALAPPDATA%\Suite\watchdog-autocad-collector\autocad-{slug(workstationId)}`
- AutoCAD startup task/run key: `SuiteWatchdogAutoCADCollector-{workstationId}`
- AutoCAD startup check task: `SuiteWatchdogAutoCADCollectorCheck-{workstationId}`
- AutoCAD mutex: `Local\SuiteWatchdogAutoCADCollectorDaemon-{slug(workstationId)}`

The sync helper also stamps the repo-local watchdog check scripts and the AutoCAD plugin bundle root into `mcp_servers.suite_repo_mcp.env`.

## Combined Workstation Doctor

Use `repo.check_suite_workstation` to run backend/filesystem collector/AutoCAD collector/plugin/readiness checks in one call. The payload is normalized as:

- `ok`
- `workstation`
- `backend`
- `filesystemCollector`
- `autocadCollector`
- `autocadPlugin`
- `autocadReadiness`
- `issues[]`
- `recommendedActions[]`

# Backend Route Groups

This folder is the domain split for `backend/api_server.py`.

## Current extracted groups

- `api_backup.py`: `/api/backup/*`
- `api_batch_find_replace.py`: `/api/batch-find-replace/*`
- `api_watchdog.py`: `/api/watchdog/*`
- `api_autodraft.py`: `/api/autodraft/*` (including `/compare/prepare` and `/compare`)
- `api_auth_email.py`: `/api/auth/email-link`
- `api_auth_passkey.py`: `/api/auth/passkey*`
- `api_passkey_helpers.py`: shared passkey utility + state-store helpers
- `api_passkey_signature.py`: shared passkey callback signature/timestamp helpers
- `api_passkey_store.py`: shared passkey Supabase CRUD helpers
- `api_supabase_rest.py`: shared Supabase REST transport/helpers
- `api_supabase_auth.py`: shared Supabase auth helpers (email-link, magic-link, token verify)
- `api_auth_decorators.py`: shared auth decorators (`require_supabase_user`, `require_agent_session`)
- `api_auth_identity.py`: shared auth identity/header helpers (`_get_bearer_token`, `_get_supabase_user_id`, `_get_supabase_user_email`)
- `api_agent_session.py`: shared agent session lifecycle helpers (`_create_agent_session`, `_get_agent_session`, `_clear_agent_session_for_request`)
- `api_agent_pairing_challenge.py`: shared pairing challenge state helpers (`_purge_expired_agent_pairing_challenges`, `_create_agent_pairing_challenge`, `_consume_agent_pairing_challenge`)
- `api_agent_abuse_controls.py`: shared agent pairing abuse/rate-control helpers (`_is_agent_pairing_action_allowed`, `_is_agent_pairing_confirm_blocked`, `_register_agent_pairing_confirm_failure`, `_clear_agent_pairing_confirm_failures`)
- `api_agent_config.py`: shared static agent config validation (`_agent_broker_config_status`)
- `api_agent_profiles.py`: shared agent-profile model catalog helpers (defaults + env overrides + route resolution)
- `api_supabase_jwks.py`: shared Supabase JWT/JWKS support helpers (`_looks_like_uuid`, `_get_supabase_jwks_client`)
- `api_passkey_capability.py`: shared passkey rollout/config status helper (`_auth_passkey_capability`)
- `api_auth_email_abuse.py`: shared auth-email abuse/rate-control helpers (`_auth_email_key`, `_auth_email_ip_key`, `_compact_auth_email_state`, `_is_auth_email_request_allowed`)
- `api_auth_email_support.py`: shared auth-email support helpers (`_auth_email_generic_response`, `_apply_auth_email_response_floor`, `_verify_turnstile_token`)
- `api_email_validation.py`: shared email validation helper (`_is_valid_email`)
- `api_passkey_origin.py`: shared passkey origin/RP helpers (`_normalize_origin`, `_normalize_absolute_http_url`, `_normalized_auth_passkey_allowed_origins`, `_is_valid_webauthn_rp_id_for_origin`)
- `api_auth_redirect.py`: shared auth redirect URL helpers (`_build_auth_redirect_url`, `_build_external_passkey_redirect`)
- `api_passkey_request_context.py`: shared passkey request-context helpers (`_resolve_passkey_webauthn_expected_origin`, `_options_to_json_dict`)
- `api_auth_redirect_signature.py`: shared passkey callback signature helpers (`_build_passkey_callback_signature_payload`, `_normalize_passkey_callback_timestamp`, `_verify_passkey_callback_signature`)
- `api_passkey_state.py`: shared passkey state helpers (`_create_passkey_callback_state`, `_consume_passkey_callback_state`, `_get_passkey_callback_state`, `_create_passkey_webauthn_state`, `_consume_passkey_webauthn_state`)
- `api_passkey_formatting.py`: shared passkey value/credential normalization helpers (`_normalize_passkey_transports`, `_normalize_passkey_friendly_name`, `_extract_passkey_credential_id`, `_coerce_webauthn_enum_value`)
- `api_passkey_store_access.py`: shared passkey store-access wrappers (`_fetch_active_passkeys_for_user_id`, `_fetch_active_passkey_by_credential_id`, `_insert_user_passkey_row`, `_update_user_passkey_row`)
- `api_supabase_service_request.py`: shared Supabase service request wrappers (`_supabase_rest_base_url`, `_supabase_service_rest_headers`, `_extract_supabase_error_message`, `_supabase_service_rest_request`)
- `api_supabase_auth_access.py`: shared Supabase auth-access wrappers (`_send_supabase_email_link`, `_generate_supabase_magic_link_url`, `_verify_supabase_user_token`)
- `api_websocket_status.py`: shared websocket status bridge + payload helpers (`websocket_status_bridge`, `websocket_connected_payload`, `websocket_status_payload`)
- `api_bootstrap_banner.py`: shared startup/banner printing helpers for server bootstrap (`startup_banner_lines`, `initial_manager_status_lines`, `print_startup_banner`, `print_initial_manager_status`)
- `api_server_entrypoint.py`: shared server launch orchestration helpers (`resolve_api_host`, `resolve_api_port`, `run_server_entrypoint`)
- `api_autocad_export_excel.py`: shared AutoCAD coordinate Excel export helper (`export_points_to_excel`)
- `api_autocad_entity_geometry.py`: shared AutoCAD entity geometry helpers (`_entity_bbox`, `_poly_centroid`, `_entity_center`)
- `api_autocad_reference_block.py`: shared AutoCAD reference-block helpers (`default_ref_dwg_path`, `ensure_block_exists`, `insert_reference_block`, `add_point_label`)
- `api_autocad_com_helpers.py`: shared AutoCAD COM utility helpers (`com_call_with_retry`, `wait_for_command_finish`, `ensure_layer`, `pt`)
- `api_autocad_connection.py`: shared AutoCAD connection/dispatch helpers (`dyn`, `connect_autocad`)
- `api_autocad_ground_grid_plot.py`: shared ground-grid plotting helpers (grid-to-AutoCAD mapping, block definitions, plotting conductors + placements)
- `api_conduit_route_compute.py`: shared conduit-route A* compute helpers (`compute_conduit_route`)
- `api_conduit_route_obstacle_scan.py`: shared AutoCAD obstacle extraction + canvas normalization helpers (`scan_conduit_obstacles`)
- `api_autocad_manager.py`: shared AutoCAD manager lifecycle and operations (`AutoCADManager`, `get_manager`, `reset_manager_for_tests`, `create_autocad_manager`)
- `api_autocad_runtime.py`: shared AutoCAD runtime wiring/composition (`create_autocad_runtime`, `AutoCADRuntime`)
- `api_auth_runtime.py`: shared auth/session runtime wiring (`create_auth_runtime`, `AuthRuntime`)
- `api_passkey_runtime.py`: shared passkey runtime wiring/orchestration (`create_passkey_runtime`, `PasskeyRuntime`)
- `api_email_runtime.py`: shared auth-email runtime wiring/orchestration (`create_email_runtime`, `EmailRuntime`)
- `api_agent_runtime.py`: shared agent runtime wiring/orchestration (`create_agent_runtime`, `AgentRuntime`)
- `api_security_runtime.py`: shared API-key guard + layer-config validation runtime (`create_security_runtime`, `SecurityRuntime`)
- `api_transmittal_runtime.py`: shared transmittal helper runtime (`create_transmittal_runtime`, `TransmittalRuntime`)
- `api_transmittal_profiles_runtime.py`: shared transmittal profile/cache runtime (`create_transmittal_profiles_runtime`, `TransmittalProfilesRuntime`)
- `api_env_parsing.py`: shared env parsing runtime (`create_env_parsing_runtime`, `EnvParsingRuntime`)
- `api_runtime_config.py`: shared runtime config normalization helpers (API key, Supabase URL/API key, agent webhook secret, passkey provider/RP defaults, turnstile requirement)
- `api_http_hardening.py`: shared HTTP hardening helpers (default allowed origins, CORS setup, limiter defaults, security headers)
- `api_server_state.py`: shared in-memory server state initialization (stores + locks for transmittal profiles, agent sessions/challenges, passkey/auth-email abuse windows)
- `api_bootstrap_runtime.py`: shared startup/bootstrap helpers (logging config, gen_py read-only setup, env file loading)
- `api_dependency_bundle.py`: shared dependency-bundle builders for route-group registration (`passkey_deps`, `agent_deps`, `transmittal_render_deps`)
- `api_watchdog_service.py`: shared in-memory heartbeat monitor service for recursive folder snapshots/diff events (`WatchdogMonitorService`)
- `api_agent.py`: `/api/agent/*`
- `api_agent_orchestration.py`: `/api/agent/runs`, `/api/agent/runs/<run_id>`, `/api/agent/runs/<run_id>/events`, `/api/agent/runs/<run_id>/cancel`
- `api_agent_orchestration_runtime.py`: persistent run-ledger + background worker orchestration runtime for parallel agent stages
- `api_agent_orchestration_templates.py`: profile instruction templates + stage prompt builders for orchestration flows
- `api_dashboard.py`: `/api/dashboard/load`, `/api/dashboard/load/<job_id>`
- `api_project_setup.py`: `/api/project-setup/tickets`, `/api/project-setup/projects/<project_id>/profile`, `/api/project-setup/preview`, `/api/project-setup/results`
- `api_project_standards.py`: `/api/project-standards/tickets`, `/api/project-standards/projects/<project_id>/profile`, `/api/project-standards/projects/<project_id>/latest-review`, `/api/project-standards/results`
- `api_command_center.py`: `/api/command-center/supabase-sync-status`
- `api_work_ledger.py`: `/api/work-ledger/publishers/worktale/readiness`, `/api/work-ledger/publishers/worktale/bootstrap`, `/api/work-ledger/entries/<entry_id>/publish/worktale`, `/api/work-ledger/entries/<entry_id>/publish-jobs`, `/api/work-ledger/entries/<entry_id>/publish-jobs/<job_id>/open-artifact-folder`
- `api_agent_helpers.py`: shared helper functions for gateway pair/unpair/code requests
- `api_transmittal.py`: `/api/transmittal/profiles`, `/api/transmittal/template`
- `api_transmittal_render.py`: `/api/transmittal/render`
- `api_autocad.py`: `/api/status`, `/api/layers`, `/api/selection-count`, `/api/execute`, `/api/ground-grid/plot`, `/api/trigger-selection`, `/api/conduit-route/terminal-scan`, `/api/conduit-route/terminal-routes/draw`, `/api/conduit-route/terminal-labels/sync`, `/api/conduit-route/bridge/terminal-labels/sync`, `/api/conduit-route/obstacles/scan`, `/api/conduit-route/route/compute`
- `api_autocad_reference_catalog.py`: `/api/autocad/reference/menu-index`, `/api/autocad/reference/standards`, `/api/autocad/reference/lookups/summary`, `/api/autocad/reference/lookups/<lookup_id>`
- `api_watchdog.py`: `/api/watchdog/config`, `/api/watchdog/status`, `/api/watchdog/heartbeat` (`/api/watchdog/pick-root` is retired; project setup now uses the Runtime Control localhost bridge)
- `api_health.py`: `/health`
- `api_registry.py`: central route-group registration for the Flask app

Transport ownership note:

- `api_autocad.py` now uses the in-process ACADE sender for conduit-route dotnet-provider actions and keeps `/api/conduit-route/bridge/terminal-labels/sync` only as a compatibility alias. Drawing Cleanup moved into `api_batch_find_replace.py`, and the named-pipe bridge is now a manual diagnostic/explicit-fallback lane instead of a default product transport.

Removed route groups:

- `api_title_block_sync.py`: deleted; project setup/title-block flows now stay on `api_project_setup.py` plus Runtime Control local actions

## Why this exists

- Keep API surface organized by domain.
- Reduce monolithic `api_server.py` blast radius.
- Make incremental refactors safer by moving one domain at a time.

## Next recommended groups

- `api_server_constants.py`: optional extraction for remaining top-level constant/env declarations to reduce `api_server.py` scan length

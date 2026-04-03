from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Optional

from flask import Flask
from flask_limiter import Limiter

from .api_autodraft import create_autodraft_blueprint
from .api_agent import create_agent_blueprint
from .api_agent_orchestration import create_agent_orchestration_blueprint
from .api_auth_passkey import create_auth_passkey_blueprint
from .api_autocad import create_autocad_blueprint
from .api_autocad_reference_catalog import create_autocad_reference_catalog_blueprint
from .api_backup import create_backup_blueprint
from .api_auth_email import create_auth_email_blueprint
from .api_batch_find_replace import create_batch_find_replace_blueprint
from .api_automation_recipes import create_automation_recipe_blueprint
from .api_drawing_program import create_drawing_program_blueprint
from .api_watchdog import create_watchdog_blueprint
from .api_health import create_health_blueprint
from .api_dashboard import create_dashboard_blueprint
from .api_project_setup import create_project_setup_blueprint
from .api_project_standards import create_project_standards_blueprint
from .api_command_center import create_command_center_blueprint
from .api_terminal_authoring import create_terminal_authoring_blueprint
from .api_work_ledger import create_work_ledger_blueprint
from .api_transmittal import create_transmittal_blueprint
from .api_transmittal_render import create_transmittal_render_blueprint


def register_route_groups(
    app: Flask,
    *,
    require_api_key: Callable,
    require_autocad_auth: Callable,
    require_watchdog_collector_auth: Callable,
    is_valid_api_key: Callable[[Optional[str]], bool],
    limiter: Limiter,
    logger: Any,
    issue_ws_ticket: Callable[..., dict[str, Any]],
    api_key: str,
    schedule_cleanup: Callable[[str], None],
    supabase_url: str,
    supabase_api_key: str,
    auth_email_honeypot_field: str,
    auth_email_turnstile_secret: str,
    auth_email_require_turnstile: bool,
    apply_auth_email_response_floor: Callable[[float], None],
    auth_email_generic_response: Callable[[], dict[str, Any]],
    is_valid_email: Callable[[str], bool],
    get_request_ip: Callable[[], str],
    is_auth_email_request_allowed: Callable[[str, str], tuple[bool, str]],
    email_fingerprint: Callable[[str], str],
    verify_turnstile_token: Callable[[str, str], bool],
    send_supabase_email_link: Callable[..., None],
    load_transmittal_profiles_payload: Callable[[], dict[str, Any]],
    transmittal_template_path: Path,
    backup_storage_dir: Path,
    backup_max_bytes: int,
    backup_max_files: int,
    autodraft_dotnet_api_url: str,
    autodraft_execute_provider: str,
    conduit_route_autocad_provider: str,
    batch_session_cookie: str,
    batch_session_ttl_seconds: int,
    require_supabase_user: Callable,
    require_agent_session: Callable,
    get_supabase_user_id: Callable[[dict[str, Any]], Optional[str]],
    get_supabase_user_email: Callable[[dict[str, Any]], Optional[str]],
    is_admin_user: Callable[[dict[str, Any]], bool],
    passkey_deps: dict[str, Any],
    agent_deps: dict[str, Any],
    agent_run_orchestrator: Any,
    transmittal_render_deps: dict[str, Any],
    get_manager: Callable[[], Any],
    connect_autocad: Callable[[], Any],
    dyn: Callable[[Any], Any],
    pythoncom: Any,
    send_autocad_dotnet_command: Optional[Callable[[str, dict[str, Any]], dict[str, Any]]],
    validate_layer_config: Callable[[Any], dict[str, Any]],
    traceback_module: Any,
    send_autocad_acade_command: Optional[Callable[[str, dict[str, Any]], dict[str, Any]]] = None,
) -> None:
    """Register extracted route groups on the Flask app."""
    app.register_blueprint(
        create_backup_blueprint(
            require_api_key=require_api_key,
            limiter=limiter,
            logger=logger,
            backup_storage_dir=backup_storage_dir,
            backup_max_bytes=backup_max_bytes,
            backup_max_files=backup_max_files,
        )
    )
    app.register_blueprint(
        create_autodraft_blueprint(
            require_api_key=require_api_key,
            limiter=limiter,
            logger=logger,
            autodraft_dotnet_api_url=autodraft_dotnet_api_url,
            autodraft_execute_provider=autodraft_execute_provider,
            send_autodraft_dotnet_command=send_autocad_dotnet_command,
            get_manager=get_manager,
        )
    )
    app.register_blueprint(
        create_batch_find_replace_blueprint(
            limiter=limiter,
            logger=logger,
            is_valid_api_key=is_valid_api_key,
            api_key=api_key,
            schedule_cleanup=schedule_cleanup,
            batch_session_cookie=batch_session_cookie,
            batch_session_ttl_seconds=batch_session_ttl_seconds,
            send_autocad_dotnet_command=send_autocad_dotnet_command,
            send_autocad_acade_command=send_autocad_acade_command,
        )
    )
    app.register_blueprint(
        create_automation_recipe_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            is_valid_api_key=is_valid_api_key,
            send_autocad_dotnet_command=send_autocad_dotnet_command,
            send_autocad_acade_command=send_autocad_acade_command,
        )
    )
    app.register_blueprint(
        create_auth_email_blueprint(
            limiter=limiter,
            logger=logger,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            auth_email_honeypot_field=auth_email_honeypot_field,
            auth_email_turnstile_secret=auth_email_turnstile_secret,
            auth_email_require_turnstile=auth_email_require_turnstile,
            apply_auth_email_response_floor=apply_auth_email_response_floor,
            auth_email_generic_response=auth_email_generic_response,
            is_valid_email=is_valid_email,
            get_request_ip=get_request_ip,
            is_auth_email_request_allowed=is_auth_email_request_allowed,
            email_fingerprint=email_fingerprint,
            verify_turnstile_token=verify_turnstile_token,
            send_supabase_email_link=send_supabase_email_link,
        )
    )
    app.register_blueprint(
        create_auth_passkey_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            deps=passkey_deps,
        )
    )
    app.register_blueprint(
        create_agent_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            require_agent_session=require_agent_session,
            deps=agent_deps,
        )
    )
    app.register_blueprint(
        create_agent_orchestration_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            require_agent_session=require_agent_session,
            get_supabase_user_id=get_supabase_user_id,
            get_supabase_user_email=get_supabase_user_email,
            is_admin_user=is_admin_user,
            orchestrator=agent_run_orchestrator,
        )
    )
    app.register_blueprint(
        create_dashboard_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
        )
    )
    app.register_blueprint(
        create_project_setup_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            api_key=api_key,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
        )
    )
    app.register_blueprint(
        create_project_standards_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            api_key=api_key,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
        )
    )
    app.register_blueprint(
        create_command_center_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
        )
    )
    app.register_blueprint(
        create_terminal_authoring_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            is_valid_api_key=is_valid_api_key,
            schedule_cleanup=schedule_cleanup,
            send_autocad_dotnet_command=send_autocad_dotnet_command,
            send_autocad_acade_command=send_autocad_acade_command,
        )
    )
    app.register_blueprint(
        create_drawing_program_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
        )
    )
    app.register_blueprint(
        create_work_ledger_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            agent_run_orchestrator=agent_run_orchestrator,
        )
    )
    app.register_blueprint(
        create_transmittal_blueprint(
            require_api_key=require_api_key,
            limiter=limiter,
            load_transmittal_profiles_payload=load_transmittal_profiles_payload,
            transmittal_template_path=transmittal_template_path,
        )
    )
    app.register_blueprint(
        create_transmittal_render_blueprint(
            require_api_key=require_api_key,
            limiter=limiter,
            deps=transmittal_render_deps,
        )
    )
    app.register_blueprint(
        create_autocad_reference_catalog_blueprint(
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
        )
    )
    app.register_blueprint(
        create_autocad_blueprint(
            require_autocad_auth=require_autocad_auth,
            limiter=limiter,
            issue_ws_ticket=issue_ws_ticket,
            logger=logger,
            get_manager=get_manager,
            connect_autocad=connect_autocad,
            dyn=dyn,
            pythoncom=pythoncom,
            conduit_route_autocad_provider=conduit_route_autocad_provider,
            send_autocad_dotnet_command=send_autocad_dotnet_command,
            send_autocad_acade_command=send_autocad_acade_command,
            validate_layer_config=validate_layer_config,
            traceback_module=traceback_module,
        )
    )
    app.register_blueprint(
        create_watchdog_blueprint(
            require_autocad_auth=require_autocad_auth,
            require_watchdog_collector_auth=require_watchdog_collector_auth,
            limiter=limiter,
            logger=logger,
            require_supabase_user=require_supabase_user,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
        )
    )
    app.register_blueprint(create_health_blueprint(limiter=limiter))

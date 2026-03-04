from __future__ import annotations

from typing import Any, Callable, Mapping, Tuple


def resolve_api_host(environ: Mapping[str, str], *, default_host: str = "127.0.0.1") -> str:
    host = str(environ.get("API_HOST", default_host)).strip()
    return host or default_host


def resolve_api_port(
    parse_int_env_fn: Callable[..., int],
    *,
    default_port: int = 5000,
) -> int:
    return parse_int_env_fn("API_PORT", default_port, minimum=1)


def run_server_entrypoint(
    *,
    app: Any,
    environ: Mapping[str, str],
    parse_int_env_fn: Callable[..., int],
    print_startup_banner_fn: Callable[[str, int], Any],
    get_manager_fn: Callable[[], Any],
    print_initial_manager_status_fn: Callable[[Mapping[str, Any]], Any],
    debug: bool = False,
    threaded: bool = True,
) -> Tuple[str, int]:
    api_host = resolve_api_host(environ)
    api_port = resolve_api_port(parse_int_env_fn)

    print_startup_banner_fn(api_host, api_port)

    manager = get_manager_fn()
    initial_status = manager.get_status()
    print_initial_manager_status_fn(initial_status)

    app.run(
        host=api_host,
        port=api_port,
        debug=debug,
        threaded=threaded,
    )

    return api_host, api_port

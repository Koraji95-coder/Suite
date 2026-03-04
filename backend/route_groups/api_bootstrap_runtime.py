from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class BootstrapRuntime:
    configure_logging: Callable[[str, str], Any]
    apply_gencache_readonly: Callable[[bool, Any], None]
    load_env_file: Callable[[Any, Any], None]
    load_default_env: Callable[[str, Any], Any]


def create_bootstrap_runtime(
    *,
    logging_module: Any,
    os_module: Any,
    path_cls: Any,
) -> BootstrapRuntime:
    def configure_logging(
        logger_name: str,
        log_filename: str = "api_server.log",
    ) -> Any:
        logging_module.basicConfig(
            level=logging_module.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            handlers=[
                logging_module.FileHandler(log_filename),
                logging_module.StreamHandler(),
            ],
        )
        return logging_module.getLogger(logger_name)

    def apply_gencache_readonly(
        autocad_com_available: bool,
        gencache_module: Any,
    ) -> None:
        if autocad_com_available and gencache_module is not None:
            gencache_module.is_readonly = True

    def load_env_file(path: Any, logger: Any) -> None:
        if not path.exists():
            return
        try:
            for raw in path.read_text().splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key:
                    continue
                value = value.strip().strip('"').strip("'")
                os_module.environ.setdefault(key, value)
        except Exception as exc:
            logger.warning("Failed to load env file %s: %s", path, exc)

    def load_default_env(api_server_file: str, logger: Any):
        env_path = path_cls(api_server_file).resolve().parents[1] / ".env"
        load_env_file(env_path, logger)
        return env_path

    return BootstrapRuntime(
        configure_logging=configure_logging,
        apply_gencache_readonly=apply_gencache_readonly,
        load_env_file=load_env_file,
        load_default_env=load_default_env,
    )

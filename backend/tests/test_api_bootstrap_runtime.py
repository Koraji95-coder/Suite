from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from backend.route_groups.api_bootstrap_runtime import create_bootstrap_runtime


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message: str, *args) -> None:
        self.warnings.append((message, args))


class _OSStub:
    def __init__(self, environ: dict[str, str]) -> None:
        self.environ = environ


class _LoggingStub:
    INFO = 20

    def __init__(self) -> None:
        self.basic_config_calls = []
        self.loggers = {}

    def FileHandler(self, filename: str):
        return {"type": "file", "filename": filename}

    def StreamHandler(self):
        return {"type": "stream"}

    def basicConfig(self, **kwargs) -> None:
        self.basic_config_calls.append(kwargs)

    def getLogger(self, name: str):
        logger = self.loggers.get(name)
        if logger is None:
            logger = _LoggerStub()
            self.loggers[name] = logger
        return logger


class _GenCacheStub:
    def __init__(self) -> None:
        self.is_readonly = False


class TestApiBootstrapRuntime(unittest.TestCase):
    def test_configure_logging(self) -> None:
        logging_stub = _LoggingStub()
        runtime = create_bootstrap_runtime(
            logging_module=logging_stub,
            os_module=_OSStub({}),
            path_cls=Path,
        )

        logger = runtime.configure_logging("backend.api_server", "custom.log")
        self.assertIs(logger, logging_stub.loggers["backend.api_server"])
        self.assertEqual(len(logging_stub.basic_config_calls), 1)
        call = logging_stub.basic_config_calls[0]
        self.assertEqual(call["level"], logging_stub.INFO)
        self.assertEqual(call["handlers"][0]["filename"], "custom.log")

    def test_apply_gencache_readonly(self) -> None:
        runtime = create_bootstrap_runtime(
            logging_module=_LoggingStub(),
            os_module=_OSStub({}),
            path_cls=Path,
        )
        cache = _GenCacheStub()

        runtime.apply_gencache_readonly(True, cache)
        self.assertTrue(cache.is_readonly)

        cache = _GenCacheStub()
        runtime.apply_gencache_readonly(False, cache)
        self.assertFalse(cache.is_readonly)
        runtime.apply_gencache_readonly(True, None)

    def test_load_env_file(self) -> None:
        os_stub = _OSStub({"EXISTING": "keep"})
        runtime = create_bootstrap_runtime(
            logging_module=_LoggingStub(),
            os_module=os_stub,
            path_cls=Path,
        )
        logger = _LoggerStub()

        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "# comment",
                        "FOO=bar",
                        "SPACED = value",
                        "QUOTED='quoted'",
                        "EXISTING=override",
                        "NOEQUALS",
                        " =bad",
                    ]
                ),
                encoding="utf-8",
            )
            runtime.load_env_file(env_path, logger)

            self.assertEqual(os_stub.environ["FOO"], "bar")
            self.assertEqual(os_stub.environ["SPACED"], "value")
            self.assertEqual(os_stub.environ["QUOTED"], "quoted")
            self.assertEqual(os_stub.environ["EXISTING"], "keep")
            self.assertEqual(len(logger.warnings), 0)

    def test_load_default_env(self) -> None:
        os_stub = _OSStub({"KEEP": "from-process"})
        runtime = create_bootstrap_runtime(
            logging_module=_LoggingStub(),
            os_module=os_stub,
            path_cls=Path,
        )
        logger = _LoggerStub()

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            backend_dir = repo_root / "backend"
            backend_dir.mkdir(parents=True, exist_ok=True)
            api_server_path = backend_dir / "api_server.py"
            api_server_path.write_text("# test", encoding="utf-8")
            env_path = repo_root / ".env"
            env_path.write_text("KEY=from-env\nKEEP=from-env", encoding="utf-8")
            local_env_path = repo_root / ".env.local"
            local_env_path.write_text(
                "KEY=from-local\nLOCAL_ONLY=present\nKEEP=from-local",
                encoding="utf-8",
            )

            resolved = runtime.load_default_env(str(api_server_path), logger)
            self.assertEqual(resolved, local_env_path)
            self.assertEqual(os_stub.environ.get("KEY"), "from-local")
            self.assertEqual(os_stub.environ.get("LOCAL_ONLY"), "present")
            self.assertEqual(os_stub.environ.get("KEEP"), "from-process")

    def test_load_default_env_without_local_override(self) -> None:
        os_stub = _OSStub({})
        runtime = create_bootstrap_runtime(
            logging_module=_LoggingStub(),
            os_module=os_stub,
            path_cls=Path,
        )
        logger = _LoggerStub()

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            backend_dir = repo_root / "backend"
            backend_dir.mkdir(parents=True, exist_ok=True)
            api_server_path = backend_dir / "api_server.py"
            api_server_path.write_text("# test", encoding="utf-8")
            env_path = repo_root / ".env"
            env_path.write_text("KEY=value", encoding="utf-8")

            resolved = runtime.load_default_env(str(api_server_path), logger)
            self.assertEqual(resolved, env_path)
            self.assertEqual(os_stub.environ.get("KEY"), "value")


if __name__ == "__main__":
    unittest.main()

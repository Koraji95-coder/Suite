from __future__ import annotations

import unittest

from backend.route_groups.api_server_entrypoint import (
    resolve_api_host,
    resolve_api_port,
    run_server_entrypoint,
)


class _AppStub:
    def __init__(self) -> None:
        self.run_calls = []

    def run(self, **kwargs) -> None:
        self.run_calls.append(kwargs)


class _ManagerStub:
    def __init__(self, status) -> None:
        self.status = status
        self.calls = 0

    def get_status(self):
        self.calls += 1
        return self.status


class TestApiServerEntrypoint(unittest.TestCase):
    def test_resolve_api_host_uses_trimmed_env(self) -> None:
        self.assertEqual(resolve_api_host({"API_HOST": " 0.0.0.0 "}), "0.0.0.0")

    def test_resolve_api_host_falls_back_for_blank(self) -> None:
        self.assertEqual(resolve_api_host({"API_HOST": "   "}), "127.0.0.1")
        self.assertEqual(resolve_api_host({}), "127.0.0.1")

    def test_resolve_api_port_calls_parse_helper(self) -> None:
        calls = []

        def parse_int_env(var_name, fallback, minimum):
            calls.append((var_name, fallback, minimum))
            return 6001

        self.assertEqual(resolve_api_port(parse_int_env), 6001)
        self.assertEqual(calls, [("API_PORT", 5000, 1)])

    def test_run_server_entrypoint_orchestrates_bootstrap(self) -> None:
        app = _AppStub()
        manager = _ManagerStub(
            {
                "autocad_running": True,
                "autocad_path": "C:/Program Files/AutoCAD/acad.exe",
                "drawing_open": False,
                "drawing_name": "",
            }
        )

        banner_calls = []
        status_calls = []
        parse_calls = []

        def parse_int_env(var_name, fallback, minimum):
            parse_calls.append((var_name, fallback, minimum))
            return 5050

        host, port = run_server_entrypoint(
            app=app,
            environ={"API_HOST": " 127.0.0.1 "},
            parse_int_env_fn=parse_int_env,
            print_startup_banner_fn=lambda h, p: banner_calls.append((h, p)),
            get_manager_fn=lambda: manager,
            print_initial_manager_status_fn=lambda status: status_calls.append(status),
            debug=False,
            threaded=True,
        )

        self.assertEqual((host, port), ("127.0.0.1", 5050))
        self.assertEqual(parse_calls, [("API_PORT", 5000, 1)])
        self.assertEqual(banner_calls, [("127.0.0.1", 5050)])
        self.assertEqual(status_calls, [manager.status])
        self.assertEqual(manager.calls, 1)
        self.assertEqual(
            app.run_calls,
            [{"host": "127.0.0.1", "port": 5050, "debug": False, "threaded": True}],
        )


if __name__ == "__main__":
    unittest.main()

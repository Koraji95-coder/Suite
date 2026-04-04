from __future__ import annotations

import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import unittest
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


class _McpServerProcess:
    def __init__(self, *, env: Optional[Dict[str, str]] = None) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        proc_env = os.environ.copy()
        if env:
            proc_env.update(env)
        self._proc = subprocess.Popen(
            ["node", "tools/suite-repo-mcp/server.mjs"],
            cwd=repo_root,
            env=proc_env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self._message_queue: "queue.Queue[Dict[str, Any]]" = queue.Queue()
        self._pending_messages: list[Dict[str, Any]] = []
        self._read_stop = threading.Event()
        self._send_lock = threading.Lock()
        self._next_id = 1
        self._closed = False

        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def _close_pipe(self, pipe: Any) -> None:
        if pipe is None:
            return
        try:
            pipe.close()
        except Exception:
            return

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._read_stop.set()
        self._close_pipe(self._proc.stdin)
        if self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait(timeout=3)
        self._reader.join(timeout=1)
        self._close_pipe(self._proc.stdout)
        self._close_pipe(self._proc.stderr)

    def __enter__(self) -> "_McpServerProcess":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    @staticmethod
    def _find_header_terminator(buffer: bytearray) -> Optional[Tuple[int, int]]:
        crlf_index = bytes(buffer).find(b"\r\n\r\n")
        lf_index = bytes(buffer).find(b"\n\n")
        if crlf_index == -1 and lf_index == -1:
            return None
        if crlf_index == -1:
            return (lf_index, 2)
        if lf_index == -1:
            return (crlf_index, 4)
        return (crlf_index, 4) if crlf_index < lf_index else (lf_index, 2)

    def _read_loop(self) -> None:
        if self._proc.stdout is None:
            return

        buffer = bytearray()
        stream = self._proc.stdout
        while not self._read_stop.is_set():
            try:
                chunk = stream.read1(4096)
            except Exception:
                chunk = stream.read(1)
            if not chunk:
                break
            buffer.extend(chunk)
            while True:
                terminator = self._find_header_terminator(buffer)
                if terminator is None:
                    break

                header_index, terminator_length = terminator
                header_text = bytes(buffer[:header_index]).decode("utf-8", errors="replace")
                length_match = re.search(r"Content-Length:\s*(\d+)", header_text, flags=re.IGNORECASE)
                if not length_match:
                    del buffer[: header_index + terminator_length]
                    continue

                content_length = int(length_match.group(1))
                message_start = header_index + terminator_length
                message_end = message_start + content_length
                if len(buffer) < message_end:
                    break

                payload = bytes(buffer[message_start:message_end])
                del buffer[:message_end]
                try:
                    message = json.loads(payload.decode("utf-8"))
                except Exception:
                    continue
                if isinstance(message, dict):
                    self._message_queue.put(message)

    def _send(self, message: Dict[str, Any]) -> None:
        if self._proc.stdin is None:
            raise RuntimeError("MCP server stdin is unavailable.")

        payload = json.dumps(message).encode("utf-8")
        frame = b"Content-Length: " + str(len(payload)).encode("ascii") + b"\r\n\r\n" + payload
        with self._send_lock:
            self._proc.stdin.write(frame)
            self._proc.stdin.flush()

    def notify(self, method: str, params: Optional[Dict[str, Any]] = None) -> None:
        message: Dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        self._send(message)

    def request(
        self,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout: float = 6.0,
    ) -> Dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        message: Dict[str, Any] = {"jsonrpc": "2.0", "id": request_id, "method": method}
        if params is not None:
            message["params"] = params
        self._send(message)
        return self._wait_for_id(request_id, timeout=timeout)

    def _wait_for_id(self, request_id: int, *, timeout: float) -> Dict[str, Any]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            for index, message in enumerate(self._pending_messages):
                if message.get("id") == request_id:
                    return self._pending_messages.pop(index)

            remaining = max(0.01, deadline - time.time())
            try:
                message = self._message_queue.get(timeout=remaining)
            except queue.Empty:
                continue
            self._pending_messages.append(message)

        raise TimeoutError(f"Timed out waiting for MCP response id={request_id}.")

    def initialize(self) -> Dict[str, Any]:
        response = self.request(
            "initialize",
            {
                "protocolVersion": "2026-01-26",
                "capabilities": {},
                "clientInfo": {"name": "suite-test-client", "version": "1.0"},
            },
        )
        self.notify("notifications/initialized")
        return response


@unittest.skipUnless(shutil.which("node"), "Node.js is required to run MCP server integration tests.")
class TestSuiteRepoMcpServer(unittest.TestCase):
    def test_rejects_requests_before_initialize(self) -> None:
        with _McpServerProcess() as server:
            response = server.request("tools/list", {})
        self.assertIn("error", response)
        self.assertEqual(response["error"]["code"], -32002)

    def test_initialize_and_list_tools(self) -> None:
        with _McpServerProcess() as server:
            init_response = server.initialize()
            self.assertEqual(init_response.get("result", {}).get("protocolVersion"), "2026-01-26")

            tools_response = server.request("tools/list", {})
        tools = tools_response.get("result", {}).get("tools", [])
        tool_names = {str(entry.get("name")) for entry in tools if isinstance(entry, dict)}
        self.assertIn("repo.run_tests", tool_names)
        self.assertIn("repo.search", tool_names)
        self.assertIn("repo.generate_route", tool_names)
        self.assertIn("repo.get_workstation_context", tool_names)
        self.assertIn("repo.check_watchdog_collector_startup", tool_names)
        self.assertIn("repo.check_watchdog_autocad_collector_startup", tool_names)
        self.assertIn("repo.check_watchdog_autocad_plugin", tool_names)
        self.assertIn("repo.check_watchdog_autocad_readiness", tool_names)
        self.assertIn("repo.check_watchdog_backend_startup", tool_names)
        self.assertIn("repo.check_suite_workstation", tool_names)

    def test_initialize_and_list_resources(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            resources_response = server.request("resources/list", {})

        resources = resources_response.get("result", {}).get("resources", [])
        resource_by_uri = {
            str(entry.get("uri")): entry for entry in resources if isinstance(entry, dict)
        }
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-project-flow",
            resource_by_uri,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-autolisp-api-reference",
            resource_by_uri,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-reference-pack",
            resource_by_uri,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-installation-context",
            resource_by_uri,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-installation-context-yaml",
            resource_by_uri,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-lookup-index",
            resource_by_uri,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-regression-fixtures",
            resource_by_uri,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-suite-integration-playbook",
            resource_by_uri,
        )
        resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-project-flow"
        ]
        self.assertEqual(
            resource.get("name"),
            "AutoCAD Electrical 2026 Project Flow Reference",
        )
        self.assertEqual(resource.get("mimeType"), "text/markdown")
        api_resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-autolisp-api-reference"
        ]
        self.assertEqual(
            api_resource.get("name"),
            "AutoCAD Electrical 2026 AutoLISP Reference API Documentation",
        )
        self.assertEqual(api_resource.get("mimeType"), "text/markdown")
        pack_resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-reference-pack"
        ]
        self.assertEqual(
            pack_resource.get("name"),
            "AutoCAD Electrical 2026 Local Reference Pack",
        )
        self.assertEqual(pack_resource.get("mimeType"), "text/markdown")
        install_resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-installation-context"
        ]
        self.assertEqual(
            install_resource.get("name"),
            "AutoCAD Electrical 2026 Installation Context Reference",
        )
        self.assertEqual(install_resource.get("mimeType"), "text/markdown")
        install_yaml_resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-installation-context-yaml"
        ]
        self.assertEqual(
            install_yaml_resource.get("name"),
            "AutoCAD Electrical 2026 Installation Context Inventory (YAML)",
        )
        self.assertEqual(install_yaml_resource.get("mimeType"), "application/yaml")
        lookup_index_resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-lookup-index"
        ]
        self.assertEqual(
            lookup_index_resource.get("name"),
            "AutoCAD Electrical 2026 Lookup Index",
        )
        self.assertEqual(lookup_index_resource.get("mimeType"), "application/json")
        regression_fixture_resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-regression-fixtures"
        ]
        self.assertEqual(
            regression_fixture_resource.get("name"),
            "AutoCAD Electrical 2026 Regression Fixtures",
        )
        self.assertEqual(regression_fixture_resource.get("mimeType"), "text/markdown")
        playbook_resource = resource_by_uri[
            "repo://docs/development/autocad-electrical-2026-suite-integration-playbook"
        ]
        self.assertEqual(
            playbook_resource.get("name"),
            "AutoCAD Electrical 2026 Suite Integration Playbook",
        )
        self.assertEqual(playbook_resource.get("mimeType"), "text/markdown")

    def test_resources_read_returns_autodesk_project_flow_markdown(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-project-flow",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-project-flow",
        )
        self.assertEqual(content.get("mimeType"), "text/markdown")
        text = str(content.get("text") or "")
        self.assertIn("AEPROJECT / Project Manager entrypoints", text)
        self.assertIn(
            "GetProjectFilePath / SetProjectFilePath are not ACADE project-creation APIs",
            text,
        )

    def test_resources_read_returns_autodesk_autolisp_api_markdown(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-autolisp-api-reference",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-autolisp-api-reference",
        )
        self.assertEqual(content.get("mimeType"), "text/markdown")
        text = str(content.get("text") or "")
        self.assertIn("AutoCAD Electrical 2026 API entry point list", text)
        self.assertIn("ace_get_wnum", text)
        self.assertIn("wd_putwn", text)

    def test_resources_read_returns_autodesk_reference_pack_markdown(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-reference-pack",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-reference-pack",
        )
        self.assertEqual(content.get("mimeType"), "text/markdown")
        text = str(content.get("text") or "")
        self.assertIn("## Source Map", text)
        self.assertIn("## Usage Guidance", text)
        self.assertIn("repo://docs/development/autocad-electrical-2026-project-flow", text)
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-autolisp-api-reference",
            text,
        )
        self.assertIn(
            "repo://docs/development/autocad-electrical-2026-installation-context",
            text,
        )

    def test_resources_read_returns_autodesk_installation_context_markdown(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-installation-context",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-installation-context",
        )
        self.assertEqual(content.get("mimeType"), "text/markdown")
        text = str(content.get("text") or "")
        self.assertIn("## User Support Payload", text)
        self.assertIn("## Support Script Surface", text)
        self.assertIn("## Lookup Database Inventory", text)

    def test_resources_read_returns_autodesk_installation_context_yaml(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-installation-context-yaml",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-installation-context-yaml",
        )
        self.assertEqual(content.get("mimeType"), "application/yaml")
        text = str(content.get("text") or "")
        self.assertIn("schemaVersion: suite.autodesk.acade.installation-context.v1", text)
        self.assertIn("userSupport:", text)
        self.assertIn("lookupDatabases:", text)

    def test_resources_read_returns_autodesk_lookup_index_json(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-lookup-index",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-lookup-index",
        )
        self.assertEqual(content.get("mimeType"), "application/json")
        text = str(content.get("text") or "")
        self.assertIn('"schemaVersion": "suite.autodesk.acade.lookup-index.v1"', text)
        self.assertIn('"recommendedDefaults"', text)
        self.assertIn('"default_cat"', text)

    def test_resources_read_returns_autodesk_regression_fixtures_markdown(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-regression-fixtures",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-regression-fixtures",
        )
        self.assertEqual(content.get("mimeType"), "text/markdown")
        text = str(content.get("text") or "")
        self.assertIn("## Primary Fixtures", text)
        self.assertIn("wddemo-project", text)
        self.assertIn("fixtures:autodesk:stage", text)

    def test_resources_read_returns_autodesk_integration_playbook_markdown(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "resources/read",
                {
                    "uri": "repo://docs/development/autocad-electrical-2026-suite-integration-playbook",
                },
            )

        contents = response.get("result", {}).get("contents", [])
        self.assertTrue(contents)
        content = contents[0] if isinstance(contents[0], dict) else {}
        self.assertEqual(
            content.get("uri"),
            "repo://docs/development/autocad-electrical-2026-suite-integration-playbook",
        )
        self.assertEqual(content.get("mimeType"), "text/markdown")
        text = str(content.get("text") or "")
        self.assertIn("## Standards and Symbol Surface", text)
        self.assertIn("## Automation Surface That Matters Most", text)
        self.assertIn("## Recommended Suite Feature Opportunities", text)

    def test_tool_call_repo_search_returns_text(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.search",
                    "arguments": {
                        "pattern": "createTextResult",
                        "paths": ["tools/suite-repo-mcp/server.mjs"],
                        "max_results": 5,
                    },
                },
                timeout=10.0,
            )

        result = response.get("result", {})
        self.assertFalse(bool(result.get("isError")))
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        self.assertIn("Pattern: createTextResult", text)

    def test_prompt_get_returns_commit_message_template(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "prompts/get",
                {
                    "name": "repo.commit_message",
                    "arguments": {
                        "type": "fix",
                        "scope": "mcp",
                        "summary": "stabilize protocol framing",
                    },
                },
            )

        messages = response.get("result", {}).get("messages", [])
        self.assertTrue(messages)
        content = messages[0].get("content", {}) if isinstance(messages[0], dict) else {}
        text = str(content.get("text") or "")
        self.assertIn("fix(mcp): stabilize protocol framing", text)

    def test_prompt_get_returns_suite_guardrails(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "prompts/get",
                {
                    "name": "repo.suite_guardrails",
                    "arguments": {},
                },
            )

        messages = response.get("result", {}).get("messages", [])
        self.assertTrue(messages)
        content = messages[0].get("content", {}) if isinstance(messages[0], dict) else {}
        text = str(content.get("text") or "")
        self.assertIn("Do not add or use Tailwind", text)
        self.assertIn("Do not make major auth-flow changes", text)
        self.assertIn("AutoCAD reliability contract", text)
        self.assertIn("Office owns local agent, chat, and orchestration work", text)
        self.assertIn("repo.check_watchdog_collector_startup", text)
        self.assertIn("repo.check_watchdog_autocad_collector_startup", text)
        self.assertIn("repo.check_watchdog_autocad_plugin", text)
        self.assertIn("repo.check_watchdog_autocad_readiness", text)
        self.assertIn("repo.check_watchdog_backend_startup", text)

    def test_prompt_get_returns_workstation_context(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WORKSTATION_ID": "suite-secondary",
                "SUITE_WORKSTATION_LABEL": "Dustin travel workstation",
                "SUITE_WORKSTATION_ROLE": "secondary",
                "SUITE_AUTODESK_OFFLINE_HELP_ROOT": "C:\\Autodesk\\OfflineHelp",
                "COMPUTERNAME": "TEST-WS",
            }
        ) as server:
            server.initialize()
            response = server.request(
                "prompts/get",
                {
                    "name": "repo.workstation_context",
                    "arguments": {},
                },
            )

        messages = response.get("result", {}).get("messages", [])
        self.assertTrue(messages)
        content = messages[0].get("content", {}) if isinstance(messages[0], dict) else {}
        text = str(content.get("text") or "")
        self.assertIn("Workstation ID: suite-secondary", text)
        self.assertIn("Label: Dustin travel workstation", text)
        self.assertIn("Role: secondary", text)
        self.assertIn("Computer Name: TEST-WS", text)
        self.assertIn("Source: mcp_env", text)
        self.assertIn("Autodesk Offline Help Root: C:/Autodesk/OfflineHelp", text)
        self.assertIn("Collector ID: watchdog-fs-suite-secondary", text)
        self.assertIn(
            "Startup Task: SuiteWatchdogFilesystemCollector-suite-secondary",
            text,
        )
        self.assertIn(
            "Startup Check Task: SuiteWatchdogFilesystemCollectorCheck-suite-secondary",
            text,
        )
        self.assertIn(
            "scripts/check-watchdog-filesystem-collector-startup.ps1",
            text,
        )
        self.assertIn("Collector ID: autocad-suite-secondary", text)
        self.assertIn(
            "Startup Task: SuiteWatchdogAutoCADCollector-suite-secondary",
            text,
        )
        self.assertIn(
            "scripts/check-watchdog-autocad-collector-startup.ps1",
            text,
        )
        self.assertIn(
            "SuiteWatchdogCadTracker.bundle",
            text,
        )
        self.assertIn(
            "scripts/check-watchdog-autocad-plugin.ps1",
            text,
        )
        self.assertIn(
            "scripts/check-watchdog-autocad-readiness.ps1",
            text,
        )

    def test_tool_get_workstation_context_returns_text(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WORKSTATION_ID": "suite-main",
                "SUITE_WORKSTATION_LABEL": "Dustin main workstation",
                "SUITE_WORKSTATION_ROLE": "primary",
                "SUITE_AUTODESK_OFFLINE_HELP_ROOT": "D:\\Docs\\Autodesk",
                "COMPUTERNAME": "MAIN-WS",
            }
        ) as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.get_workstation_context",
                    "arguments": {},
                },
                timeout=10.0,
            )

        result = response.get("result", {})
        self.assertFalse(bool(result.get("isError")))
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        self.assertIn("Workstation ID: suite-main", text)
        self.assertIn("Label: Dustin main workstation", text)
        self.assertIn("Role: primary", text)
        self.assertIn("Computer Name: MAIN-WS", text)
        self.assertIn("Source: mcp_env", text)
        self.assertIn("Autodesk Offline Help Root: D:/Docs/Autodesk", text)
        self.assertIn("Collector ID: watchdog-fs-suite-main", text)
        self.assertIn(
            "Startup Task: SuiteWatchdogFilesystemCollector-suite-main",
            text,
        )
        self.assertIn("Collector ID: autocad-suite-main", text)
        self.assertIn(
            "Startup Task: SuiteWatchdogAutoCADCollector-suite-main",
            text,
        )
        self.assertIn("SuiteWatchdogCadTracker.bundle", text)

    def test_tool_check_suite_workstation_returns_normalized_payload(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WORKSTATION_ID": "suite-main",
                "SUITE_WORKSTATION_LABEL": "Dustin main workstation",
                "SUITE_WORKSTATION_ROLE": "primary",
                "SUITE_AUTODESK_OFFLINE_HELP_ROOT": "E:\\Autodesk\\OfflineHelp",
                "SUITE_MCP_ENV_STAMPED_BY": "scripts/sync-suite-workstation-profile.ps1",
                "COMPUTERNAME": "MAIN-WS",
            }
        ) as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.check_suite_workstation",
                    "arguments": {},
                },
                timeout=20.0,
            )

        result = response.get("result", {})
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        payload = json.loads(text)
        self.assertIn("ok", payload)
        self.assertIn("workstation", payload)
        self.assertIn("backend", payload)
        self.assertIn("filesystemCollector", payload)
        self.assertIn("autocadCollector", payload)
        self.assertIn("autocadPlugin", payload)
        self.assertIn("autocadReadiness", payload)
        self.assertIn("issues", payload)
        self.assertIn("recommendedActions", payload)
        self.assertEqual(
            payload.get("workstation", {}).get("autodeskOfflineHelpRoot"),
            "E:\\Autodesk\\OfflineHelp",
        )

    @unittest.skipUnless(os.name == "nt", "Startup check tools are only available on Windows.")
    def test_tool_check_watchdog_autocad_collector_startup_reports_missing_script(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WORKSTATION_ID": "suite-main",
                "SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_SCRIPT": "scripts/does-not-exist-autocad.ps1",
            }
        ) as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.check_watchdog_autocad_collector_startup",
                    "arguments": {},
                },
                timeout=10.0,
            )

        result = response.get("result", {})
        self.assertTrue(bool(result.get("isError")))
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        self.assertIn("does-not-exist-autocad.ps1", text)

    @unittest.skipUnless(os.name == "nt", "AutoCAD plugin checks are only available on Windows.")
    def test_tool_check_watchdog_autocad_plugin_reports_missing_script(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WATCHDOG_AUTOCAD_PLUGIN_CHECK_SCRIPT": "scripts/does-not-exist-autocad-plugin.ps1",
            }
        ) as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.check_watchdog_autocad_plugin",
                    "arguments": {},
                },
                timeout=10.0,
            )

        result = response.get("result", {})
        self.assertTrue(bool(result.get("isError")))
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        self.assertIn("does-not-exist-autocad-plugin.ps1", text)

    @unittest.skipUnless(os.name == "nt", "AutoCAD readiness checks are only available on Windows.")
    def test_tool_check_watchdog_autocad_readiness_reports_missing_script(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WATCHDOG_AUTOCAD_READINESS_CHECK_SCRIPT": "scripts/does-not-exist-autocad-readiness.ps1",
            }
        ) as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.check_watchdog_autocad_readiness",
                    "arguments": {},
                },
                timeout=10.0,
            )

        result = response.get("result", {})
        self.assertTrue(bool(result.get("isError")))
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        self.assertIn("does-not-exist-autocad-readiness.ps1", text)

    @unittest.skipUnless(os.name == "nt", "Backend startup checks are only available on Windows.")
    def test_tool_check_watchdog_backend_startup_reports_missing_script(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WATCHDOG_BACKEND_STARTUP_CHECK_SCRIPT": "scripts/does-not-exist-backend-startup.ps1",
            }
        ) as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.check_watchdog_backend_startup",
                    "arguments": {},
                },
                timeout=10.0,
            )

        result = response.get("result", {})
        self.assertTrue(bool(result.get("isError")))
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        self.assertIn("does-not-exist-backend-startup.ps1", text)

    def test_unknown_tool_returns_jsonrpc_error(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.unknown_tool",
                    "arguments": {},
                },
            )

        self.assertIn("error", response)
        self.assertEqual(response["error"]["code"], -32601)
        self.assertIn("Unknown tool", response["error"]["message"])


if __name__ == "__main__":
    unittest.main()

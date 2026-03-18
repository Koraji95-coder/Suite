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
        self.assertIn("repo.verify_agent_routing_guardrails", tool_names)

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
        self.assertIn("npm run gateway:dev", text)
        self.assertIn("SUITE_GATEWAY_USE_FULL_CLI=1", text)

    def test_prompt_get_returns_workstation_context(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WORKSTATION_ID": "suite-secondary",
                "SUITE_WORKSTATION_LABEL": "Dustin travel workstation",
                "SUITE_WORKSTATION_ROLE": "secondary",
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

    def test_prompt_get_returns_agent_handoff_gateway_block(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "prompts/get",
                {
                    "name": "repo.agent_handoff_packet",
                    "arguments": {},
                },
            )

        messages = response.get("result", {}).get("messages", [])
        self.assertTrue(messages)
        content = messages[0].get("content", {}) if isinstance(messages[0], dict) else {}
        text = str(content.get("text") or "")
        self.assertIn("Gateway Build State (Required)", text)
        self.assertIn("npm run gateway:dev", text)
        self.assertIn("SUITE_GATEWAY_USE_FULL_CLI=1", text)

    def test_prompt_get_returns_agent_profile_playbook(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "prompts/get",
                {
                    "name": "repo.agent_profile_playbook",
                    "arguments": {},
                },
            )

        messages = response.get("result", {}).get("messages", [])
        self.assertTrue(messages)
        content = messages[0].get("content", {}) if isinstance(messages[0], dict) else {}
        text = str(content.get("text") or "")
        self.assertIn("Agent Profile Playbook", text)
        self.assertIn("draftsmith", text)
        self.assertIn("gridsage", text)

    def test_tool_verify_agent_routing_guardrails(self) -> None:
        with _McpServerProcess() as server:
            server.initialize()
            response = server.request(
                "tools/call",
                {
                    "name": "repo.verify_agent_routing_guardrails",
                    "arguments": {},
                },
                timeout=10.0,
            )

        result = response.get("result", {})
        content = result.get("content", [])
        self.assertTrue(content)
        text = str(content[0].get("text") if isinstance(content[0], dict) else "")
        self.assertIn("Profile count checked", text)
        self.assertIn("Result:", text)

    def test_tool_get_workstation_context_returns_text(self) -> None:
        with _McpServerProcess(
            env={
                "SUITE_WORKSTATION_ID": "suite-main",
                "SUITE_WORKSTATION_LABEL": "Dustin main workstation",
                "SUITE_WORKSTATION_ROLE": "primary",
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

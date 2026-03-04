from __future__ import annotations

import unittest

from backend.route_groups.api_supabase_service_request import (
    extract_supabase_error_message,
    supabase_rest_base_url,
    supabase_service_rest_headers,
    supabase_service_rest_request,
)


class _ResponseStub:
    def __init__(
        self,
        *,
        status_code: int,
        payload=None,
        text: str = "",
        content: bytes = b"x",
        json_raises: bool = False,
    ) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.content = content
        self._json_raises = json_raises

    def json(self):
        if self._json_raises:
            raise RuntimeError("json failed")
        return self._payload


class _RequestsStub:
    def __init__(self, response: _ResponseStub) -> None:
        self.response = response
        self.calls = []

    def request(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class TestApiSupabaseServiceRequest(unittest.TestCase):
    def test_supabase_rest_base_url(self) -> None:
        self.assertEqual(
            supabase_rest_base_url(supabase_url="https://demo.supabase.co/"),
            "https://demo.supabase.co/rest/v1",
        )

    def test_supabase_service_rest_headers(self) -> None:
        headers = supabase_service_rest_headers(
            supabase_url="https://demo.supabase.co",
            supabase_service_role_key="service-role",
            extra_headers={"Prefer": "return=representation"},
        )
        self.assertIsNotNone(headers)
        self.assertEqual((headers or {}).get("Authorization"), "Bearer service-role")
        self.assertEqual((headers or {}).get("Prefer"), "return=representation")

        self.assertIsNone(
            supabase_service_rest_headers(
                supabase_url="",
                supabase_service_role_key="service-role",
            )
        )

    def test_extract_supabase_error_message(self) -> None:
        response = _ResponseStub(
            status_code=400,
            payload={"message": "invalid request"},
            text="fallback",
        )
        self.assertEqual(extract_supabase_error_message(response), "invalid request")

    def test_supabase_service_rest_request_success(self) -> None:
        requests_stub = _RequestsStub(
            _ResponseStub(
                status_code=200,
                payload={"ok": True},
                content=b'{"ok":true}',
            )
        )
        payload, error, status_code = supabase_service_rest_request(
            "GET",
            "user_passkeys",
            supabase_url="https://demo.supabase.co/",
            supabase_service_role_key="service-role",
            params={"select": "id"},
            timeout=9,
            requests_module=requests_stub,
        )
        self.assertEqual((payload, error, status_code), ({"ok": True}, None, 200))
        self.assertEqual(len(requests_stub.calls), 1)
        self.assertEqual(
            requests_stub.calls[0].get("url"),
            "https://demo.supabase.co/rest/v1/user_passkeys",
        )

    def test_supabase_service_rest_request_uses_custom_error_extractor(self) -> None:
        requests_stub = _RequestsStub(_ResponseStub(status_code=500, payload={"error": "boom"}))
        payload, error, status_code = supabase_service_rest_request(
            "GET",
            "user_passkeys",
            supabase_url="https://demo.supabase.co/",
            supabase_service_role_key="service-role",
            requests_module=requests_stub,
            extract_supabase_error_message_fn=lambda _response: "custom-error",
        )
        self.assertEqual((payload, error, status_code), (None, "custom-error", 500))


if __name__ == "__main__":
    unittest.main()

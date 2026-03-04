from __future__ import annotations

import unittest

from backend.route_groups.api_supabase_auth_access import (
    generate_supabase_magic_link_url,
    send_supabase_email_link,
    verify_supabase_user_token,
)


class _ResponseStub:
    def __init__(self, status_code: int, payload=None, text: str = "", has_content: bool = True):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
        self.content = b"x" if has_content else b""

    def json(self):
        return self._payload


class _RequestsStub:
    def __init__(self, post_response: _ResponseStub | None = None, get_response: _ResponseStub | None = None):
        self._post_response = post_response or _ResponseStub(200)
        self._get_response = get_response or _ResponseStub(200, payload={})
        self.post_calls = []
        self.get_calls = []

    def post(self, url, headers, json, timeout, params=None):
        self.post_calls.append(
            {
                "url": url,
                "headers": headers,
                "json": json,
                "timeout": timeout,
                "params": params,
            }
        )
        return self._post_response

    def get(self, url, headers, timeout):
        self.get_calls.append(
            {
                "url": url,
                "headers": headers,
                "timeout": timeout,
            }
        )
        return self._get_response


class _JwtStub:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def decode(self, token, key, algorithms, options):
        self.calls.append(
            {
                "token": token,
                "key": key,
                "algorithms": algorithms,
                "options": options,
            }
        )
        return self.payload


class _LoggerStub:
    def __init__(self):
        self.warnings = []

    def warning(self, message, *args):
        self.warnings.append((message, args))


class TestApiSupabaseAuthAccess(unittest.TestCase):
    def test_send_supabase_email_link_posts_otp_request(self) -> None:
        requests_stub = _RequestsStub(post_response=_ResponseStub(200))

        send_supabase_email_link(
            "user@example.com",
            "signup",
            client_redirect_to="https://app.example.com",
            redirect_path="/login",
            redirect_query={"source": "signup"},
            supabase_url="https://demo.supabase.co",
            supabase_api_key="public-key",
            build_auth_redirect_url_fn=lambda *_args, **_kwargs: "https://app.example.com/login?source=signup",
            requests_module=requests_stub,
        )

        self.assertEqual(len(requests_stub.post_calls), 1)
        call = requests_stub.post_calls[0]
        self.assertEqual(call["url"], "https://demo.supabase.co/auth/v1/otp")
        self.assertEqual(call["json"]["email"], "user@example.com")
        self.assertTrue(call["json"]["create_user"])
        self.assertEqual(
            call["json"]["email_redirect_to"],
            "https://app.example.com/login?source=signup",
        )

    def test_generate_supabase_magic_link_url_returns_action_link(self) -> None:
        requests_stub = _RequestsStub(
            post_response=_ResponseStub(
                200,
                payload={"action_link": "https://demo.supabase.co/auth/v1/verify?token=abc"},
            )
        )

        action_link = generate_supabase_magic_link_url(
            "user@example.com",
            client_redirect_to="https://app.example.com",
            redirect_path="/login",
            supabase_url="https://demo.supabase.co",
            supabase_service_role_key="service-role",
            build_auth_redirect_url_fn=lambda *_args, **_kwargs: "https://app.example.com/login",
            requests_module=requests_stub,
        )

        self.assertEqual(
            action_link,
            "https://demo.supabase.co/auth/v1/verify?token=abc",
        )
        self.assertEqual(len(requests_stub.post_calls), 1)

    def test_verify_supabase_user_token_uses_hs256_path(self) -> None:
        jwt_stub = _JwtStub({"sub": "user-1", "email": "user@example.com"})
        logger = _LoggerStub()

        payload = verify_supabase_user_token(
            "token-123",
            supabase_jwt_secret="non-uuid-secret",
            supabase_url="",
            supabase_api_key="",
            looks_like_uuid_fn=lambda _value: False,
            get_supabase_jwks_client_fn=lambda: None,
            jwt_module=jwt_stub,
            logger=logger,
            requests_module=_RequestsStub(),
        )

        self.assertEqual((payload or {}).get("sub"), "user-1")
        self.assertEqual(len(jwt_stub.calls), 1)

    def test_verify_supabase_user_token_uses_auth_user_lookup(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub(
            get_response=_ResponseStub(200, payload={"id": "user-2", "email": "user2@example.com"})
        )

        payload = verify_supabase_user_token(
            "token-abc",
            supabase_jwt_secret="",
            supabase_url="https://demo.supabase.co/",
            supabase_api_key="public-key",
            looks_like_uuid_fn=lambda _value: True,
            get_supabase_jwks_client_fn=lambda: None,
            jwt_module=_JwtStub({}),
            logger=logger,
            requests_module=requests_stub,
        )

        self.assertEqual((payload or {}).get("id"), "user-2")
        self.assertEqual(len(requests_stub.get_calls), 1)
        self.assertEqual(
            requests_stub.get_calls[0]["url"],
            "https://demo.supabase.co/auth/v1/user",
        )

    def test_verify_supabase_user_token_returns_none_when_unconfigured(self) -> None:
        logger = _LoggerStub()

        payload = verify_supabase_user_token(
            "token-abc",
            supabase_jwt_secret="",
            supabase_url="",
            supabase_api_key="",
            looks_like_uuid_fn=lambda _value: True,
            get_supabase_jwks_client_fn=lambda: None,
            jwt_module=_JwtStub({}),
            logger=logger,
            requests_module=_RequestsStub(),
        )

        self.assertIsNone(payload)
        self.assertEqual(len(logger.warnings), 1)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from backend.route_groups.api_supabase_auth_access import (
    generate_supabase_magic_link_url,
    send_supabase_email_link,
    verify_supabase_user_token,
)


class _ResponseStub:
    def __init__(
        self,
        status_code: int,
        payload=None,
        text: str = "",
        has_content: bool = True,
        headers: dict[str, str] | None = None,
    ):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
        self.content = b"x" if has_content else b""
        self.headers = headers or {}

    def json(self):
        return self._payload


class _RequestsStub:
    class exceptions:
        class ReadTimeout(Exception):
            pass

        class Timeout(Exception):
            pass

    def __init__(self, post_response: _ResponseStub | None = None, get_response: _ResponseStub | None = None):
        self._post_response = post_response or _ResponseStub(200)
        self._get_response = get_response or _ResponseStub(200, payload={})
        self._get_exceptions = []
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
        if self._get_exceptions:
            raise self._get_exceptions.pop(0)
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
        self.exceptions = []

    def warning(self, message, *args):
        self.warnings.append((message, args))

    def exception(self, message, *args):
        self.exceptions.append((message, args))


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
        self.assertEqual(
            (call["params"] or {}).get("redirect_to"),
            "https://app.example.com/login?source=signup",
        )

    def test_send_supabase_email_link_allows_local_signin_to_create_user(self) -> None:
        requests_stub = _RequestsStub(post_response=_ResponseStub(200))

        send_supabase_email_link(
            "user@example.com",
            "signin",
            client_redirect_to="http://127.0.0.1:5173",
            redirect_path="/login",
            redirect_query=None,
            supabase_url="http://127.0.0.1:54321",
            supabase_api_key="public-key",
            build_auth_redirect_url_fn=lambda *_args, **_kwargs: "http://127.0.0.1:5173/login",
            requests_module=requests_stub,
        )

        self.assertEqual(len(requests_stub.post_calls), 1)
        call = requests_stub.post_calls[0]
        self.assertTrue(call["json"]["create_user"])

    def test_send_supabase_email_link_keeps_hosted_signin_non_creating(self) -> None:
        requests_stub = _RequestsStub(post_response=_ResponseStub(200))

        send_supabase_email_link(
            "user@example.com",
            "signin",
            client_redirect_to="https://app.example.com",
            redirect_path="/login",
            redirect_query=None,
            supabase_url="https://demo.supabase.co",
            supabase_api_key="public-key",
            build_auth_redirect_url_fn=lambda *_args, **_kwargs: "https://app.example.com/login",
            requests_module=requests_stub,
        )

        self.assertEqual(len(requests_stub.post_calls), 1)
        call = requests_stub.post_calls[0]
        self.assertFalse(call["json"]["create_user"])

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

    def test_send_supabase_email_link_can_require_redirect_target(self) -> None:
        requests_stub = _RequestsStub(post_response=_ResponseStub(200))

        with self.assertRaises(Exception) as context:
            send_supabase_email_link(
                "user@example.com",
                "signin",
                client_redirect_to="",
                redirect_path="/agent/pairing-callback",
                redirect_query={"agent_action": "pair"},
                require_redirect=True,
                supabase_url="https://demo.supabase.co",
                supabase_api_key="public-key",
                build_auth_redirect_url_fn=lambda *_args, **_kwargs: None,
                requests_module=requests_stub,
            )

        exc = context.exception
        self.assertEqual(getattr(exc, "status_code", 0), 400)
        self.assertEqual(len(requests_stub.post_calls), 0)

    def test_send_supabase_email_link_surfaces_rate_limit_context(self) -> None:
        requests_stub = _RequestsStub(
            post_response=_ResponseStub(
                429,
                payload={"message": "Too many requests"},
                headers={"Retry-After": "30"},
            )
        )

        with self.assertRaises(Exception) as context:
            send_supabase_email_link(
                "user@example.com",
                "signin",
                client_redirect_to="https://app.example.com",
                redirect_path="/agent/pairing-callback",
                redirect_query={"agent_action": "pair"},
                supabase_url="https://demo.supabase.co",
                supabase_api_key="public-key",
                build_auth_redirect_url_fn=lambda *_args, **_kwargs: "https://app.example.com/agent/pairing-callback",
                requests_module=requests_stub,
            )

        exc = context.exception
        self.assertEqual(getattr(exc, "status_code", 0), 429)
        self.assertEqual(getattr(exc, "retry_after_seconds", 0), 30)
        self.assertIn("Too many requests", str(exc))

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

    def test_verify_supabase_user_token_retries_after_read_timeout(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub(
            get_response=_ResponseStub(200, payload={"id": "user-3"}),
        )
        requests_stub._get_exceptions = [
            requests_stub.exceptions.ReadTimeout("Read timed out"),
        ]

        payload = verify_supabase_user_token(
            "token-timeout-once",
            supabase_jwt_secret="",
            supabase_url="https://demo.supabase.co",
            supabase_api_key="public-key",
            looks_like_uuid_fn=lambda _value: True,
            get_supabase_jwks_client_fn=lambda: None,
            jwt_module=_JwtStub({}),
            logger=logger,
            requests_module=requests_stub,
        )

        self.assertEqual((payload or {}).get("id"), "user-3")
        self.assertEqual(len(requests_stub.get_calls), 2)

    def test_verify_supabase_user_token_raises_provider_timeout_after_retries(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub(
            get_response=_ResponseStub(200, payload={"id": "unused"}),
        )
        requests_stub._get_exceptions = [
            requests_stub.exceptions.ReadTimeout("Read timed out"),
            requests_stub.exceptions.ReadTimeout("Read timed out again"),
        ]

        with self.assertRaises(Exception) as context:
            verify_supabase_user_token(
                "token-timeout-twice",
                supabase_jwt_secret="",
                supabase_url="https://demo.supabase.co",
                supabase_api_key="public-key",
                looks_like_uuid_fn=lambda _value: True,
                get_supabase_jwks_client_fn=lambda: None,
                jwt_module=_JwtStub({}),
                logger=logger,
                requests_module=requests_stub,
            )

        self.assertEqual(getattr(context.exception, "code", ""), "AUTH_PROVIDER_TIMEOUT")
        self.assertEqual(len(requests_stub.get_calls), 2)

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

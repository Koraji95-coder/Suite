from __future__ import annotations

import unittest

from flask import Flask
from flask_limiter import Limiter

from backend.route_groups.api_auth_email import create_auth_email_blueprint
from backend.route_groups.api_auth_email_support import auth_email_generic_response


def _make_app() -> Flask:
    app = Flask(__name__)
    app.config["TESTING"] = True

    limiter = Limiter(
        app=app,
        key_func=lambda: "test-client",
        default_limits=[],
        storage_uri="memory://",
        strategy="fixed-window",
    )

    app.register_blueprint(
        create_auth_email_blueprint(
            limiter=limiter,
            logger=app.logger,
            supabase_url="https://example.supabase.co",
            supabase_api_key="service-key",
            auth_email_honeypot_field="website",
            auth_email_turnstile_secret="",
            auth_email_require_turnstile=False,
            apply_auth_email_response_floor=lambda _started_at: None,
            auth_email_generic_response=auth_email_generic_response,
            is_valid_email=lambda email: "@" in email,
            get_request_ip=lambda: "127.0.0.1",
            is_auth_email_request_allowed=lambda email, ip: (True, "ok"),
            email_fingerprint=lambda email: email[:8],
            verify_turnstile_token=lambda token, ip: True,
            send_supabase_email_link=lambda email, flow, **kw: None,
        )
    )
    return app


class TestApiAuthEmailSecurity(unittest.TestCase):
    def setUp(self) -> None:
        self.app = _make_app()
        self.client = self.app.test_client()

    def test_send_link_exception_returns_generic_response(self) -> None:
        """Exception from send_supabase_email_link must not expose error text in the HTTP response."""
        def _raising_send(email, flow, **kw):
            raise RuntimeError("output/token.txt not found")

        app = Flask(__name__)
        app.config["TESTING"] = True
        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )
        app.register_blueprint(
            create_auth_email_blueprint(
                limiter=limiter,
                logger=app.logger,
                supabase_url="https://example.supabase.co",
                supabase_api_key="service-key",
                auth_email_honeypot_field="website",
                auth_email_turnstile_secret="",
                auth_email_require_turnstile=False,
                apply_auth_email_response_floor=lambda _started_at: None,
                auth_email_generic_response=auth_email_generic_response,
                is_valid_email=lambda email: "@" in email,
                get_request_ip=lambda: "127.0.0.1",
                is_auth_email_request_allowed=lambda email, ip: (True, "ok"),
                email_fingerprint=lambda email: email[:8],
                verify_turnstile_token=lambda token, ip: True,
                send_supabase_email_link=_raising_send,
            )
        )
        client = app.test_client()

        response = client.post(
            "/api/auth/email-link",
            json={"email": "user@example.com", "flow": "signin"},
        )

        self.assertEqual(response.status_code, 202)
        body = response.get_json() or {}
        self.assertNotIn("token.txt", str(body))
        self.assertNotIn("not found", str(body))
        self.assertNotIn("RuntimeError", str(body))
        self.assertEqual(body.get("ok"), True)

    def test_send_link_success_returns_generic_response(self) -> None:
        """Successful send_supabase_email_link returns the static generic response."""
        response = self.client.post(
            "/api/auth/email-link",
            json={"email": "user@example.com", "flow": "signin"},
        )

        self.assertEqual(response.status_code, 202)
        body = response.get_json() or {}
        self.assertEqual(body.get("ok"), True)
        self.assertIn("link has been sent", body.get("message", ""))


if __name__ == "__main__":
    unittest.main()

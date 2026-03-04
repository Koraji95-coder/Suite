from __future__ import annotations

from types import SimpleNamespace
import unittest

from backend.route_groups.api_auth_identity import (
    get_bearer_token,
    get_supabase_user_email,
    get_supabase_user_id,
)


class TestApiAuthIdentity(unittest.TestCase):
    def test_get_supabase_user_id_prefers_id_then_sub(self) -> None:
        self.assertEqual(get_supabase_user_id({"id": "user-1", "sub": "sub-1"}), "user-1")
        self.assertEqual(get_supabase_user_id({"sub": "sub-2"}), "sub-2")
        self.assertIsNone(get_supabase_user_id({}))

    def test_get_supabase_user_email_normalizes_and_validates(self) -> None:
        is_valid = lambda value: "@" in value and "." in value

        self.assertEqual(
            get_supabase_user_email(
                {"email": "  USER@Example.COM  "},
                is_valid_email_fn=is_valid,
            ),
            "user@example.com",
        )
        self.assertIsNone(
            get_supabase_user_email(
                {"email": "not-an-email"},
                is_valid_email_fn=is_valid,
            )
        )
        self.assertIsNone(get_supabase_user_email({}, is_valid_email_fn=is_valid))

    def test_get_bearer_token_parses_authorization_header(self) -> None:
        request_obj = SimpleNamespace(headers={"Authorization": "Bearer token-123"})
        self.assertEqual(get_bearer_token(request_obj=request_obj), "token-123")

        request_obj = SimpleNamespace(headers={"Authorization": "Basic abc123"})
        self.assertIsNone(get_bearer_token(request_obj=request_obj))

        request_obj = SimpleNamespace(headers={})
        self.assertIsNone(get_bearer_token(request_obj=request_obj))


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from backend.route_groups.api_passkey_store_access import (
    fetch_active_passkey_by_credential_id,
    fetch_active_passkeys_for_user_id,
    insert_user_passkey_row,
    update_user_passkey_row,
)


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message, *args):
        self.warnings.append((message, args))


class _SupabaseRequestStub:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def __call__(self, method, table_path, **kwargs):
        self.calls.append((method, table_path, kwargs))
        if self._responses:
            return self._responses.pop(0)
        return None, None, 200


class TestApiPasskeyStoreAccess(unittest.TestCase):
    def test_fetch_active_passkeys_for_user_id_empty_input(self) -> None:
        logger = _LoggerStub()
        supabase = _SupabaseRequestStub([])
        rows = fetch_active_passkeys_for_user_id(
            "   ",
            supabase_service_rest_request=supabase,
            logger=logger,
        )
        self.assertEqual(rows, [])
        self.assertEqual(supabase.calls, [])

    def test_fetch_active_passkeys_for_user_id_filters_non_dict_rows(self) -> None:
        logger = _LoggerStub()
        supabase = _SupabaseRequestStub(
            [
                (
                    [
                        {"id": "pk-1", "credential_id": "cred-1"},
                        "bad-row",
                        {"id": "pk-2", "credential_id": "cred-2"},
                    ],
                    None,
                    200,
                )
            ]
        )
        rows = fetch_active_passkeys_for_user_id(
            "user-1",
            supabase_service_rest_request=supabase,
            logger=logger,
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["id"], "pk-1")
        self.assertEqual(rows[1]["id"], "pk-2")

    def test_fetch_active_passkey_by_credential_id_returns_first_row(self) -> None:
        logger = _LoggerStub()
        supabase = _SupabaseRequestStub(
            [
                (
                    [
                        {"id": "pk-1", "credential_id": "cred-1"},
                        {"id": "pk-2", "credential_id": "cred-1"},
                    ],
                    None,
                    200,
                )
            ]
        )
        row = fetch_active_passkey_by_credential_id(
            "cred-1",
            supabase_service_rest_request=supabase,
            logger=logger,
        )
        self.assertEqual((row or {}).get("id"), "pk-1")

    def test_fetch_active_passkey_by_credential_id_logs_on_error(self) -> None:
        logger = _LoggerStub()
        supabase = _SupabaseRequestStub([(None, "boom", 500)])
        row = fetch_active_passkey_by_credential_id(
            "cred-1",
            supabase_service_rest_request=supabase,
            logger=logger,
        )
        self.assertIsNone(row)
        self.assertEqual(len(logger.warnings), 1)

    def test_insert_user_passkey_row_returns_inserted_row(self) -> None:
        supabase = _SupabaseRequestStub(
            [([{"id": "pk-1", "credential_id": "cred-1"}], None, 201)]
        )
        row, error, status = insert_user_passkey_row(
            {"credential_id": "cred-1"},
            supabase_service_rest_request=supabase,
        )
        self.assertEqual((row or {}).get("id"), "pk-1")
        self.assertIsNone(error)
        self.assertEqual(status, 201)

    def test_update_user_passkey_row_requires_id(self) -> None:
        supabase = _SupabaseRequestStub([])
        ok, error, status = update_user_passkey_row(
            "   ",
            {"friendly_name": "Key"},
            supabase_service_rest_request=supabase,
        )
        self.assertEqual((ok, error, status), (False, "passkey id is required.", 0))
        self.assertEqual(supabase.calls, [])

    def test_update_user_passkey_row_success(self) -> None:
        supabase = _SupabaseRequestStub([(None, None, 204)])
        ok, error, status = update_user_passkey_row(
            "pk-1",
            {"friendly_name": "Key"},
            supabase_service_rest_request=supabase,
        )
        self.assertEqual((ok, error, status), (True, None, 204))


if __name__ == "__main__":
    unittest.main()

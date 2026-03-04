from __future__ import annotations

import re
import unittest

from backend.route_groups.api_passkey_formatting import (
    coerce_webauthn_enum_value,
    extract_passkey_credential_id,
    normalize_passkey_friendly_name,
    normalize_passkey_transports,
)


class _UnstringableValue:
    def __str__(self) -> str:
        raise RuntimeError("cannot stringify")


class _EnumLike:
    def __init__(self, value: str) -> None:
        self.value = value


class _EnumLikeWithBrokenValue:
    def __init__(self) -> None:
        self.value = _UnstringableValue()

    def __str__(self) -> str:
        return "fallback"


class TestApiPasskeyFormatting(unittest.TestCase):
    def test_normalize_passkey_transports_filters_and_dedupes(self) -> None:
        transports = normalize_passkey_transports(
            ["USB", "usb", " nfc ", None, "unknown", "BLE", "ble", "internal"]
        )
        self.assertEqual(transports, ["usb", "nfc", "ble", "internal"])

    def test_normalize_passkey_transports_requires_list(self) -> None:
        self.assertEqual(normalize_passkey_transports("usb"), [])

    def test_normalize_passkey_friendly_name_trims_and_clamps(self) -> None:
        self.assertEqual(
            normalize_passkey_friendly_name(" \n My\rPass\nKey  "),
            "My Pass Key",
        )
        self.assertEqual(len(normalize_passkey_friendly_name("x" * 120)), 80)

    def test_extract_passkey_credential_id_uses_id_and_raw_id(self) -> None:
        credential_id_pattern = re.compile(r"^[A-Za-z0-9_-]{16,1024}$")
        credential_id = "AbCdEfGhIjKlMnOp"

        self.assertEqual(
            extract_passkey_credential_id(
                {"id": f"  {credential_id}  "},
                credential_id_pattern=credential_id_pattern,
            ),
            credential_id,
        )
        self.assertEqual(
            extract_passkey_credential_id(
                {"rawId": credential_id},
                credential_id_pattern=credential_id_pattern,
            ),
            credential_id,
        )

    def test_extract_passkey_credential_id_rejects_invalid_payloads(self) -> None:
        credential_id_pattern = re.compile(r"^[A-Za-z0-9_-]{16,1024}$")
        self.assertEqual(
            extract_passkey_credential_id(
                {"id": "short"},
                credential_id_pattern=credential_id_pattern,
            ),
            "",
        )
        self.assertEqual(
            extract_passkey_credential_id(
                "not-a-dict",
                credential_id_pattern=credential_id_pattern,
            ),
            "",
        )

    def test_coerce_webauthn_enum_value(self) -> None:
        self.assertEqual(coerce_webauthn_enum_value(None), "")
        self.assertEqual(coerce_webauthn_enum_value(_EnumLike("platform")), "platform")
        self.assertEqual(coerce_webauthn_enum_value(_EnumLikeWithBrokenValue()), "fallback")
        self.assertEqual(coerce_webauthn_enum_value(42), "42")


if __name__ == "__main__":
    unittest.main()

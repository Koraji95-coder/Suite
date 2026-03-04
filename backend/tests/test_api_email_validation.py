from __future__ import annotations

import unittest

from backend.route_groups.api_email_validation import is_valid_email


class TestApiEmailValidation(unittest.TestCase):
    def test_valid_email(self) -> None:
        self.assertTrue(is_valid_email("user@example.com"))

    def test_invalid_email_empty(self) -> None:
        self.assertFalse(is_valid_email(""))

    def test_invalid_email_missing_at(self) -> None:
        self.assertFalse(is_valid_email("user.example.com"))

    def test_invalid_email_with_spaces(self) -> None:
        self.assertFalse(is_valid_email("user name@example.com"))


if __name__ == "__main__":
    unittest.main()

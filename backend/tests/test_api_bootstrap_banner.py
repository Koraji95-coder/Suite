from __future__ import annotations

import unittest

from backend.route_groups.api_bootstrap_banner import (
    initial_manager_status_lines,
    print_initial_manager_status,
    print_startup_banner,
    startup_banner_lines,
)


class TestApiBootstrapBanner(unittest.TestCase):
    def test_startup_banner_lines(self) -> None:
        lines = startup_banner_lines("127.0.0.1", 5000)
        self.assertIn("Coordinates Grabber API Server", lines)
        self.assertIn("Server starting on: http://127.0.0.1:5000", lines)
        self.assertIn("Health check: http://127.0.0.1:5000/health", lines)
        self.assertIn("Status endpoint: http://127.0.0.1:5000/api/status", lines)
        self.assertEqual(lines[0], "=" * 60)
        self.assertEqual(lines[-1], "=" * 60)

    def test_initial_manager_status_lines_running_with_drawing(self) -> None:
        lines = initial_manager_status_lines(
            {
                "autocad_running": True,
                "autocad_path": "C:/Program Files/AutoCAD/acad.exe",
                "drawing_open": True,
                "drawing_name": "demo.dwg",
            }
        )
        self.assertEqual(lines[0], "[OK] AutoCAD detected: C:/Program Files/AutoCAD/acad.exe")
        self.assertEqual(lines[1], "[OK] Drawing open: demo.dwg")
        self.assertEqual(lines[-2], "=" * 60)
        self.assertEqual(lines[-1], "")

    def test_initial_manager_status_lines_running_without_drawing(self) -> None:
        lines = initial_manager_status_lines(
            {
                "autocad_running": True,
                "autocad_path": "C:/Program Files/AutoCAD/acad.exe",
                "drawing_open": False,
                "drawing_name": "",
            }
        )
        self.assertIn("[WARN] No drawing is currently open", lines)

    def test_initial_manager_status_lines_not_running(self) -> None:
        lines = initial_manager_status_lines(
            {
                "autocad_running": False,
                "autocad_path": "",
                "drawing_open": False,
                "drawing_name": "",
            }
        )
        self.assertEqual(lines[0], "[WARN] AutoCAD not detected - waiting for it to start...")

    def test_print_helpers(self) -> None:
        printed = []
        print_startup_banner("127.0.0.1", 5000, print_fn=lambda message: printed.append(message))
        self.assertTrue(printed)
        self.assertEqual(printed[0], "=" * 60)

        printed_status = []
        print_initial_manager_status(
            {
                "autocad_running": False,
                "autocad_path": "",
                "drawing_open": False,
                "drawing_name": "",
            },
            print_fn=lambda message: printed_status.append(message),
        )
        self.assertTrue(printed_status)
        self.assertEqual(printed_status[0], "[WARN] AutoCAD not detected - waiting for it to start...")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_autocad_reference_catalog import (
    create_autocad_reference_catalog_blueprint,
)


class TestApiAutocadReferenceCatalog(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.menu_index_path = Path(self.temp_dir.name) / "autocad-electrical-2026-menu-index.generated.json"
        self.lookup_index_path = Path(self.temp_dir.name) / "autocad-electrical-2026-lookup-index.generated.json"
        self.menu_index_path.write_text(
            json.dumps(
                {
                    "schemaVersion": "suite.autodesk.acade.menu-index.v1",
                    "generatedAt": "2026-04-02T20:30:00.000Z",
                    "source": {
                        "installationContext": "docs/development/autocad-electrical-2026-installation-context-reference.md",
                    },
                    "availableKinds": ["schematic", "panel", "process", "utility"],
                    "recommendedDefaults": {
                        "schematic": ["jic", "nfpa"],
                        "panel": ["panel_layout"],
                        "process": ["pid"],
                        "utility": ["location_symbols"],
                    },
                    "families": [
                        {
                            "id": "jic",
                            "label": "JIC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 555,
                            "topCategories": ["Push Buttons", "PLC I/O"],
                            "fileNames": ["ACE_JIC_MENU.DAT"],
                            "includesLegacy": False,
                        },
                        {
                            "id": "panel_layout",
                            "label": "Panel Layout",
                            "kind": "panel",
                            "menuCount": 1,
                            "totalEntryCount": 147,
                            "topCategories": ["Push Buttons", "Relays"],
                            "fileNames": ["ACE_PANEL_MENU.DAT"],
                            "includesLegacy": False,
                        },
                        {
                            "id": "pid",
                            "label": "P&ID",
                            "kind": "process",
                            "menuCount": 1,
                            "totalEntryCount": 273,
                            "topCategories": ["Equipment", "Valves"],
                            "fileNames": ["ACE_PID_MENU.DAT"],
                            "includesLegacy": False,
                        },
                        {
                            "id": "location_symbols",
                            "label": "Location Symbols",
                            "kind": "utility",
                            "menuCount": 1,
                            "totalEntryCount": 9,
                            "topCategories": ["Filled Triangle"],
                            "fileNames": ["wd_locs.dat"],
                            "includesLegacy": False,
                        },
                    ],
                    "standards": [
                        {
                            "id": "jic",
                            "label": "JIC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 555,
                            "topCategories": ["Push Buttons", "PLC I/O"],
                            "fileNames": ["ACE_JIC_MENU.DAT"],
                            "includesLegacy": False,
                        }
                    ],
                    "menus": [
                        {
                            "id": "ace-jic-menu-dat",
                            "fileName": "ACE_JIC_MENU.DAT",
                            "kind": "schematic",
                            "familyId": "jic",
                            "familyLabel": "JIC",
                            "isLegacy": False,
                            "title": "JIC: Schematic Symbols",
                            "pageCount": 55,
                            "totalEntryCount": 555,
                            "submenuCount": 57,
                            "commandActionCount": 68,
                            "symbolInsertCount": 429,
                            "topCategories": ["Push Buttons", "PLC I/O"],
                        },
                        {
                            "id": "ace-panel-menu-dat",
                            "fileName": "ACE_PANEL_MENU.DAT",
                            "kind": "panel",
                            "familyId": "panel_layout",
                            "familyLabel": "Panel Layout",
                            "isLegacy": False,
                            "title": "Panel Layout Symbols",
                            "pageCount": 18,
                            "totalEntryCount": 147,
                            "submenuCount": 17,
                            "commandActionCount": 130,
                            "symbolInsertCount": 0,
                            "topCategories": ["Push Buttons", "Relays"],
                        },
                        {
                            "id": "ace-pid-menu-dat",
                            "fileName": "ACE_PID_MENU.DAT",
                            "kind": "process",
                            "familyId": "pid",
                            "familyLabel": "P&ID",
                            "isLegacy": False,
                            "title": "Piping and Instrumentation Symbols",
                            "pageCount": 30,
                            "totalEntryCount": 273,
                            "submenuCount": 29,
                            "commandActionCount": 0,
                            "symbolInsertCount": 244,
                            "topCategories": ["Equipment", "Valves"],
                        },
                        {
                            "id": "wd-locs-dat",
                            "fileName": "wd_locs.dat",
                            "kind": "utility",
                            "familyId": "location_symbols",
                            "familyLabel": "Location Symbols",
                            "isLegacy": False,
                            "title": "INSERT LOCATION SYMBOLS:",
                            "pageCount": 2,
                            "totalEntryCount": 9,
                            "submenuCount": 1,
                            "commandActionCount": 0,
                            "symbolInsertCount": 8,
                            "topCategories": ["Filled Triangle"],
                        },
                    ],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        self.lookup_index_path.write_text(
            json.dumps(
                {
                    "schemaVersion": "suite.autodesk.acade.lookup-index.v1",
                    "generatedAt": "2026-04-02T20:35:00.000Z",
                    "source": {
                        "installationContext": "docs/development/autocad-electrical-2026-installation-context-reference.md",
                    },
                    "availableRoleIds": [
                        "catalog_lookup",
                        "footprint_lookup",
                        "plc_lookup",
                        "via_component_lookup",
                    ],
                    "recommendedDefaults": {
                        "catalog": "default_cat",
                        "plc": "ace_plc",
                        "viaComponent": "wdviacmp",
                    },
                    "roles": [
                        {
                            "id": "catalog_lookup",
                            "label": "Catalog Lookup",
                            "databaseCount": 1,
                            "tableCount": 2,
                            "fileNames": ["default_cat.mdb"],
                            "databaseIds": ["default_cat"],
                            "includesOptional": False,
                        },
                        {
                            "id": "footprint_lookup",
                            "label": "Footprint Lookup",
                            "databaseCount": 1,
                            "tableCount": 0,
                            "fileNames": ["footprint_lookup.mdb"],
                            "databaseIds": ["footprint_lookup"],
                            "includesOptional": True,
                        },
                        {
                            "id": "plc_lookup",
                            "label": "PLC Lookup",
                            "databaseCount": 1,
                            "tableCount": 1,
                            "fileNames": ["ace_plc.mdb"],
                            "databaseIds": ["ace_plc"],
                            "includesOptional": False,
                        },
                        {
                            "id": "via_component_lookup",
                            "label": "Via Component Lookup",
                            "databaseCount": 1,
                            "tableCount": 1,
                            "fileNames": ["wdviacmp.mdb"],
                            "databaseIds": ["wdviacmp"],
                            "includesOptional": False,
                        },
                    ],
                    "databases": [
                        {
                            "id": "default_cat",
                            "fileName": "default_cat.mdb",
                            "filePath": "C:/Acade/en-US/DB/default_cat.mdb",
                            "roleId": "catalog_lookup",
                            "roleLabel": "Catalog Lookup",
                            "label": "Default Catalog",
                            "description": "Primary catalog, family, and footprint lookup source for ACADE component selection.",
                            "isOptional": False,
                            "hasError": False,
                            "error": "",
                            "tableCount": 2,
                            "interestingTableCount": 2,
                            "tableNames": ["_FAM", "_PINLIST"],
                            "interestingTables": [
                                {
                                    "name": "_FAM",
                                    "type": "TABLE",
                                    "columnCount": 4,
                                    "columns": ["MFG", "CAT", "FAMILY", "DESC1"],
                                },
                                {
                                    "name": "_PINLIST",
                                    "type": "TABLE",
                                    "columnCount": 3,
                                    "columns": ["PIN1", "PIN2", "TYPE"],
                                },
                            ],
                            "tables": [
                                {
                                    "name": "_FAM",
                                    "type": "TABLE",
                                    "columnCount": 4,
                                    "columns": ["MFG", "CAT", "FAMILY", "DESC1"],
                                },
                                {
                                    "name": "_PINLIST",
                                    "type": "TABLE",
                                    "columnCount": 3,
                                    "columns": ["PIN1", "PIN2", "TYPE"],
                                },
                            ],
                        },
                        {
                            "id": "footprint_lookup",
                            "fileName": "footprint_lookup.mdb",
                            "filePath": "C:/Acade/en-US/DB/footprint_lookup.mdb",
                            "roleId": "footprint_lookup",
                            "roleLabel": "Footprint Lookup",
                            "label": "Footprint Lookup",
                            "description": "Optional footprint lookup payload present on some workstations and sometimes empty.",
                            "isOptional": True,
                            "hasError": False,
                            "error": "",
                            "tableCount": 0,
                            "interestingTableCount": 0,
                            "tableNames": [],
                            "interestingTables": [],
                            "tables": [],
                        },
                        {
                            "id": "ace_plc",
                            "fileName": "ace_plc.mdb",
                            "filePath": "C:/Acade/en-US/DB/ace_plc.mdb",
                            "roleId": "plc_lookup",
                            "roleLabel": "PLC Lookup",
                            "label": "ACE PLC",
                            "description": "PLC manufacturer and style lookup source used by spreadsheet-to-PLC workflows.",
                            "isOptional": False,
                            "hasError": False,
                            "error": "",
                            "tableCount": 1,
                            "interestingTableCount": 1,
                            "tableNames": ["_PLCIO"],
                            "interestingTables": [
                                {
                                    "name": "_PLCIO",
                                    "type": "TABLE",
                                    "columnCount": 4,
                                    "columns": ["STYLE", "MFG", "CAT", "PINS"],
                                }
                            ],
                            "tables": [
                                {
                                    "name": "_PLCIO",
                                    "type": "TABLE",
                                    "columnCount": 4,
                                    "columns": ["STYLE", "MFG", "CAT", "PINS"],
                                }
                            ],
                        },
                        {
                            "id": "wdviacmp",
                            "fileName": "wdviacmp.mdb",
                            "filePath": "C:/Acade/UserSupport/wdviacmp.mdb",
                            "roleId": "via_component_lookup",
                            "roleLabel": "Via Component Lookup",
                            "label": "Via Component Mapping",
                            "description": "Via-component mapping surface used for component and attribute swap relationships.",
                            "isOptional": False,
                            "hasError": False,
                            "error": "",
                            "tableCount": 1,
                            "interestingTableCount": 1,
                            "tableNames": ["VIA_MAPPINGS"],
                            "interestingTables": [
                                {
                                    "name": "VIA_MAPPINGS",
                                    "type": "TABLE",
                                    "columnCount": 3,
                                    "columns": ["SOURCE", "TARGET", "ATTR"],
                                }
                            ],
                            "tables": [
                                {
                                    "name": "VIA_MAPPINGS",
                                    "type": "TABLE",
                                    "columnCount": 3,
                                    "columns": ["SOURCE", "TARGET", "ATTR"],
                                }
                            ],
                        },
                    ],
                    "counts": {
                        "databases": 4,
                        "roles": 4,
                        "tables": 4,
                        "databasesWithErrors": 0,
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        app = Flask(__name__)
        app.config["TESTING"] = True
        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        app.register_blueprint(
            create_autocad_reference_catalog_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                menu_index_path=self.menu_index_path,
                lookup_index_path=self.lookup_index_path,
            )
        )
        self.client = app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_menu_index_returns_full_payload(self) -> None:
        response = self.client.get("/api/autocad/reference/menu-index")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(bool(response.headers.get("X-Request-ID")))

        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("success")))
        self.assertEqual(payload.get("schemaVersion"), "suite.autodesk.acade.menu-index.v1")
        self.assertEqual((payload.get("counts") or {}).get("totalMenus"), 4)
        self.assertEqual((payload.get("counts") or {}).get("filteredMenus"), 4)
        self.assertEqual((payload.get("recommendedDefaults") or {}).get("schematic"), ["jic", "nfpa"])
        self.assertEqual(len(payload.get("menus") or []), 4)

    def test_menu_index_supports_kind_family_and_query_filters(self) -> None:
        response = self.client.get(
            "/api/autocad/reference/menu-index?kind=schematic&family=jic&q=push"
        )
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertEqual((payload.get("counts") or {}).get("filteredMenus"), 1)
        self.assertEqual((payload.get("filters") or {}).get("kind"), "schematic")
        menus = payload.get("menus") or []
        self.assertEqual(len(menus), 1)
        self.assertEqual((menus[0] or {}).get("fileName"), "ACE_JIC_MENU.DAT")

    def test_standards_endpoint_returns_schematic_family_summary(self) -> None:
        response = self.client.get("/api/autocad/reference/standards")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("success")))
        self.assertEqual(payload.get("count"), 1)
        self.assertEqual(payload.get("recommendedDefaults"), ["jic", "nfpa"])
        standards = payload.get("standards") or []
        self.assertEqual((standards[0] or {}).get("id"), "jic")

    def test_missing_menu_index_uses_autocad_error_envelope(self) -> None:
        self.menu_index_path.unlink()

        response = self.client.get("/api/autocad/reference/menu-index")
        self.assertEqual(response.status_code, 503)
        self.assertTrue(bool(response.headers.get("X-Request-ID")))

        payload = response.get_json() or {}
        self.assertFalse(bool(payload.get("success")))
        self.assertEqual(payload.get("code"), "REFERENCE_CATALOG_UNAVAILABLE")
        self.assertEqual(payload.get("message"), "AutoCAD menu index is unavailable on this workstation.")
        self.assertTrue(bool(payload.get("requestId")))
        self.assertEqual(
            ((payload.get("meta") or {}).get("catalogPath")),
            str(self.menu_index_path),
        )

    def test_lookup_summary_returns_full_payload(self) -> None:
        response = self.client.get("/api/autocad/reference/lookups/summary")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(bool(response.headers.get("X-Request-ID")))

        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("success")))
        self.assertEqual(payload.get("schemaVersion"), "suite.autodesk.acade.lookup-index.v1")
        self.assertEqual((payload.get("counts") or {}).get("totalDatabases"), 4)
        self.assertEqual((payload.get("counts") or {}).get("filteredDatabases"), 4)
        self.assertEqual((payload.get("recommendedDefaults") or {}).get("catalog"), "default_cat")
        self.assertEqual(len(payload.get("databases") or []), 4)

    def test_lookup_summary_supports_role_and_query_filters(self) -> None:
        response = self.client.get(
            "/api/autocad/reference/lookups/summary?role=catalog_lookup&q=pin"
        )
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertEqual((payload.get("counts") or {}).get("filteredDatabases"), 1)
        self.assertEqual((payload.get("filters") or {}).get("role"), "catalog_lookup")
        databases = payload.get("databases") or []
        self.assertEqual(len(databases), 1)
        self.assertEqual((databases[0] or {}).get("id"), "default_cat")

    def test_lookup_detail_returns_database_with_tables(self) -> None:
        response = self.client.get("/api/autocad/reference/lookups/default_cat")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("success")))
        lookup = payload.get("lookup") or {}
        self.assertEqual(lookup.get("id"), "default_cat")
        self.assertEqual(lookup.get("roleId"), "catalog_lookup")
        self.assertEqual(len(lookup.get("tables") or []), 2)

    def test_lookup_detail_returns_not_found_error_envelope(self) -> None:
        response = self.client.get("/api/autocad/reference/lookups/not-real")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(bool(response.headers.get("X-Request-ID")))

        payload = response.get_json() or {}
        self.assertFalse(bool(payload.get("success")))
        self.assertEqual(payload.get("code"), "REFERENCE_LOOKUP_NOT_FOUND")
        self.assertTrue(bool(payload.get("requestId")))
        self.assertEqual(((payload.get("meta") or {}).get("lookupId")), "not-real")

    def test_missing_lookup_index_uses_autocad_error_envelope(self) -> None:
        self.lookup_index_path.unlink()

        response = self.client.get("/api/autocad/reference/lookups/summary")
        self.assertEqual(response.status_code, 503)
        self.assertTrue(bool(response.headers.get("X-Request-ID")))

        payload = response.get_json() or {}
        self.assertFalse(bool(payload.get("success")))
        self.assertEqual(payload.get("code"), "REFERENCE_LOOKUP_UNAVAILABLE")
        self.assertEqual(payload.get("message"), "AutoCAD lookup catalog is unavailable on this workstation.")
        self.assertTrue(bool(payload.get("requestId")))
        self.assertEqual(
            ((payload.get("meta") or {}).get("catalogPath")),
            str(self.lookup_index_path),
        )


class TestApiAutocadReferenceCatalogWithLegacyMenus(unittest.TestCase):
    """Integration tests for legacy menu fallback behavior (ACE_IEC_MENU.DAT and related files)."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.menu_index_path = Path(self.temp_dir.name) / "autocad-electrical-2026-menu-index.generated.json"
        self.lookup_index_path = Path(self.temp_dir.name) / "autocad-electrical-2026-lookup-index.generated.json"

        # Fixture includes JIC (primary), IEC (fallback), Legacy IEC, and Legacy JIC menus.
        self.menu_index_path.write_text(
            json.dumps(
                {
                    "schemaVersion": "suite.autodesk.acade.menu-index.v1",
                    "generatedAt": "2026-04-02T20:30:00.000Z",
                    "source": {
                        "installationContext": "docs/development/autocad-electrical-2026-installation-context-reference.md",
                    },
                    "availableKinds": ["schematic"],
                    "recommendedDefaults": {
                        "schematic": ["jic", "iec"],
                        "panel": [],
                        "process": [],
                        "utility": [],
                    },
                    "families": [
                        {
                            "id": "jic",
                            "label": "JIC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 555,
                            "topCategories": ["Push Buttons", "PLC I/O"],
                            "fileNames": ["ACE_JIC_MENU.DAT"],
                            "includesLegacy": False,
                        },
                        {
                            "id": "iec",
                            "label": "IEC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 1118,
                            "topCategories": ["Push Buttons", "Selector Switches", "Breakers/Disconnects"],
                            "fileNames": ["ACE_IEC_MENU.DAT"],
                            "includesLegacy": False,
                        },
                        {
                            "id": "legacy_iec",
                            "label": "Legacy IEC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 642,
                            "topCategories": ["Push Buttons", "Selector Switches"],
                            "fileNames": ["IEC_MENU.DAT"],
                            "includesLegacy": True,
                        },
                        {
                            "id": "legacy_jic",
                            "label": "Legacy JIC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 535,
                            "topCategories": ["Push Buttons", "Relays/Contacts"],
                            "fileNames": ["WD_MENU.DAT"],
                            "includesLegacy": True,
                        },
                    ],
                    "standards": [
                        {
                            "id": "jic",
                            "label": "JIC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 555,
                            "topCategories": ["Push Buttons", "PLC I/O"],
                            "fileNames": ["ACE_JIC_MENU.DAT"],
                            "includesLegacy": False,
                        },
                        {
                            "id": "iec",
                            "label": "IEC",
                            "kind": "schematic",
                            "menuCount": 1,
                            "totalEntryCount": 1118,
                            "topCategories": ["Push Buttons", "Selector Switches", "Breakers/Disconnects"],
                            "fileNames": ["ACE_IEC_MENU.DAT"],
                            "includesLegacy": False,
                        },
                    ],
                    "menus": [
                        {
                            "id": "ace-jic-menu-dat",
                            "fileName": "ACE_JIC_MENU.DAT",
                            "kind": "schematic",
                            "familyId": "jic",
                            "familyLabel": "JIC",
                            "isLegacy": False,
                            "title": "JIC: Schematic Symbols",
                            "pageCount": 55,
                            "totalEntryCount": 555,
                            "submenuCount": 57,
                            "commandActionCount": 68,
                            "symbolInsertCount": 429,
                            "topCategories": ["Push Buttons", "PLC I/O"],
                        },
                        {
                            "id": "ace-iec-menu-dat",
                            "fileName": "ACE_IEC_MENU.DAT",
                            "kind": "schematic",
                            "familyId": "iec",
                            "familyLabel": "IEC",
                            "isLegacy": False,
                            "title": "IEC: Schematic Symbols",
                            "pageCount": 104,
                            "totalEntryCount": 1118,
                            "submenuCount": 102,
                            "commandActionCount": 221,
                            "symbolInsertCount": 793,
                            "topCategories": ["Push Buttons", "Selector Switches", "Breakers/Disconnects"],
                        },
                        {
                            "id": "iec-menu-dat",
                            "fileName": "IEC_MENU.DAT",
                            "kind": "schematic",
                            "familyId": "legacy_iec",
                            "familyLabel": "Legacy IEC",
                            "isLegacy": True,
                            "title": "IEC Schematic Symbols (Legacy)",
                            "pageCount": 50,
                            "totalEntryCount": 642,
                            "submenuCount": 48,
                            "commandActionCount": 90,
                            "symbolInsertCount": 504,
                            "topCategories": ["Push Buttons", "Selector Switches"],
                        },
                        {
                            "id": "wd-menu-dat",
                            "fileName": "WD_MENU.DAT",
                            "kind": "schematic",
                            "familyId": "legacy_jic",
                            "familyLabel": "Legacy JIC",
                            "isLegacy": True,
                            "title": "Schematic Symbols",
                            "pageCount": 42,
                            "totalEntryCount": 535,
                            "submenuCount": 40,
                            "commandActionCount": 80,
                            "symbolInsertCount": 415,
                            "topCategories": ["Push Buttons", "Relays/Contacts"],
                        },
                    ],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        # Minimal lookup index so the blueprint initialises without error.
        self.lookup_index_path.write_text(
            json.dumps(
                {
                    "schemaVersion": "suite.autodesk.acade.lookup-index.v1",
                    "generatedAt": "2026-04-02T20:35:00.000Z",
                    "source": {
                        "installationContext": "docs/development/autocad-electrical-2026-installation-context-reference.md",
                    },
                    "availableRoleIds": [],
                    "recommendedDefaults": {},
                    "roles": [],
                    "databases": [],
                    "counts": {
                        "databases": 0,
                        "roles": 0,
                        "tables": 0,
                        "databasesWithErrors": 0,
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        app = Flask(__name__)
        app.config["TESTING"] = True
        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        app.register_blueprint(
            create_autocad_reference_catalog_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                menu_index_path=self.menu_index_path,
                lookup_index_path=self.lookup_index_path,
            )
        )
        self.client = app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_menu_index_includes_iec_fallback_menu(self) -> None:
        response = self.client.get("/api/autocad/reference/menu-index")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("success")))
        menus = payload.get("menus") or []
        file_names = [(m or {}).get("fileName") for m in menus]
        self.assertIn("ACE_IEC_MENU.DAT", file_names)

    def test_menu_index_filter_by_iec_family_returns_ace_iec_menu(self) -> None:
        response = self.client.get("/api/autocad/reference/menu-index?kind=schematic&family=iec")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        menus = payload.get("menus") or []
        self.assertEqual(len(menus), 1)
        self.assertEqual((menus[0] or {}).get("fileName"), "ACE_IEC_MENU.DAT")
        self.assertFalse((menus[0] or {}).get("isLegacy"))

    def test_recommended_defaults_includes_iec_after_jic(self) -> None:
        response = self.client.get("/api/autocad/reference/menu-index")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        schematic_defaults = (payload.get("recommendedDefaults") or {}).get("schematic") or []
        self.assertIn("iec", schematic_defaults)
        self.assertIn("jic", schematic_defaults)
        self.assertLess(schematic_defaults.index("jic"), schematic_defaults.index("iec"))

    def test_recommended_defaults_excludes_legacy_families(self) -> None:
        response = self.client.get("/api/autocad/reference/menu-index")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        schematic_defaults = (payload.get("recommendedDefaults") or {}).get("schematic") or []
        self.assertNotIn("legacy_iec", schematic_defaults)
        self.assertNotIn("legacy_jic", schematic_defaults)

    def test_standards_endpoint_includes_iec_family(self) -> None:
        response = self.client.get("/api/autocad/reference/standards")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("success")))
        standards = payload.get("standards") or []
        standard_ids = [(s or {}).get("id") for s in standards]
        self.assertIn("iec", standard_ids)

    def test_legacy_menus_have_is_legacy_true(self) -> None:
        response = self.client.get("/api/autocad/reference/menu-index")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        menus = payload.get("menus") or []
        menus_by_file = {(m or {}).get("fileName"): m for m in menus}

        iec_menu = menus_by_file.get("ACE_IEC_MENU.DAT") or {}
        self.assertFalse(iec_menu.get("isLegacy"), "ACE_IEC_MENU.DAT should not be flagged as legacy")

        legacy_iec = menus_by_file.get("IEC_MENU.DAT") or {}
        self.assertTrue(legacy_iec.get("isLegacy"), "IEC_MENU.DAT should be flagged as legacy")

        legacy_jic = menus_by_file.get("WD_MENU.DAT") or {}
        self.assertTrue(legacy_jic.get("isLegacy"), "WD_MENU.DAT should be flagged as legacy")


if __name__ == "__main__":
    unittest.main()

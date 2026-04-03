from __future__ import annotations

import re

DEFAULT_BLOCK_NAME = "R3P-24x36BORDER&TITLE"
DEFAULT_WDL_LABELS = {
    "LINE1": "Client / Utility",
    "LINE2": "Facility / Site",
    "LINE4": "Project Number",
}
LEGACY_SUITE_STARTER_WDP_PREFIX = "; Suite starter AutoCAD Electrical project scaffold"
DEFAULT_WDP_CONFIG_LINES = (
    "+[1]%SL_DIR%NFPA/;%SL_DIR%NFPA/1-/;%SL_DIR%pneu_iso125/;%SL_DIR%hyd_iso125/;%SL_DIR%pid/",
    "+[2]ACE_NFPA_MENU.DAT",
    "+[3]%SL_DIR%panel/",
    "+[4]ACE_PANEL_MENU_NFPA.DAT",
    "+[5]1",
    "+[9]1,2,3",
    "+[10]0",
    "+[11]1",
    "+[12]0",
    "+[13]0",
    "+[14]0",
    "+[15]0",
    "+[18]0",
    "+[21]0",
    "+[22]",
    "+[23]0",
    "+[24]",
    "+[25]1",
    "+[26](0.00000 0.03125 0.00000 )",
    "+[29]0",
    "+[30]0.00",
)
PANEL_DRAWING_TITLE_HINTS = ("PANEL", "ELEVATION", "LAYOUT", "ENCLOSURE", "CABINET")
ACADE_OWNED_TAGS = ("DWGNO", "TITLE1", "TITLE2", "TITLE3", "PROJ")
SUITE_OWNED_TAGS = (
    "CADNO",
    "REV",
    "SCALE",
    "DWNBY",
    "DWNDATE",
    "CHKBY",
    "CHKDATE",
    "ENGR",
    "ENGRDATE",
    "REV1",
    "DESC1",
    "BY1",
    "CHK1",
    "DATE1",
    "REV2",
    "DESC2",
    "BY2",
    "CHK2",
    "DATE2",
    "REV3",
    "DESC3",
    "BY3",
    "CHK3",
    "DATE3",
    "REV4",
    "DESC4",
    "BY4",
    "CHK4",
    "DATE4",
    "REV5",
    "DESC5",
    "BY5",
    "CHK5",
    "DATE5",
)
TITLE_BLOCK_SCAN_TAGS = (
    *ACADE_OWNED_TAGS,
    *SUITE_OWNED_TAGS,
    "WD_TB",
)
TITLE_BLOCK_FILE_EXTENSIONS = {".dwg", ".pdf", ".wdt", ".wdp", ".wdl"}
DRAWING_FILE_EXTENSIONS = {".dwg", ".pdf"}
DIRECTORY_SKIP_NAMES = {
    ".git",
    ".playwright-cli",
    ".runlogs",
    ".codex-runtime",
    "node_modules",
    "dist",
    "dist-ssr",
    "bin",
    "obj",
    "artifacts",
}
FILENAME_DRAWING_NUMBER_PATTERN = re.compile(r"(?i)\bR3P(?:[-_][A-Z0-9]+){2,8}\b")
WDT_ATTRIBUTE_ORDER = ("DWGNO", "TITLE1", "TITLE2", "TITLE3", "PROJ")
WDT_FIELD_MAP = {
    "DWGNO": "DWGNAM",
    "TITLE1": "LINE1",
    "TITLE2": "LINE2",
    "TITLE3": "DWGDESC",
    "PROJ": "LINE4",
}
DETERMINISTIC_WDT_SOURCE_KEYS = {"DWGNAM", "DWGDESC", "LINE1", "LINE2", "LINE4"}

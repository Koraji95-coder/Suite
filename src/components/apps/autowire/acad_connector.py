"""
ConduitRoute — AutoCAD Terminal Strip Connector
================================================
Connects to a running AutoCAD instance via COM, scans for Terminal Strip
blocks, parses their attributes (panel, side, strip number, terminal IDs),
and builds a structured model that the routing engine can work with.

Requirements:
    pip install pywin32 comtypes

Usage:
    from acad_connector import AcadConnector

    conn = AcadConnector()
    conn.connect()                    # Attach to running AutoCAD
    strips = conn.scan_terminal_strips()  # Find all terminal strip blocks
    terminals = conn.get_all_terminals()  # Flat list of routable terminals
    conn.route_wire("RP1L1:T03", "RP2R2:T07", cable_type="DC", wire_fn="Positive")
"""

from __future__ import annotations

import json
import logging
import re
import sys
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Optional

logger = logging.getLogger("conduitroute.acad")


# ─── Data Model ──────────────────────────────────────────────────────────────

class PanelSide(str, Enum):
    LEFT = "L"
    RIGHT = "R"
    CENTER = "C"  # For single-sided panels


@dataclass
class TerminalPoint:
    """A single terminal on a terminal strip."""
    terminal_id: str          # e.g. "T01", "T02", "T03"
    strip_id: str             # e.g. "RP1L1"
    full_id: str              # e.g. "RP1L1:T03"
    position_x: float         # AutoCAD world X coordinate
    position_y: float         # AutoCAD world Y coordinate
    index: int                # 0-based position on strip
    connected_wire: Optional[str] = None  # Cable ref if connected


@dataclass
class TerminalStrip:
    """A terminal strip block parsed from AutoCAD."""
    block_handle: str         # AutoCAD entity handle
    strip_id: str             # Computed: e.g. "RP1L1"
    panel_name: str           # e.g. "RP1" (Relay Panel 1)
    panel_full_name: str      # e.g. "Relay Panel 1"
    side: PanelSide           # L, R, or C
    strip_number: int         # 1-based strip number on that side
    insert_x: float           # Block insertion point X
    insert_y: float           # Block insertion point Y
    rotation: float           # Block rotation in degrees
    terminal_count: int       # Number of terminals on this strip
    terminals: list[TerminalPoint] = field(default_factory=list)

    # Raw attribute dict for anything extra
    raw_attributes: dict = field(default_factory=dict)


@dataclass
class DrawingInfo:
    """Metadata about the current AutoCAD drawing."""
    filepath: str
    name: str
    units: str                # "Inches", "Feet", "Millimeters", etc.
    extents_min: tuple[float, float] = (0.0, 0.0)
    extents_max: tuple[float, float] = (0.0, 0.0)


@dataclass
class AcadScanResult:
    """Complete scan result from AutoCAD."""
    drawing: DrawingInfo
    strips: list[TerminalStrip]
    panels: dict[str, list[TerminalStrip]]  # Grouped by panel name
    terminal_count: int
    warnings: list[str] = field(default_factory=list)


# ─── Attribute Parsing ───────────────────────────────────────────────────────

# Expected block attribute tags for Terminal Strip blocks
ATTR_PANEL_NAME = "PANEL"          # e.g. "RP1"
ATTR_PANEL_FULL = "PANEL_DESC"     # e.g. "Relay Panel 1"  (optional)
ATTR_SIDE = "SIDE"                 # e.g. "L" or "R"
ATTR_STRIP_NUM = "STRIP_NUM"       # e.g. "1", "2", "6"
ATTR_STRIP_ID = "STRIP_ID"         # e.g. "RP1L1" (optional, can be computed)
ATTR_TERM_COUNT = "TERM_COUNT"     # e.g. "20" (optional, can be inferred)

# Alternative attribute patterns (some drawings use different conventions)
ATTR_ALIASES = {
    ATTR_PANEL_NAME: ["PANEL", "PNL", "PANEL_NAME", "PANELNAME"],
    ATTR_SIDE: ["SIDE", "PNL_SIDE", "LOCATION", "LOC"],
    ATTR_STRIP_NUM: ["STRIP_NUM", "STRIPNUM", "STRIP_NO", "TS_NUM", "STRIP"],
    ATTR_STRIP_ID: ["STRIP_ID", "STRIPID", "TS_ID", "TAG"],
    ATTR_TERM_COUNT: ["TERM_COUNT", "TERMCOUNT", "NUM_TERMS", "TERMINALS"],
    ATTR_PANEL_FULL: ["PANEL_DESC", "PANEL_DESCRIPTION", "PNL_DESC", "DESCRIPTION"],
}

# Block names to search for (case-insensitive matching)
TERMINAL_STRIP_BLOCK_NAMES = [
    "TERMINAL_STRIP",
    "TERMINAL STRIP",
    "TERM_STRIP",
    "TS_BLOCK",
    "TB_STRIP",
    # AutoCAD Electrical standard
    "HT_STRIP",
    "VT_STRIP",
]

# Panel name patterns for parsing full names
PANEL_NAME_PATTERN = re.compile(
    r"^(?P<prefix>[A-Z]+)(?P<number>\d+)$",
    re.IGNORECASE,
)

PANEL_PREFIXES = {
    "RP": "Relay Panel",
    "CP": "Control Panel",
    "JP": "Junction Panel",
    "JB": "Junction Box",
    "TB": "Terminal Box",
    "MCC": "Motor Control Center",
    "SWG": "Switchgear",
    "PP": "Protection Panel",
    "MP": "Metering Panel",
    "DP": "Distribution Panel",
    "LP": "Lighting Panel",
}


def expand_panel_name(short_name: str) -> str:
    """Expand 'RP1' -> 'Relay Panel 1'."""
    match = PANEL_NAME_PATTERN.match(short_name.strip())
    if match:
        prefix = match.group("prefix").upper()
        number = match.group("number")
        full_prefix = PANEL_PREFIXES.get(prefix, prefix)
        return f"{full_prefix} {number}"
    return short_name


def resolve_attribute(attrs: dict[str, str], canonical: str) -> Optional[str]:
    """Look up an attribute value using aliases."""
    aliases = ATTR_ALIASES.get(canonical, [canonical])
    for alias in aliases:
        # Try exact match first, then case-insensitive
        if alias in attrs:
            return attrs[alias].strip()
        for key, val in attrs.items():
            if key.upper() == alias.upper():
                return val.strip()
    return None


def compute_strip_id(panel: str, side: str, strip_num: int) -> str:
    """Compute strip ID like 'RP1L1' from components."""
    return f"{panel}{side}{strip_num}"


# ─── AutoCAD COM Interface ──────────────────────────────────────────────────

class AcadConnector:
    """
    Connects to a running AutoCAD instance and provides methods to scan
    Terminal Strip blocks, extract terminal data, and write routed wires
    back to the drawing.
    """

    def __init__(self):
        self.acad = None
        self.doc = None
        self.model_space = None
        self._connected = False
        self._scan_result: Optional[AcadScanResult] = None

    # ── Connection ───────────────────────────────────────────────────────

    def connect(self, create_if_missing: bool = False) -> bool:
        """
        Attach to a running AutoCAD instance via COM.

        Returns True if connection successful, False otherwise.
        Uses win32com first (more stable), falls back to comtypes.
        """
        # Try win32com.client (pywin32)
        try:
            import win32com.client
            try:
                self.acad = win32com.client.GetActiveObject("AutoCAD.Application")
                logger.info("Connected to AutoCAD via win32com (existing instance)")
            except Exception:
                if create_if_missing:
                    self.acad = win32com.client.Dispatch("AutoCAD.Application")
                    self.acad.Visible = True
                    logger.info("Launched new AutoCAD instance via win32com")
                else:
                    logger.error("No running AutoCAD instance found")
                    return False

            self.doc = self.acad.ActiveDocument
            self.model_space = self.doc.ModelSpace
            self._connected = True
            logger.info(f"Connected to drawing: {self.doc.Name}")
            return True

        except ImportError:
            pass

        # Fallback: comtypes
        try:
            import comtypes.client
            try:
                self.acad = comtypes.client.GetActiveObject("AutoCAD.Application")
                logger.info("Connected to AutoCAD via comtypes (existing instance)")
            except Exception:
                if create_if_missing:
                    self.acad = comtypes.client.CreateObject("AutoCAD.Application")
                    self.acad.Visible = True
                    logger.info("Launched new AutoCAD instance via comtypes")
                else:
                    logger.error("No running AutoCAD instance found")
                    return False

            self.doc = self.acad.ActiveDocument
            self.model_space = self.doc.ModelSpace
            self._connected = True
            logger.info(f"Connected to drawing: {self.doc.Name}")
            return True

        except ImportError:
            logger.error(
                "Neither pywin32 nor comtypes installed. "
                "Install with: pip install pywin32 comtypes"
            )
            return False

    def is_connected(self) -> bool:
        """Check if still connected to AutoCAD."""
        if not self._connected or not self.acad:
            return False
        try:
            _ = self.acad.ActiveDocument.Name
            return True
        except Exception:
            self._connected = False
            return False

    def get_drawing_info(self) -> Optional[DrawingInfo]:
        """Get metadata about the current drawing."""
        if not self.is_connected():
            return None
        try:
            doc = self.acad.ActiveDocument

            # Get drawing extents
            try:
                ext_min = doc.GetVariable("EXTMIN")
                ext_max = doc.GetVariable("EXTMAX")
                extents_min = (float(ext_min[0]), float(ext_min[1]))
                extents_max = (float(ext_max[0]), float(ext_max[1]))
            except Exception:
                extents_min = (0.0, 0.0)
                extents_max = (100.0, 100.0)

            # Get units
            unit_codes = {
                0: "Unitless", 1: "Inches", 2: "Feet", 3: "Miles",
                4: "Millimeters", 5: "Centimeters", 6: "Meters",
            }
            try:
                insunits = int(doc.GetVariable("INSUNITS"))
                units = unit_codes.get(insunits, "Unknown")
            except Exception:
                units = "Unknown"

            return DrawingInfo(
                filepath=doc.FullName,
                name=doc.Name,
                units=units,
                extents_min=extents_min,
                extents_max=extents_max,
            )
        except Exception as e:
            logger.error(f"Failed to get drawing info: {e}")
            return None

    # ── Block Scanning ───────────────────────────────────────────────────

    def _iter_block_references(self):
        """Iterate over all block references in model space."""
        if not self.model_space:
            return

        count = self.model_space.Count
        for i in range(count):
            try:
                entity = self.model_space.Item(i)
                # Check if it's a block reference (entity type name)
                if hasattr(entity, "Name") and hasattr(entity, "GetAttributes"):
                    yield entity
            except Exception:
                continue

    def _get_block_attributes(self, block_ref) -> dict[str, str]:
        """Extract attribute tag:value pairs from a block reference."""
        attrs = {}
        try:
            attributes = block_ref.GetAttributes()
            for attr in attributes:
                tag = attr.TagString.strip().upper()
                value = attr.TextString.strip()
                attrs[tag] = value
        except Exception as e:
            logger.debug(f"Could not read attributes: {e}")
        return attrs

    def _is_terminal_strip_block(self, block_name: str) -> bool:
        """Check if block name matches known terminal strip patterns."""
        normalized = block_name.strip().upper().replace("-", "_").replace(" ", "_")
        for pattern in TERMINAL_STRIP_BLOCK_NAMES:
            if normalized == pattern.upper().replace("-", "_").replace(" ", "_"):
                return True
        # Also match partial patterns like "TS_*" or "*_TERMINAL_STRIP"
        if "TERMINAL" in normalized and "STRIP" in normalized:
            return True
        if normalized.startswith("TS_") or normalized.startswith("TB_"):
            return True
        return False

    def _extract_terminal_points(
        self,
        block_ref,
        strip: TerminalStrip,
    ) -> list[TerminalPoint]:
        """
        Extract individual terminal points from a terminal strip block.

        Strategy:
        1. Look for nested attribute patterns like T01, T02, ... T20
        2. If terminal count attribute exists, generate positions mathematically
        3. Fall back to a default terminal count (20)
        """
        terminals = []
        attrs = self._get_block_attributes(block_ref)

        # Determine terminal count
        term_count_str = resolve_attribute(attrs, ATTR_TERM_COUNT)
        if term_count_str and term_count_str.isdigit():
            term_count = int(term_count_str)
        else:
            # Try to count T## attributes
            t_attrs = [k for k in attrs if re.match(r"^T\d+$", k)]
            term_count = len(t_attrs) if t_attrs else 20  # Default 20

        strip.terminal_count = term_count

        # Get block insertion point and rotation
        try:
            insert_pt = block_ref.InsertionPoint
            ix, iy = float(insert_pt[0]), float(insert_pt[1])
            rotation_rad = float(block_ref.Rotation)
        except Exception:
            ix, iy = strip.insert_x, strip.insert_y
            rotation_rad = 0.0

        import math
        cos_r = math.cos(rotation_rad)
        sin_r = math.sin(rotation_rad)

        # Terminal spacing (configurable, default ~0.5 units between terminals)
        TERMINAL_SPACING = 0.5

        for idx in range(term_count):
            # Terminal IDs are 1-based, zero-padded
            term_id = f"T{idx + 1:02d}"
            full_id = f"{strip.strip_id}:{term_id}"

            # Calculate position along the strip
            # Terminals are spaced vertically (or along strip direction)
            local_offset = idx * TERMINAL_SPACING
            # Apply rotation
            dx = local_offset * cos_r
            dy = local_offset * sin_r

            terminals.append(TerminalPoint(
                terminal_id=term_id,
                strip_id=strip.strip_id,
                full_id=full_id,
                position_x=ix + dx,
                position_y=iy + dy,
                index=idx,
            ))

        return terminals

    def scan_terminal_strips(
        self,
        block_name_override: Optional[str] = None,
    ) -> AcadScanResult:
        """
        Scan the current drawing for all Terminal Strip blocks.

        Args:
            block_name_override: If set, only match this exact block name
                                 (case-insensitive). Otherwise uses the
                                 built-in pattern list.

        Returns:
            AcadScanResult with all found strips, grouped by panel.
        """
        if not self.is_connected():
            raise RuntimeError("Not connected to AutoCAD")

        drawing = self.get_drawing_info()
        strips: list[TerminalStrip] = []
        warnings: list[str] = []

        logger.info("Scanning for Terminal Strip blocks...")

        for block_ref in self._iter_block_references():
            try:
                block_name = block_ref.Name
            except Exception:
                continue

            # Check if this block matches
            if block_name_override:
                if block_name.upper() != block_name_override.upper():
                    continue
            else:
                if not self._is_terminal_strip_block(block_name):
                    continue

            # Extract attributes
            attrs = self._get_block_attributes(block_ref)

            # Parse panel name
            panel = resolve_attribute(attrs, ATTR_PANEL_NAME)
            if not panel:
                warnings.append(
                    f"Block '{block_name}' at handle {block_ref.Handle} "
                    f"missing PANEL attribute, skipping"
                )
                continue

            # Parse side
            side_str = resolve_attribute(attrs, ATTR_SIDE)
            if side_str and side_str.upper() in ("L", "LEFT"):
                side = PanelSide.LEFT
            elif side_str and side_str.upper() in ("R", "RIGHT"):
                side = PanelSide.RIGHT
            elif side_str and side_str.upper() in ("C", "CENTER"):
                side = PanelSide.CENTER
            else:
                side = PanelSide.CENTER
                if side_str:
                    warnings.append(
                        f"Unrecognized side '{side_str}' for {panel}, "
                        f"defaulting to CENTER"
                    )

            # Parse strip number
            strip_num_str = resolve_attribute(attrs, ATTR_STRIP_NUM)
            if strip_num_str and strip_num_str.isdigit():
                strip_num = int(strip_num_str)
            else:
                strip_num = 1
                warnings.append(
                    f"Missing/invalid STRIP_NUM for {panel}{side.value}, "
                    f"defaulting to 1"
                )

            # Compute or read strip ID
            strip_id = resolve_attribute(attrs, ATTR_STRIP_ID)
            if not strip_id:
                strip_id = compute_strip_id(panel, side.value, strip_num)

            # Panel full name
            panel_full = resolve_attribute(attrs, ATTR_PANEL_FULL)
            if not panel_full:
                panel_full = expand_panel_name(panel)

            # Get insertion point
            try:
                insert_pt = block_ref.InsertionPoint
                ix, iy = float(insert_pt[0]), float(insert_pt[1])
            except Exception:
                ix, iy = 0.0, 0.0

            try:
                rotation = float(block_ref.Rotation) * (180.0 / 3.14159265)
            except Exception:
                rotation = 0.0

            strip = TerminalStrip(
                block_handle=str(block_ref.Handle),
                strip_id=strip_id,
                panel_name=panel,
                panel_full_name=panel_full,
                side=side,
                strip_number=strip_num,
                insert_x=ix,
                insert_y=iy,
                rotation=rotation,
                terminal_count=0,  # Will be set by _extract_terminal_points
                raw_attributes=attrs,
            )

            # Extract terminal points
            strip.terminals = self._extract_terminal_points(block_ref, strip)
            strips.append(strip)

        # Group by panel
        panels: dict[str, list[TerminalStrip]] = {}
        for s in strips:
            panels.setdefault(s.panel_name, []).append(s)

        # Sort strips within each panel by side then number
        for panel_strips in panels.values():
            panel_strips.sort(key=lambda s: (s.side.value, s.strip_number))

        total_terminals = sum(len(s.terminals) for s in strips)

        logger.info(
            f"Found {len(strips)} terminal strips across "
            f"{len(panels)} panels ({total_terminals} terminals)"
        )

        self._scan_result = AcadScanResult(
            drawing=drawing,
            strips=strips,
            panels=panels,
            terminal_count=total_terminals,
            warnings=warnings,
        )
        return self._scan_result

    # ── Terminal Lookup ──────────────────────────────────────────────────

    def get_all_terminals(self) -> list[TerminalPoint]:
        """Get a flat list of all terminal points from the last scan."""
        if not self._scan_result:
            raise RuntimeError("No scan result. Call scan_terminal_strips() first.")
        terminals = []
        for strip in self._scan_result.strips:
            terminals.extend(strip.terminals)
        return terminals

    def find_terminal(self, full_id: str) -> Optional[TerminalPoint]:
        """
        Find a terminal by its full ID (e.g. 'RP1L1:T03').

        Also supports partial matching:
        - 'RP1L1:3' -> 'RP1L1:T03'
        - 'RP1L1:T3' -> 'RP1L1:T03'
        """
        if not self._scan_result:
            return None

        # Normalize the search ID
        normalized = full_id.upper().strip()

        for strip in self._scan_result.strips:
            for term in strip.terminals:
                if term.full_id.upper() == normalized:
                    return term

        # Try partial match
        if ":" in normalized:
            strip_part, term_part = normalized.split(":", 1)
            # Normalize terminal part: "3" -> "T03", "T3" -> "T03"
            term_part = term_part.lstrip("T")
            if term_part.isdigit():
                term_part = f"T{int(term_part):02d}"
                normalized = f"{strip_part}:{term_part}"
                for strip in self._scan_result.strips:
                    for term in strip.terminals:
                        if term.full_id.upper() == normalized:
                            return term

        return None

    def get_panel_tree(self) -> dict:
        """
        Build a hierarchical tree structure for UI display:

        {
            "RP1": {
                "full_name": "Relay Panel 1",
                "sides": {
                    "L": {
                        "strips": [
                            {
                                "strip_id": "RP1L1",
                                "strip_number": 1,
                                "terminal_count": 20,
                                "terminals": ["T01", "T02", ...]
                            },
                            ...
                        ]
                    },
                    "R": { ... }
                }
            }
        }
        """
        if not self._scan_result:
            return {}

        tree = {}
        for strip in self._scan_result.strips:
            if strip.panel_name not in tree:
                tree[strip.panel_name] = {
                    "full_name": strip.panel_full_name,
                    "sides": {},
                }
            panel_node = tree[strip.panel_name]
            side_key = strip.side.value
            if side_key not in panel_node["sides"]:
                panel_node["sides"][side_key] = {"strips": []}

            panel_node["sides"][side_key]["strips"].append({
                "strip_id": strip.strip_id,
                "strip_number": strip.strip_number,
                "terminal_count": strip.terminal_count,
                "terminals": [t.terminal_id for t in strip.terminals],
                "position": (strip.insert_x, strip.insert_y),
            })

        return tree

    # ── Wire Routing (Drawing Back to AutoCAD) ───────────────────────────

    def route_wire(
        self,
        from_terminal_id: str,
        to_terminal_id: str,
        cable_type: str = "DC",
        wire_fn: str = "Positive",
        cable_ref: Optional[str] = None,
        layer: Optional[str] = None,
        color_index: Optional[int] = None,
    ) -> Optional[str]:
        """
        Route a wire between two terminals and draw it in AutoCAD.

        This creates a lightweight polyline from the start terminal to the
        end terminal. In a full implementation, this would call the A*
        routing engine to find the optimal path.

        Args:
            from_terminal_id: Full terminal ID (e.g. "RP1L1:T03")
            to_terminal_id: Full terminal ID (e.g. "RP2R2:T07")
            cable_type: "AC" or "DC"
            wire_fn: Wire function (e.g. "Phase A", "Positive")
            cable_ref: Cable reference (auto-generated if None)
            layer: AutoCAD layer name (auto-determined if None)
            color_index: AutoCAD color index (auto-determined if None)

        Returns:
            Cable reference string if successful, None if failed.
        """
        if not self.is_connected():
            raise RuntimeError("Not connected to AutoCAD")

        from_term = self.find_terminal(from_terminal_id)
        to_term = self.find_terminal(to_terminal_id)

        if not from_term:
            logger.error(f"Terminal not found: {from_terminal_id}")
            return None
        if not to_term:
            logger.error(f"Terminal not found: {to_terminal_id}")
            return None

        # Determine layer and color
        wire_color_map = {
            ("AC", "Phase A"): ("CR-WIRE-AC-PHA", 7),     # White (on dark bg)
            ("AC", "Phase B"): ("CR-WIRE-AC-PHB", 1),     # Red
            ("AC", "Phase C"): ("CR-WIRE-AC-PHC", 5),     # Blue
            ("AC", "Neutral"): ("CR-WIRE-AC-NEU", 9),     # Light gray
            ("AC", "Ground"): ("CR-WIRE-AC-GND", 3),      # Green
            ("DC", "Positive"): ("CR-WIRE-DC-POS", 1),    # Red
            ("DC", "Negative"): ("CR-WIRE-DC-NEG", 7),    # White
            ("DC", "Ground"): ("CR-WIRE-DC-GND", 3),      # Green
        }

        default_layer = f"CR-WIRE-{cable_type}"
        default_color = 7

        lyr, clr = wire_color_map.get(
            (cable_type, wire_fn),
            (default_layer, default_color),
        )
        if layer:
            lyr = layer
        if color_index is not None:
            clr = color_index

        # Ensure layer exists
        self._ensure_layer(lyr, clr)

        # For now: simple L-shaped route (start -> horizontal -> vertical -> end)
        # In production, this calls the A* routing engine
        sx, sy = from_term.position_x, from_term.position_y
        ex, ey = to_term.position_x, to_term.position_y
        mid_x = (sx + ex) / 2

        # Build point array for polyline
        # Route: start -> horizontal to midpoint -> vertical -> horizontal to end
        import array
        points = array.array("d", [
            sx, sy, 0.0,
            mid_x, sy, 0.0,
            mid_x, ey, 0.0,
            ex, ey, 0.0,
        ])

        try:
            pline = self.model_space.AddLightWeightPolyline(points)
            pline.Layer = lyr
            pline.Color = clr
            pline.Lineweight = 25  # 0.25mm

            # Add cable reference as xdata or text
            if not cable_ref:
                cable_ref = self._next_cable_ref(cable_type)

            # Place cable reference text at midpoint
            mid_y = (sy + ey) / 2
            text_height = 0.1  # Adjust for drawing scale
            try:
                txt = self.model_space.AddText(
                    cable_ref, self._point3d(mid_x, mid_y, 0), text_height
                )
                txt.Layer = "CR-ANNOTATION"
                txt.Color = clr
            except Exception as e:
                logger.warning(f"Could not place cable ref text: {e}")

            logger.info(
                f"Routed {cable_ref}: {from_terminal_id} -> {to_terminal_id} "
                f"({cable_type} {wire_fn})"
            )
            return cable_ref

        except Exception as e:
            logger.error(f"Failed to draw polyline: {e}")
            return None

    # ── Utility Methods ──────────────────────────────────────────────────

    def _ensure_layer(self, layer_name: str, color: int = 7):
        """Create a layer if it doesn't exist."""
        try:
            layers = self.doc.Layers
            try:
                _ = layers.Item(layer_name)
            except Exception:
                new_layer = layers.Add(layer_name)
                new_layer.Color = color
                logger.debug(f"Created layer: {layer_name}")
        except Exception as e:
            logger.warning(f"Could not create layer {layer_name}: {e}")

    def _next_cable_ref(self, cable_type: str) -> str:
        """Generate the next cable reference number."""
        if not hasattr(self, "_ref_counter"):
            self._ref_counter = {"AC": 0, "DC": 0}
        self._ref_counter[cable_type] = self._ref_counter.get(cable_type, 0) + 1
        return f"{cable_type}-{self._ref_counter[cable_type]:03d}"

    @staticmethod
    def _point3d(x: float, y: float, z: float = 0.0):
        """Create a point array for AutoCAD COM methods."""
        import array
        return array.array("d", [x, y, z])

    # ── Export / Serialization ───────────────────────────────────────────

    def export_scan_to_json(self, filepath: str | Path) -> None:
        """Export the scan result to JSON for the frontend."""
        if not self._scan_result:
            raise RuntimeError("No scan result to export")

        data = {
            "drawing": asdict(self._scan_result.drawing),
            "strips": [asdict(s) for s in self._scan_result.strips],
            "panel_tree": self.get_panel_tree(),
            "terminal_count": self._scan_result.terminal_count,
            "warnings": self._scan_result.warnings,
        }

        path = Path(filepath)
        path.write_text(json.dumps(data, indent=2, default=str))
        logger.info(f"Exported scan to {path}")

    def export_schedule_csv(self, filepath: str | Path) -> None:
        """Export cable schedule as CSV (from routed wires)."""
        # This would query the drawing for all CR-WIRE-* entities
        # and generate the schedule. Placeholder for now.
        logger.info(f"Cable schedule export to {filepath} — not yet implemented")


# ─── CLI Entry Point ─────────────────────────────────────────────────────────

def main():
    """Command-line interface for testing the connector."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    print("ConduitRoute — AutoCAD Terminal Strip Scanner")
    print("=" * 50)

    conn = AcadConnector()

    print("\nAttempting to connect to AutoCAD...")
    if not conn.connect():
        print("ERROR: Could not connect to AutoCAD.")
        print("Make sure AutoCAD is running with a drawing open.")
        sys.exit(1)

    info = conn.get_drawing_info()
    if info:
        print(f"\nDrawing: {info.name}")
        print(f"Path:    {info.filepath}")
        print(f"Units:   {info.units}")
        print(f"Extents: ({info.extents_min}) to ({info.extents_max})")

    print("\nScanning for Terminal Strip blocks...")
    result = conn.scan_terminal_strips()

    print(f"\nFound {len(result.strips)} terminal strips:")
    print(f"  Panels: {list(result.panels.keys())}")
    print(f"  Total terminals: {result.terminal_count}")

    if result.warnings:
        print(f"\n  Warnings ({len(result.warnings)}):")
        for w in result.warnings:
            print(f"    ⚠ {w}")

    # Print panel tree
    tree = conn.get_panel_tree()
    for panel_name, panel_data in tree.items():
        print(f"\n  {panel_name} — {panel_data['full_name']}")
        for side, side_data in panel_data["sides"].items():
            print(f"    Side {side}:")
            for strip in side_data["strips"]:
                print(
                    f"      {strip['strip_id']} "
                    f"(Strip #{strip['strip_number']}, "
                    f"{strip['terminal_count']} terminals)"
                )

    # Export
    export_path = Path("terminal_scan.json")
    conn.export_scan_to_json(export_path)
    print(f"\nExported scan data to {export_path}")


if __name__ == "__main__":
    main()

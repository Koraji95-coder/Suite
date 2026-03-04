from __future__ import annotations

import math
from typing import Any, Mapping


INCHES_PER_FOOT = 12.0

TEE_BLOCK_NAME = "GND - MAIN GRID TEE"
CROSS_BLOCK_NAME = "GND - MAIN GRID CROSS"
ROD_BLOCK_NAME = "Ground Rod"
TEST_WELL_BLOCK_NAME = "GROUND ROD WITH TEST WELL"
TEST_WELL_BLOCK_CANDIDATES = (
    "GROUND ROD WITH TEST WELL",
    "Ground Rod with Test Well",
    "GROUND ROD TEST WELL",
    "Ground Rod Test Well",
    "GROUND ROD W/ TEST WELL",
)


def _to_float(value: Any, *, field_name: str) -> float:
    try:
        return float(value)
    except Exception as exc:
        raise ValueError(f"Invalid numeric value for '{field_name}': {value!r}") from exc


def grid_to_autocad(
    gx: float,
    gy: float,
    *,
    config: Mapping[str, Any],
) -> tuple[float, float]:
    origin_x_feet = _to_float(config.get("origin_x_feet", 0), field_name="origin_x_feet")
    origin_x_inches = _to_float(config.get("origin_x_inches", 0), field_name="origin_x_inches")
    origin_y_feet = _to_float(config.get("origin_y_feet", 0), field_name="origin_y_feet")
    origin_y_inches = _to_float(config.get("origin_y_inches", 0), field_name="origin_y_inches")
    grid_max_y = _to_float(config.get("grid_max_y", 0), field_name="grid_max_y")

    origin_x_units = origin_x_feet * INCHES_PER_FOOT + origin_x_inches
    origin_y_units = origin_y_feet * INCHES_PER_FOOT + origin_y_inches
    y_flipped = grid_max_y - gy
    return (
        origin_x_units + gx * INCHES_PER_FOOT,
        origin_y_units + y_flipped * INCHES_PER_FOOT,
    )


def _build_tee_block(block: Any, *, scale: float, pt_fn: Any) -> None:
    half = 1.5 * scale
    stem = 1.2 * scale
    block.AddLine(pt_fn(-half, 0, 0), pt_fn(half, 0, 0))
    block.AddLine(pt_fn(0, 0, 0), pt_fn(0, -stem, 0))


def _build_cross_block(block: Any, *, scale: float, pt_fn: Any) -> None:
    arm = 1.5 * scale
    block.AddLine(pt_fn(-arm, 0, 0), pt_fn(arm, 0, 0))
    block.AddLine(pt_fn(0, -arm, 0), pt_fn(0, arm, 0))


def _build_rod_block(block: Any, *, scale: float, pt_fn: Any) -> None:
    radius = 0.6 * scale
    tick = 1.4 * scale
    block.AddCircle(pt_fn(0, 0, 0), float(radius))
    block.AddLine(pt_fn(-tick * 0.5, 0, 0), pt_fn(tick * 0.5, 0, 0))


def _build_test_well_block(block: Any, *, scale: float, pt_fn: Any) -> None:
    outer = 0.9 * scale
    inner = 0.45 * scale
    tick = 0.8 * scale
    block.AddCircle(pt_fn(0, 0, 0), float(outer))
    block.AddCircle(pt_fn(0, 0, 0), float(inner))
    block.AddLine(pt_fn(inner, 0, 0), pt_fn(inner + tick, 0, 0))


def _ensure_block(
    *,
    doc: Any,
    block_name: str,
    builder: Any,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> None:
    doc = dyn_fn(doc)
    try:
        doc.Blocks.Item(block_name)
        return
    except Exception:
        pass

    def _create():
        block = doc.Blocks.Add(pt_fn(0, 0, 0), block_name)
        builder(block)
        return block

    com_call_with_retry_fn(_create)


def _find_existing_block_name(
    *,
    doc: Any,
    candidates: tuple[str, ...],
    dyn_fn: Any,
) -> str | None:
    doc = dyn_fn(doc)
    blocks = dyn_fn(doc.Blocks)
    for name in candidates:
        try:
            blocks.Item(name)
            return name
        except Exception:
            continue
    return None


def ensure_ground_grid_blocks(
    *,
    doc: Any,
    block_scale: float,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> dict[str, str]:
    block_names = {
        "TEE": TEE_BLOCK_NAME,
        "CROSS": CROSS_BLOCK_NAME,
        "ROD": ROD_BLOCK_NAME,
        "GROUND_ROD_WITH_TEST_WELL": TEST_WELL_BLOCK_NAME,
    }

    _ensure_block(
        doc=doc,
        block_name=TEE_BLOCK_NAME,
        builder=lambda block: _build_tee_block(block, scale=block_scale, pt_fn=pt_fn),
        pt_fn=pt_fn,
        dyn_fn=dyn_fn,
        com_call_with_retry_fn=com_call_with_retry_fn,
    )
    _ensure_block(
        doc=doc,
        block_name=CROSS_BLOCK_NAME,
        builder=lambda block: _build_cross_block(block, scale=block_scale, pt_fn=pt_fn),
        pt_fn=pt_fn,
        dyn_fn=dyn_fn,
        com_call_with_retry_fn=com_call_with_retry_fn,
    )
    _ensure_block(
        doc=doc,
        block_name=ROD_BLOCK_NAME,
        builder=lambda block: _build_rod_block(block, scale=block_scale, pt_fn=pt_fn),
        pt_fn=pt_fn,
        dyn_fn=dyn_fn,
        com_call_with_retry_fn=com_call_with_retry_fn,
    )

    existing_test_well_name = _find_existing_block_name(
        doc=doc,
        candidates=TEST_WELL_BLOCK_CANDIDATES,
        dyn_fn=dyn_fn,
    )
    if existing_test_well_name:
        block_names["GROUND_ROD_WITH_TEST_WELL"] = existing_test_well_name
    else:
        _ensure_block(
            doc=doc,
            block_name=TEST_WELL_BLOCK_NAME,
            builder=lambda block: _build_test_well_block(block, scale=block_scale, pt_fn=pt_fn),
            pt_fn=pt_fn,
            dyn_fn=dyn_fn,
            com_call_with_retry_fn=com_call_with_retry_fn,
        )

    return block_names


def _placement_block_name(
    placement_type: str,
    *,
    block_names: Mapping[str, str],
) -> str:
    placement_type = placement_type.strip().upper()
    normalized = placement_type.replace(" ", "_")
    if normalized == "TEE":
        return block_names["TEE"]
    if normalized == "CROSS":
        return block_names["CROSS"]
    if normalized in {"GROUND_ROD_WITH_TEST_WELL", "GROUND_ROD_TEST_WELL"}:
        return block_names["GROUND_ROD_WITH_TEST_WELL"]
    if normalized == "ROD":
        return block_names["ROD"]
    raise ValueError(f"Unsupported placement type: {placement_type!r}")


def _placement_rotation_deg_for_autocad(placement_type: str, rotation_deg: float) -> float:
    normalized = placement_type.strip().upper().replace(" ", "_")
    if normalized == "TEE":
        # AutoCAD tee block orientation is opposite the in-app preview baseline.
        return rotation_deg + 180.0
    return rotation_deg


def plot_ground_grid_entities(
    *,
    doc: Any,
    modelspace: Any,
    conductors: list[Mapping[str, Any]],
    placements: list[Mapping[str, Any]],
    config: Mapping[str, Any],
    ensure_layer_fn: Any,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> dict[str, Any]:
    layer_name = str(config.get("layer_name") or "Ground Grid").strip() or "Ground Grid"
    block_scale = _to_float(config.get("block_scale", 8.33), field_name="block_scale")

    ensure_layer_fn(doc, layer_name)
    block_names = ensure_ground_grid_blocks(
        doc=doc,
        block_scale=block_scale,
        pt_fn=pt_fn,
        dyn_fn=dyn_fn,
        com_call_with_retry_fn=com_call_with_retry_fn,
    )

    ms = dyn_fn(modelspace)
    lines_drawn = 0
    for index, conductor in enumerate(conductors):
        gx1 = _to_float(conductor.get("x1"), field_name=f"conductors[{index}].x1")
        gy1 = _to_float(conductor.get("y1"), field_name=f"conductors[{index}].y1")
        gx2 = _to_float(conductor.get("x2"), field_name=f"conductors[{index}].x2")
        gy2 = _to_float(conductor.get("y2"), field_name=f"conductors[{index}].y2")
        ax1, ay1 = grid_to_autocad(gx1, gy1, config=config)
        ax2, ay2 = grid_to_autocad(gx2, gy2, config=config)

        line = com_call_with_retry_fn(
            lambda: ms.AddLine(pt_fn(ax1, ay1, 0), pt_fn(ax2, ay2, 0))
        )
        line = dyn_fn(line)
        try:
            line.Layer = layer_name
        except Exception:
            pass
        lines_drawn += 1

    blocks_inserted = 0
    for index, placement in enumerate(placements):
        placement_type = str(placement.get("type") or "ROD")
        if "autocad_x" in placement and "autocad_y" in placement:
            x = _to_float(placement.get("autocad_x"), field_name=f"placements[{index}].autocad_x")
            y = _to_float(placement.get("autocad_y"), field_name=f"placements[{index}].autocad_y")
        else:
            gx = _to_float(placement.get("grid_x"), field_name=f"placements[{index}].grid_x")
            gy = _to_float(placement.get("grid_y"), field_name=f"placements[{index}].grid_y")
            x, y = grid_to_autocad(gx, gy, config=config)

        rotation_deg = _to_float(
            placement.get("rotation_deg", 0),
            field_name=f"placements[{index}].rotation_deg",
        )
        cad_rotation_deg = _placement_rotation_deg_for_autocad(placement_type, rotation_deg)
        block_name = _placement_block_name(placement_type, block_names=block_names)

        try:
            block_ref = com_call_with_retry_fn(
                lambda: ms.InsertBlock(
                    pt_fn(x, y, 0),
                    block_name,
                    float(block_scale),
                    float(block_scale),
                    float(block_scale),
                    math.radians(cad_rotation_deg),
                )
            )
        except Exception as exc:
            raise RuntimeError(
                f"Block '{block_name}' failed to plot for placement index {index} "
                f"(type={placement_type}, x={x}, y={y}, rot={rotation_deg}, cad_rot={cad_rotation_deg}). "
                "Check the block definition in the active drawing."
            ) from exc
        block_ref = dyn_fn(block_ref)
        try:
            block_ref.Layer = layer_name
        except Exception:
            pass
        blocks_inserted += 1

    return {
        "lines_drawn": lines_drawn,
        "blocks_inserted": blocks_inserted,
        "layer_name": layer_name,
        "test_well_block_name": block_names["GROUND_ROD_WITH_TEST_WELL"],
    }

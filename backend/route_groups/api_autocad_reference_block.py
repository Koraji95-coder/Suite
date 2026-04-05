from __future__ import annotations

import math
import os
import time
from typing import Any, Dict


_REF_IMPORT_CACHE: Dict[str, str] = {}


def default_ref_dwg_path(*, base_dir: str) -> str:
    cand = os.path.join(base_dir, "assets", "Coordinate Reference Point.dwg")
    if os.path.exists(cand):
        return cand
    return os.path.join(base_dir, "Coordinate Reference Point.dwg")


def ensure_block_exists(
    doc: Any,
    block_name: str,
    dwg_path: str,
    *,
    dyn_fn: Any,
    logger: Any,
    pt_fn: Any,
    com_call_with_retry_fn: Any,
    wait_for_command_finish_fn: Any,
) -> str:
    doc = dyn_fn(doc)
    dwg_path = os.path.abspath(dwg_path)
    try:
        doc.Blocks.Item(block_name)
        return block_name
    except Exception:
        logger.info("Block '%s' not found. Importing via Xref-Bind...", block_name)

    if not os.path.exists(dwg_path):
        raise RuntimeError(f"External file not found: {dwg_path}")

    ms = dyn_fn(doc.ModelSpace)
    origin = pt_fn(0, 0, 0)
    xref_name = block_name

    def _attach(name: str):
        if hasattr(ms, "AttachExternalReference"):
            return ms.AttachExternalReference(dwg_path, name, origin, 1.0, 1.0, 1.0, 0.0, False)
        if hasattr(ms, "AttachXref"):
            return ms.AttachXref(dwg_path, name, origin, 1.0, 1.0, 1.0, 0.0, False)
        raise RuntimeError("Neither AttachExternalReference nor AttachXref available.")

    try:
        try:
            xref_obj = com_call_with_retry_fn(lambda: _attach(xref_name))
        except Exception:
            xref_name = f"TEMP_IMPORT_{block_name}_{int(time.time())}"
            xref_obj = com_call_with_retry_fn(lambda: _attach(xref_name))

        cmd = f'_.-XREF _B "{xref_name}" \\n'
        com_call_with_retry_fn(lambda: doc.SendCommand(cmd))
        wait_for_command_finish_fn(doc, timeout_s=20.0)

        try:
            if xref_obj is not None:
                dyn_fn(xref_obj).Delete()
        except Exception:
            pass  # Best-effort xref cleanup; entity may already be purged

        try:
            doc.Blocks.Item(block_name)
            return block_name
        except Exception:
            try:
                doc.Blocks.Item(xref_name)
                return xref_name
            except Exception as exc:
                raise RuntimeError(
                    f"Xref bind completed but block not found. Tried: '{block_name}', '{xref_name}'."
                ) from exc

    except Exception as exc:
        raise RuntimeError(
            f"Failed to import reference DWG.\nDWG: {dwg_path}\nBlock: {block_name}\nDetails: {exc}"
        ) from exc


def insert_reference_block(
    doc: Any,
    ms: Any,
    ref_dwg_path: str,
    layer_name: str,
    x: float,
    y: float,
    z: float,
    scale: float,
    rotation_deg: float,
    *,
    dyn_fn: Any,
    ensure_block_exists_fn: Any,
    ensure_layer_fn: Any,
    pt_fn: Any,
    com_call_with_retry_fn: Any,
) -> Any:
    doc = dyn_fn(doc)
    ms = dyn_fn(ms)
    ref_dwg_path = os.path.abspath(ref_dwg_path)

    if not os.path.exists(ref_dwg_path):
        raise RuntimeError(
            f"Reference DWG not found: {ref_dwg_path}\n"
            "Put 'Coordinate Reference Point.dwg' in an 'assets' folder next to api_server.py."
        )

    block_name = os.path.splitext(os.path.basename(ref_dwg_path))[0]
    cache_key = os.path.normcase(ref_dwg_path)

    if cache_key in _REF_IMPORT_CACHE:
        insert_name = _REF_IMPORT_CACHE[cache_key]
    else:
        insert_name = ensure_block_exists_fn(doc, block_name, ref_dwg_path)
        _REF_IMPORT_CACHE[cache_key] = insert_name

    ensure_layer_fn(doc, layer_name)

    def _insert():
        return ms.InsertBlock(
            pt_fn(x, y, z),
            insert_name,
            float(scale),
            float(scale),
            float(scale),
            math.radians(float(rotation_deg)),
        )

    br = com_call_with_retry_fn(_insert)
    br = dyn_fn(br)
    try:
        br.Layer = layer_name
    except Exception:
        pass  # COM layer assignment may fail; block ref is still inserted
    return br


def add_point_label(
    ms: Any,
    layer_name: str,
    label_text: str,
    x: float,
    y: float,
    z: float,
    scale: float,
    *,
    pt_fn: Any,
    com_call_with_retry_fn: Any,
    dyn_fn: Any,
) -> Any:
    text_height = max(scale * 1.5, 0.5)
    x_offset = scale * 3.0

    def _add():
        return ms.AddText(label_text, pt_fn(x + x_offset, y, z), text_height)

    txt = com_call_with_retry_fn(_add)
    txt = dyn_fn(txt)
    try:
        txt.Layer = layer_name
    except Exception:
        pass  # COM layer assignment may fail; text entity is still created
    try:
        txt.Alignment = 0
    except Exception:
        pass  # COM object may not support Alignment property
    return txt

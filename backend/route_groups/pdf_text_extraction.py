from __future__ import annotations

import os
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    from pypdf import PdfReader

    _PYPDF_AVAILABLE = True
except Exception:
    PdfReader = None
    _PYPDF_AVAILABLE = False

try:
    from PIL import Image

    _PIL_AVAILABLE = True
except Exception:
    Image = None
    _PIL_AVAILABLE = False

try:
    import pytesseract
    from pytesseract import Output as _TESSERACT_OUTPUT

    _PYTESSERACT_AVAILABLE = True
except Exception:
    pytesseract = None
    _TESSERACT_OUTPUT = None
    _PYTESSERACT_AVAILABLE = False


def normalize_pdf_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def safe_pdf_float(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except Exception:
        return None
    if not (numeric == numeric) or numeric in {float("inf"), float("-inf")}:
        return None
    return numeric


def pdf_render_available() -> bool:
    return bool(_PIL_AVAILABLE and shutil.which("pdftoppm"))


def pdf_ocr_available() -> bool:
    return bool(
        _PYTESSERACT_AVAILABLE
        and _PIL_AVAILABLE
        and shutil.which("tesseract")
        and shutil.which("pdftoppm")
    )


def _bounds_union(bounds_list: Sequence[Dict[str, float]]) -> Dict[str, float]:
    left = min(float(bounds.get("x") or 0.0) for bounds in bounds_list)
    bottom = min(float(bounds.get("y") or 0.0) for bounds in bounds_list)
    right = max(
        float(bounds.get("x") or 0.0) + float(bounds.get("width") or 0.0)
        for bounds in bounds_list
    )
    top = max(
        float(bounds.get("y") or 0.0) + float(bounds.get("height") or 0.0)
        for bounds in bounds_list
    )
    return {
        "x": left,
        "y": bottom,
        "width": max(0.0001, right - left),
        "height": max(0.0001, top - bottom),
    }


def _approximate_fragment_bounds(
    *,
    text: str,
    x: float,
    y: float,
    font_size: float,
) -> Dict[str, float]:
    size = max(4.0, font_size)
    text_width = max(size * 0.8, len(text) * size * 0.52)
    text_height = max(6.0, size * 1.15)
    return {
        "x": x,
        "y": y - (text_height * 0.28),
        "width": text_width,
        "height": text_height,
    }


def _group_text_fragments(fragments: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not fragments:
        return []
    rows: Dict[int, List[Dict[str, Any]]] = {}
    for fragment in fragments:
        text_value = normalize_pdf_text(fragment.get("text"))
        if not text_value:
            continue
        y_value = safe_pdf_float(fragment.get("y")) or 0.0
        row_key = int(round(y_value / 3.0))
        rows.setdefault(row_key, []).append(
            {
                "text": text_value,
                "x": safe_pdf_float(fragment.get("x")) or 0.0,
                "y": y_value,
                "font_size": safe_pdf_float(fragment.get("font_size")) or 0.0,
                "bounds": fragment.get("bounds")
                if isinstance(fragment.get("bounds"), dict)
                else None,
            }
        )

    lines: List[Dict[str, Any]] = []
    for row_key in sorted(rows.keys(), reverse=True):
        row_fragments = sorted(rows[row_key], key=lambda entry: float(entry.get("x") or 0.0))
        line_text = " ".join(fragment["text"] for fragment in row_fragments).strip()
        if not line_text:
            continue
        fragment_bounds = [
            bounds
            for bounds in (fragment.get("bounds") for fragment in row_fragments)
            if isinstance(bounds, dict)
        ]
        bounds = _bounds_union(fragment_bounds) if fragment_bounds else None
        lines.append(
            {
                "text": line_text,
                "x": min(float(fragment["x"]) for fragment in row_fragments),
                "y": sum(float(fragment["y"]) for fragment in row_fragments) / len(row_fragments),
                "font_size": max(float(fragment["font_size"]) for fragment in row_fragments),
                "bounds": bounds,
            }
        )
    return lines


def extract_embedded_text_page_lines(pdf_path: str, *, page_index: int = 0) -> Dict[str, Any]:
    if not _PYPDF_AVAILABLE or PdfReader is None:
        return {
            "page_width": 0.0,
            "page_height": 0.0,
            "lines": [],
            "source": "embedded_text_unavailable",
        }
    with open(pdf_path, "rb") as handle:
        reader = PdfReader(handle)
        if not reader.pages:
            return {
                "page_width": 0.0,
                "page_height": 0.0,
                "lines": [],
                "source": "embedded_text_empty",
            }
        if page_index < 0 or page_index >= len(reader.pages):
            return {
                "page_width": 0.0,
                "page_height": 0.0,
                "lines": [],
                "source": "embedded_text_out_of_range",
            }
        page = reader.pages[page_index]
        media_box = getattr(page, "mediabox", None)
        page_width = safe_pdf_float(getattr(media_box, "width", None)) or 0.0
        page_height = safe_pdf_float(getattr(media_box, "height", None)) or 0.0
        fragments: List[Dict[str, Any]] = []

        def visitor_text(text, _cm, tm, _font_dict, font_size):  # type: ignore[no-untyped-def]
            text_value = normalize_pdf_text(text)
            if not text_value:
                return
            x_value = 0.0
            y_value = 0.0
            if isinstance(tm, (list, tuple)) and len(tm) >= 6:
                x_value = safe_pdf_float(tm[4]) or 0.0
                y_value = safe_pdf_float(tm[5]) or 0.0
            size_value = safe_pdf_float(font_size) or 0.0
            fragments.append(
                {
                    "text": text_value,
                    "x": x_value,
                    "y": y_value,
                    "font_size": size_value,
                    "bounds": _approximate_fragment_bounds(
                        text=text_value,
                        x=x_value,
                        y=y_value,
                        font_size=size_value,
                    ),
                }
            )

        lines: List[Dict[str, Any]] = []
        try:
            page.extract_text(visitor_text=visitor_text)
            lines = _group_text_fragments(fragments)
        except Exception:
            lines = []
        if not lines:
            text_value = normalize_pdf_text(page.extract_text() or "")
            lines = [
                {
                    "text": line.strip(),
                    "x": 0.0,
                    "y": 0.0,
                    "font_size": 0.0,
                    "bounds": None,
                }
                for line in str(text_value).splitlines()
                if line.strip()
            ]
        return {
            "page_width": page_width,
            "page_height": page_height,
            "lines": lines,
            "source": "embedded_text",
        }


def render_pdf_page_to_png(
    pdf_path: str,
    *,
    page_index: int,
    output_dir: str,
    prefix: str = "page",
) -> Dict[str, Any]:
    if not pdf_render_available():
        return {
            "path": "",
            "image_width": 0,
            "image_height": 0,
            "source": "render_unavailable",
        }
    output_prefix = os.path.join(output_dir, prefix)
    page_number = page_index + 1
    subprocess.run(
        [
            shutil.which("pdftoppm") or "pdftoppm",
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-singlefile",
            "-png",
            pdf_path,
            output_prefix,
        ],
        capture_output=True,
        check=False,
        text=True,
    )
    image_path = f"{output_prefix}.png"
    if not os.path.isfile(image_path) or not _PIL_AVAILABLE or Image is None:
        return {
            "path": "",
            "image_width": 0,
            "image_height": 0,
            "source": "render_failed",
        }
    with Image.open(image_path) as image:
        width, height = image.size
    return {
        "path": image_path,
        "image_width": width,
        "image_height": height,
        "source": "pdftoppm",
    }


def pixel_bounds_to_pdf_bounds(
    pixel_bounds: Dict[str, int],
    *,
    page_width: float,
    page_height: float,
    image_width: int,
    image_height: int,
) -> Optional[Dict[str, float]]:
    if page_width <= 0 or page_height <= 0 or image_width <= 0 or image_height <= 0:
        return None
    left = max(0, int(pixel_bounds.get("left") or 0))
    top = max(0, int(pixel_bounds.get("top") or 0))
    width = max(0, int(pixel_bounds.get("width") or 0))
    height = max(0, int(pixel_bounds.get("height") or 0))
    if width <= 0 or height <= 0:
        return None
    x = (left / image_width) * page_width
    y_top = (top / image_height) * page_height
    y = page_height - y_top - ((height / image_height) * page_height)
    return {
        "x": x,
        "y": max(0.0, y),
        "width": max(0.0001, (width / image_width) * page_width),
        "height": max(0.0001, (height / image_height) * page_height),
    }


def pdf_bounds_to_pixel_bounds(
    bounds: Dict[str, float],
    *,
    page_width: float,
    page_height: float,
    image_width: int,
    image_height: int,
    padding: int = 0,
) -> Optional[Dict[str, int]]:
    if page_width <= 0 or page_height <= 0 or image_width <= 0 or image_height <= 0:
        return None
    x = safe_pdf_float(bounds.get("x"))
    y = safe_pdf_float(bounds.get("y"))
    width = safe_pdf_float(bounds.get("width"))
    height = safe_pdf_float(bounds.get("height"))
    if x is None or y is None or width is None or height is None or width <= 0 or height <= 0:
        return None
    left = int(round((x / page_width) * image_width))
    top = int(round(((page_height - (y + height)) / page_height) * image_height))
    pixel_width = int(round((width / page_width) * image_width))
    pixel_height = int(round((height / page_height) * image_height))
    return {
        "left": max(0, left - padding),
        "top": max(0, top - padding),
        "width": max(1, pixel_width + (padding * 2)),
        "height": max(1, pixel_height + (padding * 2)),
    }


def extract_ocr_page_lines_from_image(
    image_path: str,
    *,
    page_width: float,
    page_height: float,
) -> Dict[str, Any]:
    if not pdf_ocr_available() or not _PIL_AVAILABLE or Image is None:
        return {"lines": [], "source": "ocr_unavailable"}
    if not os.path.isfile(image_path) or not _PYTESSERACT_AVAILABLE or pytesseract is None:
        return {"lines": [], "source": "ocr_unavailable"}

    with Image.open(image_path) as image:
        image_width, image_height = image.size
        raw_data = pytesseract.image_to_data(
            image,
            output_type=_TESSERACT_OUTPUT.DICT,
            config="--psm 6",
        )

    if not isinstance(raw_data, dict):
        return {"lines": [], "source": "ocr"}

    total_entries = len(raw_data.get("text") or [])
    grouped_rows: Dict[Tuple[int, int, int, int], List[Dict[str, Any]]] = {}
    for index in range(total_entries):
        text_value = normalize_pdf_text((raw_data.get("text") or [None])[index])
        if not text_value:
            continue
        left = int(safe_pdf_float((raw_data.get("left") or [0])[index]) or 0)
        top = int(safe_pdf_float((raw_data.get("top") or [0])[index]) or 0)
        width = int(safe_pdf_float((raw_data.get("width") or [0])[index]) or 0)
        height = int(safe_pdf_float((raw_data.get("height") or [0])[index]) or 0)
        if width <= 0 or height <= 0:
            continue
        row_key = (
            int(safe_pdf_float((raw_data.get("page_num") or [1])[index]) or 1),
            int(safe_pdf_float((raw_data.get("block_num") or [0])[index]) or 0),
            int(safe_pdf_float((raw_data.get("par_num") or [0])[index]) or 0),
            int(safe_pdf_float((raw_data.get("line_num") or [0])[index]) or 0),
        )
        grouped_rows.setdefault(row_key, []).append(
            {
                "text": text_value,
                "left": left,
                "top": top,
                "width": width,
                "height": height,
                "confidence": safe_pdf_float((raw_data.get("conf") or [0])[index]) or 0.0,
            }
        )

    lines: List[Dict[str, Any]] = []
    for row_key in sorted(grouped_rows.keys()):
        words = sorted(grouped_rows[row_key], key=lambda entry: int(entry.get("left") or 0))
        line_text = " ".join(str(entry.get("text") or "").strip() for entry in words).strip()
        if not line_text:
            continue
        left = min(int(entry.get("left") or 0) for entry in words)
        top = min(int(entry.get("top") or 0) for entry in words)
        right = max(int(entry.get("left") or 0) + int(entry.get("width") or 0) for entry in words)
        bottom = max(int(entry.get("top") or 0) + int(entry.get("height") or 0) for entry in words)
        pixel_bounds = {
            "left": left,
            "top": top,
            "width": max(1, right - left),
            "height": max(1, bottom - top),
        }
        pdf_bounds = pixel_bounds_to_pdf_bounds(
            pixel_bounds,
            page_width=page_width,
            page_height=page_height,
            image_width=image_width,
            image_height=image_height,
        )
        lines.append(
            {
                "text": line_text,
                "x": pdf_bounds["x"] if isinstance(pdf_bounds, dict) else 0.0,
                "y": pdf_bounds["y"] if isinstance(pdf_bounds, dict) else 0.0,
                "font_size": 0.0,
                "bounds": pdf_bounds,
                "pixel_bounds": pixel_bounds,
                "ocr_confidence": round(
                    sum(float(entry.get("confidence") or 0.0) for entry in words) / len(words),
                    4,
                ),
            }
        )
    return {
        "lines": lines,
        "source": "ocr",
        "image_width": image_width,
        "image_height": image_height,
    }

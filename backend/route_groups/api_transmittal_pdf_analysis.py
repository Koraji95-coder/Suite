from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    from openpyxl import Workbook

    _OPENPYXL_AVAILABLE = True
except Exception:
    Workbook = None
    _OPENPYXL_AVAILABLE = False

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

    _PYTESSERACT_AVAILABLE = True
except Exception:
    pytesseract = None
    _PYTESSERACT_AVAILABLE = False

from .api_local_learning_runtime import get_local_learning_runtime

_DRAWING_NUMBER_PATTERN = re.compile(
    r"\b(?:R3P[-_]\d+[-_])?E\d+[-_]\d{3,5}\b|\b[A-Z0-9]{1,6}[-_][A-Z0-9]{2,10}\b",
    re.IGNORECASE,
)
_REVISION_VALUE_PATTERN = re.compile(r"\b(?:REV(?:ISION)?[:\s-]*)?([A-Z0-9]{1,5})\b", re.IGNORECASE)
_LABEL_DRAWING_NUMBER = ("drawing no", "dwg no", "document no", "doc no", "sheet no")
_LABEL_REVISION = ("revision", "rev")
_LABEL_TITLE = ("drawing title", "sheet title", "title", "description")
_LOCAL_LEARNING_RUNTIME = get_local_learning_runtime()


def _safe_float(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except Exception:
        return None
    if not (numeric == numeric) or numeric in {float("inf"), float("-inf")}:
        return None
    return numeric


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _normalize_token(value: Any) -> str:
    return _normalize_text(value).lower().replace(" ", "_")


def _ocr_available() -> bool:
    return bool(
        _PYTESSERACT_AVAILABLE
        and _PIL_AVAILABLE
        and shutil.which("tesseract")
        and shutil.which("pdftoppm")
    )


def _line_feature_payload(
    line: Dict[str, Any],
    *,
    page_width: float,
    page_height: float,
    zone: str,
) -> Dict[str, Any]:
    text_value = _normalize_text(line.get("text"))
    x_value = _safe_float(line.get("x")) or 0.0
    y_value = _safe_float(line.get("y")) or 0.0
    return {
        "zone": zone,
        "x_bucket": int(round((x_value / max(page_width, 1.0)) * 10.0)),
        "y_bucket": int(round((y_value / max(page_height, 1.0)) * 10.0)),
        "text_length_bucket": int(round(len(text_value) / 8.0)),
        "has_digits": any(char.isdigit() for char in text_value),
        "has_hyphen": "-" in text_value,
        "upper_ratio_bucket": int(
            round(
                (
                    sum(1 for char in text_value if char.isupper())
                    / max(1, sum(1 for char in text_value if char.isalpha()))
                )
                * 10.0
            )
        ),
    }


def _group_text_fragments(fragments: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not fragments:
        return []
    rows: Dict[int, List[Dict[str, Any]]] = {}
    for fragment in fragments:
        text_value = _normalize_text(fragment.get("text"))
        if not text_value:
            continue
        y_value = _safe_float(fragment.get("y")) or 0.0
        row_key = int(round(y_value / 3.0))
        rows.setdefault(row_key, []).append(
            {
                "text": text_value,
                "x": _safe_float(fragment.get("x")) or 0.0,
                "y": y_value,
                "font_size": _safe_float(fragment.get("font_size")) or 0.0,
            }
        )
    lines: List[Dict[str, Any]] = []
    for row_key in sorted(rows.keys(), reverse=True):
        row_fragments = sorted(rows[row_key], key=lambda entry: float(entry.get("x") or 0.0))
        line_text = " ".join(fragment["text"] for fragment in row_fragments).strip()
        if not line_text:
            continue
        lines.append(
            {
                "text": line_text,
                "x": min(float(fragment["x"]) for fragment in row_fragments),
                "y": sum(float(fragment["y"]) for fragment in row_fragments) / len(row_fragments),
                "font_size": max(float(fragment["font_size"]) for fragment in row_fragments),
            }
        )
    return lines


def _extract_embedded_text_lines(pdf_path: str) -> Dict[str, Any]:
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
        page = reader.pages[0]
        media_box = getattr(page, "mediabox", None)
        page_width = _safe_float(getattr(media_box, "width", None)) or 0.0
        page_height = _safe_float(getattr(media_box, "height", None)) or 0.0
        fragments: List[Dict[str, Any]] = []

        def visitor_text(text, _cm, tm, _font_dict, font_size):  # type: ignore[no-untyped-def]
            text_value = _normalize_text(text)
            if not text_value:
                return
            x_value = 0.0
            y_value = 0.0
            if isinstance(tm, (list, tuple)) and len(tm) >= 6:
                x_value = _safe_float(tm[4]) or 0.0
                y_value = _safe_float(tm[5]) or 0.0
            fragments.append(
                {
                    "text": text_value,
                    "x": x_value,
                    "y": y_value,
                    "font_size": _safe_float(font_size) or 0.0,
                }
            )

        lines: List[Dict[str, Any]] = []
        try:
            page.extract_text(visitor_text=visitor_text)
            lines = _group_text_fragments(fragments)
        except Exception:
            lines = []
        if not lines:
            text_value = _normalize_text(page.extract_text() or "")
            fallback_lines = [
                {"text": line.strip(), "x": 0.0, "y": 0.0, "font_size": 0.0}
                for line in str(text_value).splitlines()
                if line.strip()
            ]
            lines = fallback_lines
        return {
            "page_width": page_width,
            "page_height": page_height,
            "lines": lines,
            "source": "embedded_text",
        }


def _ocr_first_page_lines(pdf_path: str) -> Dict[str, Any]:
    if not _ocr_available():
        return {"lines": [], "source": "ocr_unavailable"}
    with tempfile.TemporaryDirectory(prefix="transmittal_ocr_") as temp_dir:
        output_prefix = os.path.join(temp_dir, "page")
        subprocess.run(
            [
                shutil.which("pdftoppm") or "pdftoppm",
                "-f",
                "1",
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
        if not os.path.isfile(image_path) or not _PYTESSERACT_AVAILABLE or pytesseract is None:
            return {"lines": [], "source": "ocr_unavailable"}
        image = Image.open(image_path)
        text_value = _normalize_text(pytesseract.image_to_string(image) or "")
        lines = [
            {"text": line.strip(), "x": 0.0, "y": 0.0, "font_size": 0.0}
            for line in str(text_value).splitlines()
            if line.strip()
        ]
        return {"lines": lines, "source": "ocr"}


def _select_title_block_zone(
    lines: Sequence[Dict[str, Any]],
    *,
    page_width: float,
    page_height: float,
) -> Tuple[str, List[Dict[str, Any]]]:
    if not lines or page_width <= 0 or page_height <= 0:
        return "whole_page", list(lines)

    def in_bottom_right(line: Dict[str, Any]) -> bool:
        return (
            (_safe_float(line.get("x")) or 0.0) >= page_width * 0.55
            and (_safe_float(line.get("y")) or 0.0) <= page_height * 0.28
        )

    def in_bottom_left(line: Dict[str, Any]) -> bool:
        return (
            (_safe_float(line.get("x")) or 0.0) <= page_width * 0.45
            and (_safe_float(line.get("y")) or 0.0) <= page_height * 0.28
        )

    bottom_right = [line for line in lines if in_bottom_right(line)]
    bottom_left = [line for line in lines if in_bottom_left(line)]
    bottom_band = [
        line
        for line in lines
        if (_safe_float(line.get("y")) or 0.0) <= page_height * 0.22
    ]

    if len(bottom_right) >= len(bottom_left) and len(bottom_right) >= 3:
        return "bottom_right", bottom_right
    if len(bottom_left) >= 3:
        return "bottom_left", bottom_left
    if len(bottom_band) >= 3:
        return "bottom_band", bottom_band
    return "whole_page", list(lines)


def _candidate_from_labeled_lines(
    lines: Sequence[Dict[str, Any]],
    labels: Sequence[str],
) -> Tuple[str, float, List[str]]:
    if not lines:
        return "", 0.0, []
    normalized_labels = [label.lower() for label in labels]
    for index, line in enumerate(lines):
        text_value = _normalize_text(line.get("text"))
        lower_text = text_value.lower()
        if not any(label in lower_text for label in normalized_labels):
            continue
        parts = re.split(r"[:\-]", text_value, maxsplit=1)
        if len(parts) == 2 and _normalize_text(parts[1]):
            return _normalize_text(parts[1]), 0.92, ["label_match_same_line"]
        if index + 1 < len(lines):
            next_text = _normalize_text(lines[index + 1].get("text"))
            if next_text:
                return next_text, 0.84, ["label_match_next_line"]
    return "", 0.0, []


def _best_drawing_number(lines: Sequence[Dict[str, Any]]) -> Tuple[str, float, List[str]]:
    labeled_value, labeled_confidence, labeled_reasons = _candidate_from_labeled_lines(
        lines,
        _LABEL_DRAWING_NUMBER,
    )
    if labeled_value:
        match = _DRAWING_NUMBER_PATTERN.search(labeled_value)
        if match:
            return match.group(0).replace("_", "-"), labeled_confidence, labeled_reasons

    best_value = ""
    best_confidence = 0.0
    for line in lines:
        text_value = _normalize_text(line.get("text"))
        match = _DRAWING_NUMBER_PATTERN.search(text_value)
        if not match:
            continue
        candidate = match.group(0).replace("_", "-")
        score = 0.62
        if candidate.upper().startswith("R3P-") or re.search(r"\bE\d+-\d{3,5}\b", candidate, re.IGNORECASE):
            score += 0.12
        if score > best_confidence:
            best_value = candidate
            best_confidence = score
    return best_value, best_confidence, ["pattern_match"] if best_value else []


def _best_revision(lines: Sequence[Dict[str, Any]]) -> Tuple[str, float, List[str]]:
    labeled_value, labeled_confidence, labeled_reasons = _candidate_from_labeled_lines(
        lines,
        _LABEL_REVISION,
    )
    if labeled_value:
        match = _REVISION_VALUE_PATTERN.search(labeled_value)
        if match:
            return _normalize_text(match.group(1)), labeled_confidence, labeled_reasons

    best_value = ""
    best_confidence = 0.0
    for line in lines:
        text_value = _normalize_text(line.get("text"))
        lower_text = text_value.lower()
        if "revision" in lower_text or lower_text.startswith("rev"):
            match = _REVISION_VALUE_PATTERN.search(text_value)
            if match:
                candidate = _normalize_text(match.group(1))
                if candidate and len(candidate) <= 5:
                    best_value = candidate
                    best_confidence = 0.74
                    break
    return best_value, best_confidence, ["revision_pattern"] if best_value else []


def _best_title(lines: Sequence[Dict[str, Any]]) -> Tuple[str, float, List[str]]:
    labeled_value, labeled_confidence, labeled_reasons = _candidate_from_labeled_lines(
        lines,
        _LABEL_TITLE,
    )
    if labeled_value:
        return labeled_value, labeled_confidence, labeled_reasons

    candidates = [
        _normalize_text(line.get("text"))
        for line in lines
        if len(_normalize_text(line.get("text"))) >= 8
        and not any(keyword in _normalize_text(line.get("text")).lower() for keyword in ("revision", "rev", "drawing no", "doc no"))
    ]
    if not candidates:
        return "", 0.0, []
    best_value = max(candidates, key=len)
    return best_value, 0.58, ["longest_title_block_line"]


def _apply_titleblock_model_hints(
    *,
    lines: Sequence[Dict[str, Any]],
    page_width: float,
    page_height: float,
    zone: str,
    current: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    updated = dict(current)
    for line in lines:
        text_value = _normalize_text(line.get("text"))
        if not text_value:
            continue
        prediction = _LOCAL_LEARNING_RUNTIME.predict_text_domain(
            domain="transmittal_titleblock",
            text=text_value,
            features=_line_feature_payload(
                line,
                page_width=page_width,
                page_height=page_height,
                zone=zone,
            ),
        )
        if prediction is None:
            continue
        mapped_label = prediction.label.lower()
        if mapped_label not in {"drawing_number", "title", "revision"}:
            continue
        current_confidence = float(updated.get(mapped_label, {}).get("confidence") or 0.0)
        if prediction.confidence <= current_confidence:
            continue
        updated[mapped_label] = {
            "value": text_value,
            "confidence": round(prediction.confidence, 4),
            "source": prediction.source,
            "reason_codes": list(prediction.reason_codes),
            "model_version": prediction.model_version,
        }
    return updated


def analyze_pdf_title_block(pdf_path: str) -> Dict[str, Any]:
    embedded = _extract_embedded_text_lines(pdf_path)
    lines = embedded.get("lines") if isinstance(embedded.get("lines"), list) else []
    extraction_source = str(embedded.get("source") or "embedded_text")
    if sum(len(_normalize_text(line.get("text"))) for line in lines if isinstance(line, dict)) < 24:
        ocr_payload = _ocr_first_page_lines(pdf_path)
        ocr_lines = ocr_payload.get("lines") if isinstance(ocr_payload.get("lines"), list) else []
        if ocr_lines:
            lines = ocr_lines
            extraction_source = str(ocr_payload.get("source") or "ocr")

    page_width = float(embedded.get("page_width") or 0.0)
    page_height = float(embedded.get("page_height") or 0.0)
    zone, scoped_lines = _select_title_block_zone(
        lines,
        page_width=page_width,
        page_height=page_height,
    )

    drawing_number, drawing_confidence, drawing_reasons = _best_drawing_number(scoped_lines)
    title, title_confidence, title_reasons = _best_title(scoped_lines)
    revision, revision_confidence, revision_reasons = _best_revision(scoped_lines)
    field_results: Dict[str, Dict[str, Any]] = {
        "drawing_number": {
            "value": drawing_number,
            "confidence": drawing_confidence,
            "source": extraction_source,
            "reason_codes": drawing_reasons,
            "model_version": "deterministic-v1",
        },
        "title": {
            "value": title,
            "confidence": title_confidence,
            "source": extraction_source,
            "reason_codes": title_reasons,
            "model_version": "deterministic-v1",
        },
        "revision": {
            "value": revision,
            "confidence": revision_confidence,
            "source": extraction_source,
            "reason_codes": revision_reasons,
            "model_version": "deterministic-v1",
        },
    }
    field_results = _apply_titleblock_model_hints(
        lines=scoped_lines,
        page_width=page_width,
        page_height=page_height,
        zone=zone,
        current=field_results,
    )
    confidence_values = [
        float(field_results[key].get("confidence") or 0.0)
        for key in ("drawing_number", "title", "revision")
    ]
    combined_confidence = round(sum(confidence_values) / max(1, len(confidence_values)), 4)
    needs_review = combined_confidence < 0.72 or any(
        not _normalize_text(field_results[key].get("value"))
        for key in ("drawing_number", "title", "revision")
    )
    model_versions = sorted(
        {
            str(field_results[key].get("model_version") or "").strip()
            for key in field_results
            if str(field_results[key].get("model_version") or "").strip()
        }
    )
    return {
        "drawing_number": _normalize_text(field_results["drawing_number"].get("value")),
        "title": _normalize_text(field_results["title"].get("value")),
        "revision": _normalize_text(field_results["revision"].get("value")),
        "confidence": combined_confidence,
        "source": extraction_source,
        "needs_review": needs_review,
        "accepted": not needs_review,
        "override_reason": None,
        "recognition": {
            "model_version": model_versions[0] if len(model_versions) == 1 else ",".join(model_versions) or "deterministic-v1",
            "confidence": combined_confidence,
            "source": "local_model" if any(value.get("source") == "local_model" for value in field_results.values()) else extraction_source,
            "feature_source": "titleblock_lines",
            "reason_codes": [
                f"zone:{zone}",
                f"extraction:{extraction_source}",
                "titleblock_analysis",
            ],
            "needs_review": needs_review,
            "accepted": not needs_review,
            "override_reason": None,
        },
        "fields": field_results,
    }


def build_temporary_index_workbook(
    *,
    output_path: str,
    document_rows: Sequence[Dict[str, Any]],
) -> str:
    if not _OPENPYXL_AVAILABLE or Workbook is None:
        raise RuntimeError("openpyxl is required to build a temporary index workbook.")
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Documents"
    worksheet.append(["Document No.", "Description", "Revision"])
    for row in document_rows:
        worksheet.append(
            [
                _normalize_text(row.get("drawing_number")),
                _normalize_text(row.get("title")),
                _normalize_text(row.get("revision")),
            ]
        )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    workbook.save(output_path)
    return output_path


def _suggest_document_stem(
    *,
    project_number: str,
    drawing_number: str,
    title: str,
    original_name: str,
) -> str:
    normalized_doc = _normalize_text(drawing_number).replace("_", "-")
    normalized_title = _normalize_text(title)
    if not normalized_doc:
        return Path(original_name).stem
    if normalized_doc.upper().startswith("R3P-"):
        doc_prefix = normalized_doc
    elif re.search(r"^E\d+-\d{3,5}$", normalized_doc, re.IGNORECASE) and project_number:
        doc_prefix = f"R3P-{project_number}-{normalized_doc}"
    else:
        doc_prefix = normalized_doc
    if normalized_title:
        return f"{doc_prefix} - {normalized_title}"
    return doc_prefix


def materialize_documents_for_render(
    *,
    source_paths: Sequence[str],
    document_rows: Sequence[Dict[str, Any]],
    output_dir: str,
    project_number: str,
) -> List[str]:
    os.makedirs(output_dir, exist_ok=True)
    row_by_name = {
        str(row.get("file_name") or "").strip().lower(): row
        for row in document_rows
        if isinstance(row, dict) and str(row.get("file_name") or "").strip()
    }
    output_paths: List[str] = []
    used_names: set[str] = set()
    for source_path in source_paths:
        source = Path(source_path)
        row = row_by_name.get(source.name.lower(), {})
        stem = _suggest_document_stem(
            project_number=project_number,
            drawing_number=str(row.get("drawing_number") or ""),
            title=str(row.get("title") or ""),
            original_name=source.name,
        )
        safe_stem = re.sub(r"[^\w.\- ]+", "", stem).strip() or source.stem
        candidate_name = f"{safe_stem}{source.suffix or '.pdf'}"
        unique_name = candidate_name
        duplicate_index = 2
        while unique_name.lower() in used_names:
            unique_name = f"{safe_stem} ({duplicate_index}){source.suffix or '.pdf'}"
            duplicate_index += 1
        used_names.add(unique_name.lower())
        output_path = Path(output_dir) / unique_name
        shutil.copy2(source, output_path)
        output_paths.append(str(output_path))
    return output_paths

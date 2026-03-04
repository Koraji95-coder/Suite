from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import tempfile
import time
from datetime import datetime
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request, send_file
from flask_limiter import Limiter
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from werkzeug.utils import secure_filename

MAX_BATCH_FILES = 50
MAX_BATCH_RULES = 100
MAX_PREVIEW_MATCHES = 500
MAX_APPLY_CHANGE_ROWS = 5000


def create_batch_find_replace_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    is_valid_api_key: Callable[[Optional[str]], bool],
    api_key: str,
    schedule_cleanup: Callable[[str], None],
    batch_session_cookie: str,
    batch_session_ttl_seconds: int,
) -> Blueprint:
    """Create /api/batch-find-replace route group blueprint."""
    bp = Blueprint("batch_find_replace_api", __name__, url_prefix="/api/batch-find-replace")

    def _create_batch_session_token() -> str:
        timestamp = int(time.time())
        ts_bytes = str(timestamp).encode("utf-8")
        signature = hmac.new(api_key.encode("utf-8"), ts_bytes, hashlib.sha256).hexdigest()
        return f"{timestamp}.{signature}"

    def _is_valid_batch_session(token: Optional[str]) -> bool:
        if not token:
            return False
        try:
            ts_str, signature = token.split(".", 1)
            timestamp = int(ts_str)
        except Exception:
            return False

        if timestamp <= 0:
            return False
        if (time.time() - timestamp) > batch_session_ttl_seconds:
            return False

        expected = hmac.new(api_key.encode("utf-8"), ts_str.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)

    def require_batch_session_or_api_key(f):
        """Allow either API key header or a signed batch session cookie."""

        @wraps(f)
        def decorated_function(*args, **kwargs):
            provided_key = request.headers.get("X-API-Key")
            if provided_key and is_valid_api_key(provided_key):
                return f(*args, **kwargs)

            token = request.cookies.get(batch_session_cookie)
            if not _is_valid_batch_session(token):
                logger.warning(
                    "Unauthorized batch request: %s from %s",
                    request.path,
                    request.remote_addr,
                )
                return jsonify({"error": "Batch session required", "code": "AUTH_REQUIRED"}), 401

            return f(*args, **kwargs)

        return decorated_function

    def _parse_batch_rules() -> List[Dict[str, Any]]:
        raw_rules = request.form.get("rules", "")
        if not raw_rules:
            raise ValueError("Missing rules payload")

        try:
            parsed = json.loads(raw_rules)
        except Exception:
            raise ValueError("Rules payload is not valid JSON")

        if not isinstance(parsed, list):
            raise ValueError("Rules payload must be an array")
        if len(parsed) == 0:
            raise ValueError("At least one rule is required")
        if len(parsed) > MAX_BATCH_RULES:
            raise ValueError(f"Too many rules. Maximum is {MAX_BATCH_RULES}")

        rules: List[Dict[str, Any]] = []
        for idx, item in enumerate(parsed):
            if not isinstance(item, dict):
                continue
            find_text = str(item.get("find", "")).strip()
            if not find_text:
                continue

            rules.append(
                {
                    "id": str(item.get("id", f"rule-{idx + 1}")),
                    "find": find_text,
                    "replace": str(item.get("replace", "")),
                    "use_regex": bool(item.get("useRegex", False)),
                    "match_case": bool(item.get("matchCase", False)),
                }
            )

        if not rules:
            raise ValueError("No valid rules provided")

        return rules

    def _decode_uploaded_text(raw_bytes: bytes) -> str:
        if b"\x00" in raw_bytes:
            raise ValueError("Binary files are not supported")

        for encoding in ("utf-8", "utf-16", "latin-1"):
            try:
                return raw_bytes.decode(encoding)
            except Exception:
                continue

        raise ValueError("Unable to decode file as text")

    def _build_batch_pattern(rule: Dict[str, Any]) -> re.Pattern[str]:
        flags = 0 if rule["match_case"] else re.IGNORECASE
        if rule["use_regex"]:
            try:
                return re.compile(rule["find"], flags)
            except re.error as exc:
                raise ValueError(f"Invalid regex for rule '{rule['id']}': {exc}")

        return re.compile(re.escape(rule["find"]), flags)

    def _apply_rule_to_lines(
        lines: List[str],
        pattern: re.Pattern[str],
        replacement: str,
        rule_id: str,
        file_name: str,
        preview_matches: List[Dict[str, Any]],
        max_matches: int,
    ) -> Tuple[List[str], int]:
        changed_count = 0
        next_lines: List[str] = []

        for line_number, line in enumerate(lines, start=1):
            updated_line, replaced = pattern.subn(replacement, line)
            if replaced > 0:
                changed_count += replaced
                if len(preview_matches) < max_matches:
                    preview_matches.append(
                        {
                            "file": file_name,
                            "line": line_number,
                            "before": line[:500],
                            "after": updated_line[:500],
                            "ruleId": rule_id,
                        }
                    )
            next_lines.append(updated_line)

        return next_lines, changed_count

    def _process_batch_files(preview_only: bool) -> Dict[str, Any]:
        uploaded_files = request.files.getlist("files")
        if not uploaded_files:
            raise ValueError("No files uploaded")
        if len(uploaded_files) > MAX_BATCH_FILES:
            raise ValueError(f"Too many files. Maximum is {MAX_BATCH_FILES}")

        rules = _parse_batch_rules()
        max_matches = MAX_PREVIEW_MATCHES if preview_only else MAX_APPLY_CHANGE_ROWS
        preview_matches: List[Dict[str, Any]] = []
        updated_files: List[Dict[str, str]] = []
        files_changed = 0
        replacements_total = 0

        for file_storage in uploaded_files:
            file_name = secure_filename(file_storage.filename or "upload.txt")
            if not file_name:
                file_name = "upload.txt"

            try:
                raw_bytes = file_storage.read()
            finally:
                try:
                    file_storage.close()
                except Exception:
                    pass
            content = _decode_uploaded_text(raw_bytes)

            line_break = "\r\n" if "\r\n" in content else "\n"
            lines = content.splitlines()
            file_replacements = 0

            for rule in rules:
                pattern = _build_batch_pattern(rule)
                lines, changed = _apply_rule_to_lines(
                    lines,
                    pattern,
                    rule["replace"],
                    rule["id"],
                    file_name,
                    preview_matches,
                    max_matches,
                )
                file_replacements += changed

            if file_replacements > 0:
                files_changed += 1
                replacements_total += file_replacements

            if not preview_only:
                updated_files.append(
                    {
                        "file": file_name,
                        "content": line_break.join(lines),
                    }
                )

        return {
            "matches": preview_matches,
            "files_changed": files_changed,
            "replacements": replacements_total,
            "files_processed": len(uploaded_files),
            "updated_files": updated_files,
        }

    def export_batch_changes_to_excel(changes: List[Dict[str, Any]]) -> Tuple[str, str]:
        """Export batch find/replace changes to a styled Excel report."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_dir = tempfile.mkdtemp(prefix="batch_find_replace_")
        out_path = os.path.join(out_dir, f"batch_find_replace_changes_{timestamp}.xlsx")

        wb = Workbook()
        ws = wb.active
        ws.title = "Changes"
        summary_ws = wb.create_sheet("Summary")

        headers = ["File", "Line", "Rule ID", "Before", "After"]

        title_fill = PatternFill("solid", fgColor="2B6CB5")
        title_font = Font(bold=True, color="FFFFFF", size=14, name="Arial")
        header_fill = PatternFill("solid", fgColor="3A3F47")
        header_font = Font(bold=True, color="F0F0F0", size=11, name="Arial")
        alt_fill_even = PatternFill("solid", fgColor="E8E6E2")
        alt_fill_odd = PatternFill("solid", fgColor="D4D1CC")
        data_font = Font(size=10, color="2A2A2A", name="Arial")
        border_side = Side(style="thin", color="B0ADA8")
        all_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)
        header_border = Border(
            left=border_side,
            right=border_side,
            top=border_side,
            bottom=Side(style="medium", color="3A3F47"),
        )

        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
        title_cell = ws.cell(row=1, column=1, value="Batch Find & Replace Change Report")
        title_cell.font = title_font
        title_cell.fill = title_fill
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        title_cell.border = all_border
        for col_idx in range(2, len(headers) + 1):
            c = ws.cell(row=1, column=col_idx)
            c.fill = title_fill
            c.border = all_border

        for col_idx, h in enumerate(headers, start=1):
            c = ws.cell(row=2, column=col_idx, value=h)
            c.font = header_font
            c.fill = header_fill
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = header_border

        for row_idx, change in enumerate(changes, start=3):
            row_fill = alt_fill_even if (row_idx - 3) % 2 == 0 else alt_fill_odd
            row_values = [
                str(change.get("file", "")),
                int(change.get("line", 0) or 0),
                str(change.get("ruleId", "")),
                str(change.get("before", "")),
                str(change.get("after", "")),
            ]

            for col_idx, value in enumerate(row_values, start=1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.fill = row_fill
                cell.border = all_border
                cell.font = data_font
                if col_idx == 2:
                    cell.alignment = Alignment(horizontal="right", vertical="top")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)

        ws.column_dimensions[get_column_letter(1)].width = 42
        ws.column_dimensions[get_column_letter(2)].width = 10
        ws.column_dimensions[get_column_letter(3)].width = 16
        ws.column_dimensions[get_column_letter(4)].width = 60
        ws.column_dimensions[get_column_letter(5)].width = 60

        ws.row_dimensions[1].height = 28
        ws.row_dimensions[2].height = 22
        ws.freeze_panes = "A3"

        summary_headers = ["Metric", "Value"]
        summary_title_fill = PatternFill("solid", fgColor="2B6CB5")
        summary_title_font = Font(bold=True, color="FFFFFF", size=14, name="Arial")
        summary_header_fill = PatternFill("solid", fgColor="3A3F47")
        summary_header_font = Font(bold=True, color="F0F0F0", size=11, name="Arial")
        summary_data_font = Font(size=10, color="2A2A2A", name="Arial")

        summary_ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=2)
        summary_title_cell = summary_ws.cell(row=1, column=1, value="Batch Find & Replace Summary")
        summary_title_cell.font = summary_title_font
        summary_title_cell.fill = summary_title_fill
        summary_title_cell.alignment = Alignment(horizontal="center", vertical="center")
        summary_title_cell.border = all_border
        summary_ws.cell(row=1, column=2).fill = summary_title_fill
        summary_ws.cell(row=1, column=2).border = all_border

        for col_idx, header in enumerate(summary_headers, start=1):
            c = summary_ws.cell(row=2, column=col_idx, value=header)
            c.font = summary_header_font
            c.fill = summary_header_fill
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = header_border

        file_counts: Dict[str, int] = {}
        rule_counts: Dict[str, int] = {}
        for change in changes:
            file_name = str(change.get("file", "")) or "(unknown)"
            rule_id = str(change.get("ruleId", "")) or "(unknown)"
            file_counts[file_name] = file_counts.get(file_name, 0) + 1
            rule_counts[rule_id] = rule_counts.get(rule_id, 0) + 1

        summary_rows: List[Tuple[str, Any]] = [
            ("Total changes", len(changes)),
            ("Files with changes", len(file_counts)),
            ("Rules with changes", len(rule_counts)),
        ]

        current_row = 3
        for idx, (metric, value) in enumerate(summary_rows):
            row_fill = alt_fill_even if idx % 2 == 0 else alt_fill_odd
            metric_cell = summary_ws.cell(row=current_row, column=1, value=metric)
            value_cell = summary_ws.cell(row=current_row, column=2, value=value)
            for c in (metric_cell, value_cell):
                c.fill = row_fill
                c.border = all_border
                c.font = summary_data_font
                c.alignment = Alignment(horizontal="left", vertical="center")
            current_row += 1

        current_row += 1
        section_header = summary_ws.cell(row=current_row, column=1, value="By File")
        section_header.font = summary_header_font
        section_header.fill = summary_header_fill
        section_header.alignment = Alignment(horizontal="left", vertical="center")
        section_header.border = header_border
        summary_ws.cell(row=current_row, column=2, value="Changes")
        summary_ws.cell(row=current_row, column=2).font = summary_header_font
        summary_ws.cell(row=current_row, column=2).fill = summary_header_fill
        summary_ws.cell(row=current_row, column=2).alignment = Alignment(horizontal="center", vertical="center")
        summary_ws.cell(row=current_row, column=2).border = header_border
        current_row += 1

        for idx, (file_name, count) in enumerate(sorted(file_counts.items(), key=lambda item: item[0].lower())):
            row_fill = alt_fill_even if idx % 2 == 0 else alt_fill_odd
            file_cell = summary_ws.cell(row=current_row, column=1, value=file_name)
            count_cell = summary_ws.cell(row=current_row, column=2, value=count)
            for c in (file_cell, count_cell):
                c.fill = row_fill
                c.border = all_border
                c.font = summary_data_font
            file_cell.alignment = Alignment(horizontal="left", vertical="center")
            count_cell.alignment = Alignment(horizontal="right", vertical="center")
            current_row += 1

        current_row += 1
        section_header = summary_ws.cell(row=current_row, column=1, value="By Rule")
        section_header.font = summary_header_font
        section_header.fill = summary_header_fill
        section_header.alignment = Alignment(horizontal="left", vertical="center")
        section_header.border = header_border
        summary_ws.cell(row=current_row, column=2, value="Changes")
        summary_ws.cell(row=current_row, column=2).font = summary_header_font
        summary_ws.cell(row=current_row, column=2).fill = summary_header_fill
        summary_ws.cell(row=current_row, column=2).alignment = Alignment(horizontal="center", vertical="center")
        summary_ws.cell(row=current_row, column=2).border = header_border
        current_row += 1

        for idx, (rule_id, count) in enumerate(sorted(rule_counts.items(), key=lambda item: item[0].lower())):
            row_fill = alt_fill_even if idx % 2 == 0 else alt_fill_odd
            rule_cell = summary_ws.cell(row=current_row, column=1, value=rule_id)
            count_cell = summary_ws.cell(row=current_row, column=2, value=count)
            for c in (rule_cell, count_cell):
                c.fill = row_fill
                c.border = all_border
                c.font = summary_data_font
            rule_cell.alignment = Alignment(horizontal="left", vertical="center")
            count_cell.alignment = Alignment(horizontal="right", vertical="center")
            current_row += 1

        summary_ws.column_dimensions[get_column_letter(1)].width = 52
        summary_ws.column_dimensions[get_column_letter(2)].width = 16
        summary_ws.row_dimensions[1].height = 28
        summary_ws.row_dimensions[2].height = 22
        summary_ws.freeze_panes = "A3"

        wb.save(out_path)
        return out_path, out_dir

    @bp.route("/session", methods=["POST"])
    @limiter.limit("60 per hour")
    def api_batch_find_replace_session():
        token = _create_batch_session_token()
        response = jsonify({"success": True})
        response.set_cookie(
            batch_session_cookie,
            token,
            httponly=True,
            samesite="Strict",
            secure=request.is_secure,
            max_age=batch_session_ttl_seconds,
            path="/api/batch-find-replace/",
        )
        return response

    @bp.route("/preview", methods=["POST"])
    @require_batch_session_or_api_key
    @limiter.limit("30 per hour")
    def api_batch_find_replace_preview():
        try:
            result = _process_batch_files(preview_only=True)
            return jsonify(
                {
                    "success": True,
                    "matches": result["matches"],
                    "files_processed": result["files_processed"],
                    "files_changed": result["files_changed"],
                    "replacements": result["replacements"],
                    "message": (
                        f"Preview completed: {result['replacements']} replacement(s) "
                        f"across {result['files_changed']} file(s)."
                    ),
                }
            )
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            logger.exception("Batch preview failed")
            return jsonify({"success": False, "error": str(exc)}), 500

    @bp.route("/apply", methods=["POST"])
    @require_batch_session_or_api_key
    @limiter.limit("20 per hour")
    def api_batch_find_replace_apply():
        try:
            result = _process_batch_files(preview_only=False)
            report_path, report_dir = export_batch_changes_to_excel(result["matches"])
            schedule_cleanup(report_dir)

            if hasattr(os, "startfile"):
                try:
                    os.startfile(report_path)
                except Exception as exc:
                    logger.warning("Could not auto-open Excel report: %s", exc)

            return send_file(
                report_path,
                as_attachment=True,
                download_name=os.path.basename(report_path),
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            logger.exception("Batch apply failed")
            return jsonify({"success": False, "error": str(exc)}), 500

    return bp

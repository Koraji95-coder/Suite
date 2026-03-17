from __future__ import annotations

import os
import tempfile
import traceback
import zipfile
from datetime import datetime
from typing import Any, Callable, Dict

from flask import Blueprint, jsonify, request, send_file
from flask_limiter import Limiter

from .api_transmittal_pdf_analysis import (
    build_temporary_index_workbook,
    materialize_documents_for_render,
)


def create_transmittal_render_blueprint(
    *,
    require_api_key: Callable,
    limiter: Limiter,
    deps: Dict[str, Any],
) -> Blueprint:
    """Create /api/transmittal/render route blueprint."""
    bp = Blueprint("transmittal_render_api", __name__, url_prefix="/api/transmittal")

    TRANSMITTAL_RENDER_AVAILABLE = bool(deps.get("TRANSMITTAL_RENDER_AVAILABLE", False))
    _parse_json_field = deps.get("_parse_json_field", lambda _name, default=None: default)
    _load_transmittal_profiles_payload = deps.get(
        "_load_transmittal_profiles_payload",
        lambda: {"profiles": [], "firm_numbers": [], "defaults": {}},
    )
    _schedule_cleanup = deps.get("_schedule_cleanup", lambda _path: None)
    _save_upload = deps.get("_save_upload")
    render_cid_transmittal = deps.get("render_cid_transmittal")
    render_transmittal = deps.get("render_transmittal")
    _convert_docx_to_pdf = deps.get("_convert_docx_to_pdf")
    traceback_module = deps.get("traceback_module", traceback)

    @bp.route("/render", methods=["POST"])
    @require_api_key
    @limiter.limit("30 per hour")
    def api_transmittal_render():
        """
        Render a transmittal document (standard or CID) and return DOCX/PDF/ZIP output.
        """
        if not TRANSMITTAL_RENDER_AVAILABLE:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Transmittal render helpers not available on server.",
                    }
                ),
                503,
            )

        try:
            transmittal_type = request.form.get("type", "standard").lower()
            mode = request.form.get("mode", "generate").lower()
            output_format = request.form.get("format", "docx").lower()
            if output_format not in {"docx", "pdf", "both"}:
                output_format = "docx"
            fields = _parse_json_field("fields", {}) or {}
            if not isinstance(fields, dict):
                fields = {}
            checks = _parse_json_field("checks", {}) or {}
            if not isinstance(checks, dict):
                checks = {}
            contacts = _parse_json_field("contacts", []) or []
            if not isinstance(contacts, list):
                contacts = []
            cid_index_data = _parse_json_field("cid_index_data", []) or []
            if not isinstance(cid_index_data, list):
                cid_index_data = []
            pdf_document_data = _parse_json_field("pdf_document_data", []) or []
            if not isinstance(pdf_document_data, list):
                pdf_document_data = []

            profile_options = _load_transmittal_profiles_payload()
            available_profiles = profile_options.get("profiles", [])
            available_firms = set(profile_options.get("firm_numbers", []))
            defaults = (
                profile_options.get("defaults", {})
                if isinstance(profile_options.get("defaults"), dict)
                else {}
            )
            requested_profile_id = str(
                fields.get("from_profile_id") or fields.get("fromProfileId") or ""
            ).strip()
            if requested_profile_id:
                selected_profile = next(
                    (p for p in available_profiles if p.get("id") == requested_profile_id),
                    None,
                )
                if not selected_profile:
                    return jsonify({"success": False, "message": "Invalid transmittal profile selection."}), 400

                fields["from_profile_id"] = requested_profile_id
                fields["from_name"] = selected_profile.get("name", "")
                fields["from_title"] = selected_profile.get("title", "")
                fields["from_email"] = selected_profile.get("email", "")
                fields["from_phone"] = selected_profile.get("phone", "")

            firm_value = str(fields.get("firm") or "").strip()
            if firm_value and available_firms and firm_value not in available_firms:
                return jsonify({"success": False, "message": "Invalid firm selection."}), 400
            if not firm_value:
                default_firm = str(defaults.get("firm") or "").strip()
                if default_firm:
                    fields["firm"] = default_firm

            default_checks = {
                "trans_pdf": False,
                "trans_cad": False,
                "trans_originals": False,
                "via_email": False,
                "via_ftp": False,
                "ci_approval": False,
                "ci_bid": False,
                "ci_construction": False,
                "ci_asbuilt": False,
                "ci_reference": False,
                "ci_preliminary": False,
                "ci_info": False,
                "ci_fab": False,
                "ci_const": False,
                "ci_record": False,
                "ci_ref": False,
                "vr_approved": False,
                "vr_approved_noted": False,
                "vr_rejected": False,
            }
            merged_checks = {**default_checks, **checks}
            if not merged_checks.get("ci_const"):
                merged_checks["ci_const"] = merged_checks.get("ci_construction", False)
            if not merged_checks.get("ci_ref"):
                merged_checks["ci_ref"] = merged_checks.get("ci_reference", False)

            normalized_contacts = []
            for c in contacts:
                if not isinstance(c, dict):
                    continue
                normalized_contacts.append(
                    {
                        "name": str(c.get("name", "")).strip(),
                        "company": str(c.get("company", "")).strip(),
                        "email": str(c.get("email", "")).strip(),
                        "phone": str(c.get("phone", "")).strip(),
                    }
                )

            work_dir = tempfile.mkdtemp(prefix="transmittal_")
            _schedule_cleanup(work_dir)
            template_file = request.files.get("template")
            if not template_file:
                return jsonify({"success": False, "message": "Template file is required"}), 400
            if _save_upload is None:
                return jsonify({"success": False, "message": "Upload helper is unavailable on server."}), 503

            template_path = _save_upload(template_file, work_dir, "template.docx")

            _ = mode  # retained for parity with existing API payload contract
            project_num = str(fields.get("job_num", "")).strip() or "UNKNOWN"
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_stem = "Transmittal"

            if transmittal_type == "cid":
                if render_cid_transmittal is None:
                    return jsonify({"success": False, "message": "CID renderer is unavailable on server."}), 503

                cid_files = request.files.getlist("cid_files")
                if not cid_files:
                    return jsonify({"success": False, "message": "CID files are required for CID transmittal"}), 400
                if not cid_index_data:
                    return jsonify({"success": False, "message": "CID document index data is required"}), 400

                cid_dir = os.path.join(work_dir, "cid_files")
                os.makedirs(cid_dir, exist_ok=True)
                for f in cid_files:
                    _save_upload(f, cid_dir)

                output_stem = f"CID_Transmittal_{project_num}_{timestamp}"
                output_name = f"{output_stem}.docx"
                out_path = os.path.join(work_dir, output_name)

                render_cid_transmittal(
                    template_path,
                    cid_dir,
                    cid_index_data,
                    fields,
                    merged_checks,
                    normalized_contacts,
                    out_path,
                )
            else:
                if render_transmittal is None:
                    return jsonify({"success": False, "message": "Transmittal renderer is unavailable on server."}), 503

                document_files = request.files.getlist("documents")
                if not document_files:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "message": "Document files are required for standard transmittal",
                            }
                        ),
                        400,
                    )

                docs_dir = os.path.join(work_dir, "documents")
                os.makedirs(docs_dir, exist_ok=True)
                saved_document_paths: list[str] = []
                for f in document_files:
                    saved_document_paths.append(_save_upload(f, docs_dir))

                index_file = request.files.get("index")
                render_selected_files = None
                if index_file:
                    index_path = _save_upload(index_file, work_dir, "index.xlsx")
                elif pdf_document_data:
                    unresolved_rows = [
                        row
                        for row in pdf_document_data
                        if isinstance(row, dict)
                        and bool(row.get("needs_review"))
                        and not bool(row.get("accepted"))
                    ]
                    if unresolved_rows:
                        return (
                            jsonify(
                                {
                                    "success": False,
                                    "message": (
                                        "PDF document analysis requires review before render. "
                                        "Resolve or accept all low-confidence rows first."
                                    ),
                                }
                            ),
                            400,
                        )
                    index_path = build_temporary_index_workbook(
                        output_path=os.path.join(work_dir, "index.generated.xlsx"),
                        document_rows=[
                            row for row in pdf_document_data if isinstance(row, dict)
                        ],
                    )
                    render_selected_files = materialize_documents_for_render(
                        source_paths=saved_document_paths,
                        document_rows=[
                            row for row in pdf_document_data if isinstance(row, dict)
                        ],
                        output_dir=os.path.join(work_dir, "documents_resolved"),
                        project_number=project_num,
                    )
                else:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "message": (
                                    "Drawing index (Excel) file is required unless reviewed "
                                    "pdf_document_data is provided."
                                ),
                            }
                        ),
                        400,
                    )

                output_stem = f"Transmittal_{project_num}_{timestamp}"
                output_name = f"{output_stem}.docx"
                out_path = os.path.join(work_dir, output_name)

                render_transmittal(
                    template_path,
                    docs_dir,
                    index_path,
                    fields,
                    merged_checks,
                    normalized_contacts,
                    out_path,
                    render_selected_files,
                )

            pdf_path = None
            if output_format in {"pdf", "both"}:
                if _convert_docx_to_pdf is None:
                    return jsonify({"success": False, "message": "PDF conversion helper unavailable."}), 503
                pdf_path, pdf_error = _convert_docx_to_pdf(out_path, work_dir)
                if not pdf_path:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "message": "PDF conversion failed.",
                                "detail": pdf_error,
                            }
                        ),
                        500,
                    )

            if output_format == "pdf" and pdf_path:
                return send_file(
                    pdf_path,
                    as_attachment=True,
                    download_name=f"{output_stem}.pdf",
                    mimetype="application/pdf",
                )

            if output_format == "both" and pdf_path:
                zip_name = f"{output_stem}.zip"
                zip_path = os.path.join(work_dir, zip_name)
                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    zf.write(out_path, arcname=os.path.basename(out_path))
                    zf.write(pdf_path, arcname=os.path.basename(pdf_path))
                return send_file(
                    zip_path,
                    as_attachment=True,
                    download_name=zip_name,
                    mimetype="application/zip",
                )

            return send_file(
                out_path,
                as_attachment=True,
                download_name=output_name,
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

        except Exception as exc:
            traceback_module.print_exc()
            return jsonify({"success": False, "message": str(exc)}), 500

    return bp

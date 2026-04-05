from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from flask import Blueprint, Response, jsonify, request
from flask_limiter import Limiter
from werkzeug.utils import secure_filename

Decorator = Callable[[Callable[..., Any]], Callable[..., Any]]


def create_backup_blueprint(
    *,
    require_api_key: Decorator,
    limiter: Limiter,
    logger: Any,
    backup_storage_dir: Path,
    backup_max_bytes: int,
    backup_max_files: int,
) -> Blueprint:
    """Create /api/backup route group blueprint."""
    bp = Blueprint("backup_api", __name__, url_prefix="/api/backup")

    def _ensure_backup_storage_dir() -> None:
        backup_storage_dir.mkdir(parents=True, exist_ok=True)

    def _is_allowed_backup_extension(filename: str) -> bool:
        suffix = Path(filename).suffix.lower()
        return suffix in {".yaml", ".yml"}

    def _default_backup_filename() -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return f"suite_backup_{timestamp}.yaml"

    def _normalize_backup_filename(raw_name: str) -> str:
        candidate = secure_filename(raw_name or "")
        if not candidate:
            candidate = _default_backup_filename()

        if not _is_allowed_backup_extension(candidate):
            candidate = f"{Path(candidate).stem or 'suite_backup'}.yaml"

        if len(candidate) > 160:
            candidate = f"{Path(candidate).stem[:120]}.yaml"

        if not _is_allowed_backup_extension(candidate):
            raise ValueError("Backup filename must end with .yaml or .yml")

        return candidate

    def _resolve_backup_path(raw_name: str) -> Path:
        filename = _normalize_backup_filename(raw_name)
        _ensure_backup_storage_dir()
        storage_root = backup_storage_dir.resolve()
        resolved = (storage_root / filename).resolve()
        try:
            resolved.relative_to(storage_root)
        except ValueError:
            raise ValueError("Invalid backup path")
        return resolved

    def _backup_file_info(path: Path) -> dict[str, Any]:
        stats = path.stat()
        return {
            "name": path.name,
            "size": stats.st_size,
            "modified": datetime.utcfromtimestamp(stats.st_mtime).isoformat() + "Z",
        }

    @bp.route("/save", methods=["POST"])
    @require_api_key
    @limiter.limit("60 per hour")
    def api_backup_save():
        if not request.is_json:
            return jsonify({"success": False, "error": "Expected JSON payload"}), 400

        payload = request.get_json(silent=True) or {}
        filename_raw = str(payload.get("filename") or "").strip()
        content = payload.get("content")
        if not isinstance(content, str) or not content.strip():
            return jsonify({"success": False, "error": "Backup content is required"}), 400

        encoded = content.encode("utf-8")
        if len(encoded) > backup_max_bytes:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"Backup exceeds max size of {backup_max_bytes} bytes",
                    }
                ),
                413,
            )

        try:
            file_path = _resolve_backup_path(filename_raw)
        except ValueError as exc:
            return jsonify({"success": False, "error": "Invalid backup file parameter."}), 400

        try:
            file_path.write_text(content, encoding="utf-8")
            return jsonify(
                {
                    "success": True,
                    "filename": file_path.name,
                    "size": len(encoded),
                    "modified": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                }
            )
        except Exception as exc:
            logger.exception("Failed to save backup file")
            return jsonify({"success": False, "error": "Failed to save backup file."}), 500

    @bp.route("/list", methods=["GET"])
    @require_api_key
    @limiter.limit("120 per hour")
    def api_backup_list():
        try:
            _ensure_backup_storage_dir()
            entries = []
            for file_path in backup_storage_dir.iterdir():
                if not file_path.is_file():
                    continue
                if not _is_allowed_backup_extension(file_path.name):
                    continue
                entries.append(_backup_file_info(file_path))

            entries.sort(key=lambda item: item["modified"], reverse=True)
            return jsonify(entries[:backup_max_files])
        except Exception as exc:
            logger.exception("Failed to list backup files")
            return jsonify({"success": False, "error": "Failed to list backup files."}), 500

    @bp.route("/read", methods=["GET"])
    @require_api_key
    @limiter.limit("120 per hour")
    def api_backup_read():
        filename_raw = str(request.args.get("file") or "").strip()
        if not filename_raw:
            return jsonify({"success": False, "error": "Missing file query parameter"}), 400

        try:
            file_path = _resolve_backup_path(filename_raw)
        except ValueError as exc:
            return jsonify({"success": False, "error": "Invalid backup file parameter."}), 400

        if not file_path.exists() or not file_path.is_file():
            return jsonify({"success": False, "error": "Backup file not found"}), 404

        try:
            content = file_path.read_text(encoding="utf-8")
            return Response(content, mimetype="text/yaml; charset=utf-8")
        except Exception as exc:
            logger.exception("Failed to read backup file")
            return jsonify({"success": False, "error": "Failed to read backup file."}), 500

    @bp.route("/delete", methods=["DELETE"])
    @require_api_key
    @limiter.limit("60 per hour")
    def api_backup_delete():
        filename_raw = str(request.args.get("file") or "").strip()
        if not filename_raw:
            return jsonify({"success": False, "error": "Missing file query parameter"}), 400

        try:
            file_path = _resolve_backup_path(filename_raw)
        except ValueError as exc:
            return jsonify({"success": False, "error": "Invalid backup file parameter."}), 400

        if not file_path.exists() or not file_path.is_file():
            return jsonify({"success": False, "error": "Backup file not found"}), 404

        try:
            file_path.unlink()
            return jsonify({"success": True, "filename": file_path.name})
        except Exception as exc:
            logger.exception("Failed to delete backup file")
            return jsonify({"success": False, "error": "Failed to delete backup file."}), 500

    return bp

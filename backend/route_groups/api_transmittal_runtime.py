from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, List, Optional, Tuple


@dataclass(frozen=True)
class TransmittalRuntime:
    parse_json_field: Callable[[str, Any], Any]
    save_upload: Callable[[Any, str, Optional[str]], str]
    schedule_cleanup: Callable[[str], None]
    convert_docx_to_pdf: Callable[[str, str], Tuple[Optional[str], str]]


def create_transmittal_runtime(
    *,
    request_obj: Any,
    json_module: Any,
    secure_filename_fn: Callable[[str], str],
    os_module: Any,
    shutil_module: Any,
    subprocess_module: Any,
    path_cls: Any,
    after_this_request_fn: Callable[[Callable[..., Any]], Callable[..., Any]],
    logger: Any,
    docx2pdf_convert_fn: Optional[Callable[[str, str], None]] = None,
) -> TransmittalRuntime:
    def parse_json_field(name: str, default: Any):
        raw = request_obj.form.get(name)
        if not raw:
            return default
        try:
            return json_module.loads(raw)
        except Exception:
            return default

    def save_upload(file_storage, dest_dir: str, filename: Optional[str] = None) -> str:
        if file_storage is None:
            raise ValueError("Missing file upload")
        safe_name = secure_filename_fn(filename or file_storage.filename or "upload")
        if not safe_name:
            safe_name = "upload"
        path = os_module.path.join(dest_dir, safe_name)
        file_storage.save(path)
        return path

    def schedule_cleanup(path: str) -> None:
        """Ensure temporary directories are removed after the response is sent."""
        if not path:
            return

        @after_this_request_fn
        def _cleanup(response):
            try:
                shutil_module.rmtree(path, ignore_errors=True)
            except Exception as exc:
                logger.warning("Failed to cleanup temp dir %s: %s", path, exc)
            return response

    def convert_docx_to_pdf(docx_path: str, output_dir: str) -> Tuple[Optional[str], str]:
        """Convert a DOCX file to PDF. Returns (pdf_path, error_message)."""
        errors: List[str] = []

        try:
            convert = docx2pdf_convert_fn
            if convert is None:
                from docx2pdf import convert as imported_convert  # type: ignore

                convert = imported_convert
            convert(docx_path, output_dir)
            pdf_path = os_module.path.join(output_dir, f"{path_cls(docx_path).stem}.pdf")
            if os_module.path.exists(pdf_path):
                return pdf_path, ""
            errors.append("docx2pdf did not produce a PDF file.")
        except Exception as exc:
            errors.append(f"docx2pdf failed: {exc}")

        for cmd in ("soffice", "libreoffice"):
            exe = shutil_module.which(cmd)
            if not exe:
                continue
            try:
                result = subprocess_module.run(
                    [
                        exe,
                        "--headless",
                        "--convert-to",
                        "pdf",
                        "--outdir",
                        output_dir,
                        docx_path,
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode == 0:
                    pdf_path = os_module.path.join(output_dir, f"{path_cls(docx_path).stem}.pdf")
                    if os_module.path.exists(pdf_path):
                        return pdf_path, ""
                errors.append(
                    f"{cmd} conversion failed: {(result.stderr or result.stdout).strip()}"
                )
            except Exception as exc:
                errors.append(f"{cmd} conversion error: {exc}")

        return None, "; ".join([err for err in errors if err]) or "No PDF converter available."

    return TransmittalRuntime(
        parse_json_field=parse_json_field,
        save_upload=save_upload,
        schedule_cleanup=schedule_cleanup,
        convert_docx_to_pdf=convert_docx_to_pdf,
    )

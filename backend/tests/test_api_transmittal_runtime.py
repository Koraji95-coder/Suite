from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from backend.route_groups.api_transmittal_runtime import create_transmittal_runtime


class _RequestStub:
    def __init__(self) -> None:
        self.form = {}


class _AfterThisRequestRecorder:
    def __init__(self) -> None:
        self.callbacks = []

    def __call__(self, callback):
        self.callbacks.append(callback)
        return callback


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message, *args) -> None:
        self.warnings.append((message, args))


class _FileStorageStub:
    def __init__(self, filename: str = "upload.txt") -> None:
        self.filename = filename
        self.saved_path = ""

    def save(self, path: str) -> None:
        self.saved_path = path
        with open(path, "w", encoding="utf-8") as handle:
            handle.write("content")


class _ShutilNoConverters:
    def __init__(self) -> None:
        self.removed_paths = []

    def which(self, _name: str):
        return None

    def rmtree(self, path: str, ignore_errors: bool = False) -> None:
        self.removed_paths.append((path, ignore_errors))
        shutil.rmtree(path, ignore_errors=ignore_errors)


def _build_runtime(
    *,
    request_obj: _RequestStub,
    after_this_request_recorder: _AfterThisRequestRecorder,
    logger: _LoggerStub,
    shutil_module=shutil,
    subprocess_module=None,
    docx2pdf_convert_fn=None,
):
    import subprocess as real_subprocess

    return create_transmittal_runtime(
        request_obj=request_obj,
        json_module=json,
        secure_filename_fn=lambda value: value.replace(" ", "_"),
        os_module=os,
        shutil_module=shutil_module,
        subprocess_module=subprocess_module or real_subprocess,
        path_cls=Path,
        after_this_request_fn=after_this_request_recorder,
        logger=logger,
        docx2pdf_convert_fn=docx2pdf_convert_fn,
    )


class TestApiTransmittalRuntime(unittest.TestCase):
    def test_parse_json_field(self) -> None:
        request_obj = _RequestStub()
        request_obj.form = {
            "valid": '{"a": 1}',
            "invalid": "{bad json",
        }
        runtime = _build_runtime(
            request_obj=request_obj,
            after_this_request_recorder=_AfterThisRequestRecorder(),
            logger=_LoggerStub(),
        )
        self.assertEqual(runtime.parse_json_field("valid", {}), {"a": 1})
        self.assertEqual(runtime.parse_json_field("invalid", {"x": 2}), {"x": 2})
        self.assertEqual(runtime.parse_json_field("missing", []), [])

    def test_save_upload(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime = _build_runtime(
                request_obj=_RequestStub(),
                after_this_request_recorder=_AfterThisRequestRecorder(),
                logger=_LoggerStub(),
            )
            file_storage = _FileStorageStub("my file.txt")
            saved_path = runtime.save_upload(file_storage, temp_dir, None)
            self.assertTrue(saved_path.endswith("my_file.txt"))
            self.assertTrue(os.path.exists(saved_path))
            self.assertEqual(file_storage.saved_path, saved_path)

    def test_save_upload_missing_file_raises(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            after_this_request_recorder=_AfterThisRequestRecorder(),
            logger=_LoggerStub(),
        )
        with self.assertRaises(ValueError):
            runtime.save_upload(None, "/tmp", None)

    def test_schedule_cleanup_registers_callback(self) -> None:
        recorder = _AfterThisRequestRecorder()
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            after_this_request_recorder=recorder,
            logger=_LoggerStub(),
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            nested_path = os.path.join(temp_dir, "work")
            os.mkdir(nested_path)
            with open(os.path.join(nested_path, "file.txt"), "w", encoding="utf-8") as handle:
                handle.write("x")

            runtime.schedule_cleanup(nested_path)
            self.assertEqual(len(recorder.callbacks), 1)

            callback = recorder.callbacks[0]
            response = object()
            returned = callback(response)
            self.assertIs(returned, response)
            self.assertFalse(os.path.exists(nested_path))

    def test_convert_docx_to_pdf_success_with_docx2pdf(self) -> None:
        def convert(docx_path: str, output_dir: str) -> None:
            target = os.path.join(output_dir, f"{Path(docx_path).stem}.pdf")
            with open(target, "w", encoding="utf-8") as handle:
                handle.write("pdf")

        runtime = _build_runtime(
            request_obj=_RequestStub(),
            after_this_request_recorder=_AfterThisRequestRecorder(),
            logger=_LoggerStub(),
            docx2pdf_convert_fn=convert,
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = os.path.join(temp_dir, "test.docx")
            with open(docx_path, "w", encoding="utf-8") as handle:
                handle.write("docx")
            pdf_path, error = runtime.convert_docx_to_pdf(docx_path, temp_dir)
            self.assertTrue(pdf_path is not None and pdf_path.endswith("test.pdf"))
            self.assertEqual(error, "")

    def test_convert_docx_to_pdf_reports_no_converter(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            after_this_request_recorder=_AfterThisRequestRecorder(),
            logger=_LoggerStub(),
            shutil_module=_ShutilNoConverters(),
            docx2pdf_convert_fn=lambda *_args, **_kwargs: (_ for _ in ()).throw(
                RuntimeError("boom")
            ),
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = os.path.join(temp_dir, "test.docx")
            with open(docx_path, "w", encoding="utf-8") as handle:
                handle.write("docx")
            pdf_path, error = runtime.convert_docx_to_pdf(docx_path, temp_dir)
            self.assertIsNone(pdf_path)
            self.assertIn("docx2pdf failed: boom", error)


if __name__ == "__main__":
    unittest.main()

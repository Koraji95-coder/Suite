from __future__ import annotations

import ntpath
import os
import posixpath
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Iterable


def is_windows_absolute_path(path_value: str) -> bool:
    text = str(path_value or "").strip()
    return bool(text) and PureWindowsPath(text).is_absolute()


def is_posix_absolute_path(path_value: str) -> bool:
    text = str(path_value or "").strip()
    return bool(text) and PurePosixPath(text).is_absolute()


def is_absolute_path_value(path_value: str) -> bool:
    return is_windows_absolute_path(path_value) or is_posix_absolute_path(path_value)


def normalize_runtime_path(path_value: str) -> str:
    text = str(path_value or "").strip()
    if not text:
        return ""
    if is_windows_absolute_path(text):
        direct_candidate = Path(text).expanduser()
        try:
            if direct_candidate.is_absolute():
                normalized = str(direct_candidate.resolve(strict=False))
                return ntpath.normcase(ntpath.normpath(normalized))
        except Exception:
            pass
        normalized = ntpath.normpath(text.replace("/", "\\"))
        return ntpath.normcase(normalized)
    if is_posix_absolute_path(text):
        direct_candidate = Path(text).expanduser()
        try:
            if direct_candidate.is_absolute():
                return posixpath.normpath(str(direct_candidate.resolve(strict=False)))
        except Exception:
            pass
        return posixpath.normpath(text.replace("\\", "/"))
    return text.replace("\\", "/")


def _runtime_repo_root(repo_root: str | os.PathLike[str] | None = None) -> Path:
    if repo_root is not None:
        return Path(repo_root).resolve()
    configured = str(os.environ.get("SUITE_RUNTIME_REPO_ROOT") or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


def _host_path_suffix_parts(path_value: str) -> list[str]:
    text = str(path_value or "").strip()
    if not text:
        return []
    pure_path = PureWindowsPath(text) if is_windows_absolute_path(text) else PurePosixPath(text)
    return [
        part
        for part in pure_path.parts
        if part not in {pure_path.anchor, "\\", "/"}
    ]


def resolve_runtime_path(
    path_value: str,
    *,
    repo_root: str | os.PathLike[str] | None = None,
) -> Path | None:
    text = str(path_value or "").strip()
    if not text or not is_absolute_path_value(text):
        return None

    direct_candidate = Path(text).expanduser()
    try:
        if direct_candidate.is_absolute() and direct_candidate.exists():
            return direct_candidate.resolve()
    except Exception:
        pass

    runtime_repo_root = _runtime_repo_root(repo_root)
    suffix_parts = _host_path_suffix_parts(text)
    for start_index in range(len(suffix_parts)):
        candidate = runtime_repo_root.joinpath(*suffix_parts[start_index:])
        try:
            if candidate.exists():
                return candidate.resolve()
        except Exception:
            continue
    return None


def resolve_runtime_directory(
    path_value: str,
    *,
    repo_root: str | os.PathLike[str] | None = None,
) -> Path | None:
    candidate = resolve_runtime_path(path_value, repo_root=repo_root)
    if candidate is None:
        return None
    try:
        return candidate if candidate.is_dir() else None
    except Exception:
        return None


def join_under_absolute_root(base_root: str, relative_parts: Iterable[str]) -> str:
    text = str(base_root or "").strip()
    parts = [str(part) for part in relative_parts if str(part)]
    if is_windows_absolute_path(text):
        return str(PureWindowsPath(text).joinpath(*parts))
    if is_posix_absolute_path(text):
        return str(PurePosixPath(text).joinpath(*parts))
    return text

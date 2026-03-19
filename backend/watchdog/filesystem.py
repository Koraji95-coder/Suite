from __future__ import annotations

import fnmatch
import os
import time
from pathlib import Path
from typing import Any, Dict, Mapping, Tuple


def normalize_path(path_value: str) -> str:
    resolved = Path(path_value).expanduser().resolve(strict=False)
    return os.path.normcase(os.path.normpath(str(resolved)))


def relative_posix(path_value: str, root_value: str) -> str:
    try:
        rel = os.path.relpath(path_value, root_value)
    except Exception:
        rel = path_value
    return rel.replace("\\", "/")


def matches_any(patterns: list[str], rel_path: str, name: str) -> bool:
    rel = rel_path.lower()
    filename = name.lower()
    for pattern in patterns:
        normalized = pattern.replace("\\", "/").lower()
        if fnmatch.fnmatch(rel, normalized):
            return True
        if fnmatch.fnmatch(filename, normalized):
            return True
    return False


def is_included(
    *,
    rel_path: str,
    name: str,
    include_globs: list[str],
    exclude_globs: list[str],
) -> bool:
    if include_globs and not matches_any(include_globs, rel_path, name):
        return False
    if exclude_globs and matches_any(exclude_globs, rel_path, name):
        return False
    return True


def scan_snapshot(
    *,
    roots: list[str],
    include_globs: list[str],
    exclude_globs: list[str],
    exclude_paths: set[str] | None = None,
    time_module: Any = time,
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    perf_counter = getattr(time_module, "perf_counter", time.perf_counter)
    started = perf_counter()
    warnings: list[str] = []
    files_scanned = 0
    folders_scanned = 0
    snapshot: Dict[str, Dict[str, Any]] = {}
    normalized_exclude_paths = {
        normalize_path(path_value)
        for path_value in (exclude_paths or set())
        if str(path_value or "").strip()
    }

    for root in roots:
        if not os.path.isdir(root):
            warnings.append(f"Root unavailable during scan: {root}")
            continue

        stack = [root]
        while stack:
            current_dir = stack.pop()
            folders_scanned += 1
            try:
                with os.scandir(current_dir) as entries:
                    for entry in entries:
                        try:
                            if entry.is_dir(follow_symlinks=False):
                                stack.append(entry.path)
                                continue
                            if not entry.is_file(follow_symlinks=False):
                                continue

                            absolute_path = str(Path(entry.path).expanduser().resolve(strict=False))
                            normalized_key = normalize_path(absolute_path)
                            if normalized_key in normalized_exclude_paths:
                                continue

                            files_scanned += 1

                            rel_path = relative_posix(absolute_path, root)
                            if not is_included(
                                rel_path=rel_path,
                                name=entry.name,
                                include_globs=include_globs,
                                exclude_globs=exclude_globs,
                            ):
                                continue

                            try:
                                stat = entry.stat(follow_symlinks=False)
                            except Exception as exc:
                                warnings.append(f"Failed to stat file '{entry.path}': {exc}")
                                continue

                            snapshot[normalized_key] = {
                                "root": root,
                                "path": absolute_path,
                                "relativePath": rel_path,
                                "sizeBytes": int(stat.st_size),
                                "mtimeMs": int(stat.st_mtime * 1000),
                            }
                        except Exception as exc:
                            warnings.append(f"Failed to inspect entry in '{current_dir}': {exc}")
            except Exception as exc:
                warnings.append(f"Failed to scan directory '{current_dir}': {exc}")

    scan_ms = int((perf_counter() - started) * 1000)
    scan_meta = {
        "scanMs": max(0, scan_ms),
        "filesScanned": files_scanned,
        "foldersScanned": folders_scanned,
        "truncated": False,
        "warnings": warnings,
        "lastHeartbeatAt": int(time_module.time() * 1000),
    }
    return snapshot, scan_meta


def build_snapshot_events(
    *,
    old_snapshot: Mapping[str, Dict[str, Any]],
    new_snapshot: Mapping[str, Dict[str, Any]],
    timestamp_ms: int,
) -> list[Dict[str, Any]]:
    events: list[Dict[str, Any]] = []

    old_keys = set(old_snapshot.keys())
    new_keys = set(new_snapshot.keys())

    for path_key in sorted(new_keys - old_keys):
        current = new_snapshot[path_key]
        events.append(
            {
                "type": "added",
                "root": current.get("root"),
                "path": current.get("path"),
                "relativePath": current.get("relativePath"),
                "timestamp": timestamp_ms,
                "sizeBytes": current.get("sizeBytes"),
                "mtimeMs": current.get("mtimeMs"),
            }
        )

    for path_key in sorted(old_keys - new_keys):
        previous = old_snapshot[path_key]
        events.append(
            {
                "type": "removed",
                "root": previous.get("root"),
                "path": previous.get("path"),
                "relativePath": previous.get("relativePath"),
                "timestamp": timestamp_ms,
                "sizeBytes": previous.get("sizeBytes"),
                "mtimeMs": previous.get("mtimeMs"),
            }
        )

    for path_key in sorted(old_keys & new_keys):
        previous = old_snapshot[path_key]
        current = new_snapshot[path_key]
        if (
            int(previous.get("sizeBytes") or 0) != int(current.get("sizeBytes") or 0)
            or int(previous.get("mtimeMs") or 0) != int(current.get("mtimeMs") or 0)
        ):
            events.append(
                {
                    "type": "modified",
                    "root": current.get("root"),
                    "path": current.get("path"),
                    "relativePath": current.get("relativePath"),
                    "timestamp": timestamp_ms,
                    "sizeBytes": current.get("sizeBytes"),
                    "mtimeMs": current.get("mtimeMs"),
                }
            )

    return events


def ensure_absolute_roots(raw_roots: list[str], *, allow_missing: bool) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw_root in raw_roots:
        root_value = str(raw_root or "").strip()
        if not root_value:
            continue
        root_path = Path(root_value).expanduser()
        if not root_path.is_absolute():
            raise ValueError(f"Root path must be absolute: {root_value}")

        normalized = str(root_path.resolve(strict=False))
        if not allow_missing and not os.path.isdir(normalized):
            raise ValueError(f"Root path does not exist or is not a directory: {root_value}")

        dedupe_key = normalize_path(normalized)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        out.append(normalized)
    return out

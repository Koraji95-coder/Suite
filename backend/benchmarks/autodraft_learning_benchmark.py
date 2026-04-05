from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from backend.route_groups.api_autodraft import (
    _REVIEWED_RUN_SCHEMA,
    _build_feedback_learning_examples,
    _normalize_feedback_items,
    _persist_feedback_items,
    _resolve_compare_feedback_db_path,
)
from backend.route_groups.api_local_learning_runtime import (
    LocalLearningRuntime,
    get_local_learning_runtime,
)


def _safe_json_loads(raw: str) -> Any:
    try:
        return json.loads(raw)
    except Exception as exc:  # pragma: no cover - surfaced by caller context
        raise ValueError(f"Failed to parse JSON: {exc}") from exc


def _expand_input_paths(inputs: Sequence[Path | str]) -> List[Path]:
    resolved: List[Path] = []
    seen: set[Path] = set()
    for entry in inputs:
        raw = str(entry)
        if any(token in raw for token in ("*", "?", "[")):
            for match in sorted(glob.glob(raw, recursive=True)):
                path = Path(match).resolve()
                if path not in seen:
                    seen.add(path)
                    resolved.append(path)
            continue

        path = Path(raw).resolve()
        if path.is_dir():
            for match in sorted(path.rglob("*.json")):
                resolved_match = match.resolve()
                if resolved_match not in seen:
                    seen.add(resolved_match)
                    resolved.append(resolved_match)
            continue

        if path not in seen:
            seen.add(path)
            resolved.append(path)
    return resolved


def _coerce_bundle_entries(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        schema = str(payload.get("schema") or "").strip()
        if schema == _REVIEWED_RUN_SCHEMA:
            return [dict(payload)]
        runs = payload.get("runs")
        if isinstance(runs, list):
            return [dict(entry) for entry in runs if isinstance(entry, dict)]
    if isinstance(payload, list):
        return [dict(entry) for entry in payload if isinstance(entry, dict)]
    return []


def load_reviewed_run_bundles(inputs: Sequence[Path | str]) -> List[Dict[str, Any]]:
    bundles: List[Dict[str, Any]] = []
    for path in _expand_input_paths(inputs):
        if not path.is_file():
            raise ValueError(f"Reviewed-run input does not exist: {path}")
        payload = _safe_json_loads(path.read_text(encoding="utf-8"))
        entries = _coerce_bundle_entries(payload)
        if not entries:
            raise ValueError(f"File does not contain reviewed-run bundle entries: {path}")
        for entry in entries:
            if str(entry.get("schema") or "").strip() != _REVIEWED_RUN_SCHEMA:
                raise ValueError(f"Unsupported reviewed-run schema in {path}: {entry.get('schema')}")
            entry["_source_path"] = str(path)
            bundles.append(entry)
    return bundles


def _feedback_items_from_bundle(bundle: Dict[str, Any]) -> List[Dict[str, Any]]:
    feedback = bundle.get("feedback") if isinstance(bundle.get("feedback"), dict) else {}
    items = feedback.get("items") if isinstance(feedback.get("items"), list) else []
    raw_items: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        payload = dict(item.get("payload") or {}) if isinstance(item.get("payload"), dict) else {}
        merged = dict(payload) if payload else dict(item)
        for key in (
            "feedback_type",
            "request_id",
            "action_id",
            "review_status",
            "new_text",
            "selected_old_text",
            "selected_entity_id",
            "confidence",
            "note",
            "candidates",
            "selected_candidate",
        ):
            if key not in merged and key in item:
                merged[key] = item.get(key)
        raw_items.append(merged)
    return _normalize_feedback_items({"items": raw_items})


def _learning_examples_from_bundle(bundle: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    learning_examples = (
        bundle.get("learning_examples")
        if isinstance(bundle.get("learning_examples"), dict)
        else {}
    )
    normalized: Dict[str, List[Dict[str, Any]]] = {}
    for domain, examples in learning_examples.items():
        if not isinstance(examples, list):
            continue
        normalized[domain] = [dict(entry) for entry in examples if isinstance(entry, dict)]
    if normalized:
        return normalized
    feedback_items = _feedback_items_from_bundle(bundle)
    return _build_feedback_learning_examples(items=feedback_items)


def import_reviewed_run_bundles(
    *,
    bundles: Sequence[Dict[str, Any]],
    runtime: Optional[LocalLearningRuntime] = None,
    feedback_db_path: Optional[str] = None,
    force: bool = False,
) -> Dict[str, Any]:
    learning_runtime = runtime or get_local_learning_runtime()
    compare_feedback_db_path = feedback_db_path or _resolve_compare_feedback_db_path()
    results: List[Dict[str, Any]] = []
    skipped_count = 0
    imported_count = 0

    for bundle in bundles:
        bundle_id = str(bundle.get("bundle_id") or "").strip()
        request_id = str(bundle.get("request_id") or "").strip()
        source_path = str(bundle.get("_source_path") or "").strip()
        if bundle_id and learning_runtime.has_imported_bundle(bundle_id) and not force:
            skipped_count += 1
            results.append(
                {
                    "ok": True,
                    "skipped": True,
                    "bundle_id": bundle_id,
                    "request_id": request_id,
                    "source_path": source_path,
                    "message": "Reviewed run bundle already imported.",
                }
            )
            continue

        feedback_items = _feedback_items_from_bundle(bundle)
        learning_examples = _learning_examples_from_bundle(bundle)
        stored_feedback = (
            _persist_feedback_items(
                db_path=compare_feedback_db_path,
                items=feedback_items,
            )
            if feedback_items
            else 0
        )
        learning_counts: Dict[str, int] = {}
        for domain, examples in learning_examples.items():
            if not examples:
                continue
            learning_counts[domain] = learning_runtime.record_examples(
                domain=domain,
                examples=examples,
            )

        imported_count += 1
        summary = {
            "request_id": request_id,
            "source_path": source_path,
            "feedback_item_count": len(feedback_items),
            "learning_counts": learning_counts,
        }
        if bundle_id:
            learning_runtime.record_imported_bundle(
                bundle_id=bundle_id,
                summary=summary,
            )
        results.append(
            {
                "ok": True,
                "skipped": False,
                "bundle_id": bundle_id,
                "request_id": request_id,
                "source_path": source_path,
                "stored_feedback": stored_feedback,
                "learning_counts": learning_counts,
            }
        )

    return {
        "kind": "reviewed_run_import",
        "bundleCount": len(bundles),
        "importedCount": imported_count,
        "skippedCount": skipped_count,
        "results": results,
    }


def benchmark_reviewed_run_bundles(
    *,
    bundles: Sequence[Dict[str, Any]],
    runtime: Optional[LocalLearningRuntime] = None,
) -> Dict[str, Any]:
    learning_runtime = runtime or get_local_learning_runtime()
    examples_by_domain: Dict[str, List[Dict[str, Any]]] = {}
    for bundle in bundles:
        learning_examples = _learning_examples_from_bundle(bundle)
        for domain, examples in learning_examples.items():
            if not examples:
                continue
            examples_by_domain.setdefault(domain, []).extend(examples)

    results: List[Dict[str, Any]] = []
    for domain in sorted(examples_by_domain.keys()):
        results.append(
            learning_runtime.benchmark_examples(
                domain=domain,
                examples=examples_by_domain[domain],
            )
        )

    return {
        "kind": "reviewed_run_benchmark",
        "bundleCount": len(bundles),
        "domainCount": len(results),
        "exampleCounts": {
            domain: len(examples)
            for domain, examples in sorted(examples_by_domain.items())
        },
        "results": results,
    }


def _write_report(report: Dict[str, Any], output: Optional[Path]) -> None:
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if output is None:
        print(rendered)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered + "\n", encoding="utf-8")
    print(f"Wrote report to {output}")


def _build_runtime(base_dir: Optional[str]) -> LocalLearningRuntime:
    if base_dir:
        return LocalLearningRuntime(base_dir=Path(base_dir))
    return get_local_learning_runtime()


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Offline import and benchmark tools for AutoDraft reviewed-run bundles.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    import_parser = subparsers.add_parser(
        "import",
        help="Import reviewed-run bundles into local feedback/learning stores.",
    )
    import_parser.add_argument("inputs", nargs="+", help="Reviewed-run JSON files, globs, or directories.")
    import_parser.add_argument("--learning-dir", default=None, help="Override local learning runtime directory.")
    import_parser.add_argument("--feedback-db", default=None, help="Override AutoDraft compare feedback database path.")
    import_parser.add_argument("--force", action="store_true", help="Import bundles even if they were imported before.")
    import_parser.add_argument("--output", default=None, help="Optional output report JSON path.")

    benchmark_parser = subparsers.add_parser(
        "benchmark",
        help="Benchmark active AutoDraft learning models against reviewed-run bundles.",
    )
    benchmark_parser.add_argument("inputs", nargs="+", help="Reviewed-run JSON files, globs, or directories.")
    benchmark_parser.add_argument("--learning-dir", default=None, help="Override local learning runtime directory.")
    benchmark_parser.add_argument("--output", default=None, help="Optional output report JSON path.")

    args = parser.parse_args(list(argv) if argv is not None else None)
    bundles = load_reviewed_run_bundles(args.inputs)
    runtime = _build_runtime(getattr(args, "learning_dir", None))

    if args.command == "import":
        report = import_reviewed_run_bundles(
            bundles=bundles,
            runtime=runtime,
            feedback_db_path=getattr(args, "feedback_db", None),
            force=bool(getattr(args, "force", False)),
        )
    else:
        report = benchmark_reviewed_run_bundles(
            bundles=bundles,
            runtime=runtime,
        )

    _write_report(report, Path(args.output).resolve() if args.output else None)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

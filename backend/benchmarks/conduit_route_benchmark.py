from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from backend.route_groups.api_autocad_terminal_scan import scan_terminal_strips
from backend.route_groups.api_conduit_route_compute import compute_conduit_route
from backend.route_groups.api_conduit_route_obstacle_scan import scan_conduit_obstacles

OBSTACLE_TYPES = ["foundation", "building", "equipment_pad", "trench", "fence", "road"]


class _Collection:
    def __init__(self, items: Sequence[Any]) -> None:
        self._items = list(items)

    @property
    def Count(self) -> int:
        return len(self._items)

    def Item(self, index: int) -> Any:
        return self._items[index]


class _Doc:
    def __init__(self, *, name: str, units: int, pickfirst: Sequence[Any], active: Sequence[Any]) -> None:
        self.Name = name
        self._units = units
        self.PickfirstSelectionSet = _Collection(pickfirst)
        self.ActiveSelectionSet = _Collection(active)

    def GetVariable(self, name: str) -> Any:
        if str(name).upper() == "INSUNITS":
            return self._units
        return 0


class _ObstacleEntity:
    def __init__(
        self,
        *,
        handle: str,
        layer: str,
        object_name: str,
        bbox: Tuple[float, float, float, float, float, float],
    ) -> None:
        self.Handle = handle
        self.Layer = layer
        self.ObjectName = object_name
        self._bbox = bbox


class _TerminalAttribute:
    def __init__(self, tag: str, value: str) -> None:
        self.TagString = tag
        self.TextString = value


class _TerminalBlockEntity:
    ObjectName = "AcDbBlockReference"

    def __init__(
        self,
        *,
        handle: str,
        name: str,
        insertion: Tuple[float, float, float],
        attrs: Dict[str, str],
    ) -> None:
        self.Handle = handle
        self.Name = name
        self.EffectiveName = name
        self.InsertionPoint = insertion
        self._attrs = [_TerminalAttribute(tag, value) for tag, value in attrs.items()]

    def GetAttributes(self) -> List[_TerminalAttribute]:
        return self._attrs


class _LineEntity:
    ObjectName = "AcDbLine"

    def __init__(self, *, handle: str) -> None:
        self.Handle = handle


@dataclass
class _OperationStats:
    name: str
    iterations: int
    duration_ms: List[float]
    completed_count: int
    success_true_count: int
    failure_count: int
    sample_meta: Dict[str, Any]
    sample_code: str
    sample_message: str


def parse_entity_counts(raw: str) -> List[int]:
    parts = [part.strip() for part in str(raw or "").split(",")]
    counts: List[int] = []
    for part in parts:
        if not part:
            continue
        try:
            value = int(part)
        except Exception as exc:
            raise ValueError(f"Invalid entity count '{part}': {exc}") from exc
        if value <= 0:
            raise ValueError(f"Entity count must be positive: {value}")
        counts.append(value)
    if not counts:
        raise ValueError("At least one entity count is required.")
    return counts


def _percentile(sorted_values: Sequence[float], percentile: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    percentile = max(0.0, min(100.0, float(percentile)))
    rank = (percentile / 100.0) * (len(sorted_values) - 1)
    low = int(rank)
    high = min(low + 1, len(sorted_values) - 1)
    if low == high:
        return float(sorted_values[low])
    fraction = rank - low
    return (float(sorted_values[low]) * (1.0 - fraction)) + (
        float(sorted_values[high]) * fraction
    )


def _summarize_durations(values: Sequence[float]) -> Dict[str, float]:
    if not values:
        return {
            "minMs": 0.0,
            "maxMs": 0.0,
            "meanMs": 0.0,
            "p50Ms": 0.0,
            "p95Ms": 0.0,
            "p99Ms": 0.0,
        }
    sorted_values = sorted(float(value) for value in values)
    return {
        "minMs": float(sorted_values[0]),
        "maxMs": float(sorted_values[-1]),
        "meanMs": float(statistics.fmean(sorted_values)),
        "p50Ms": float(_percentile(sorted_values, 50)),
        "p95Ms": float(_percentile(sorted_values, 95)),
        "p99Ms": float(_percentile(sorted_values, 99)),
    }


def _run_timed_operation(
    *,
    name: str,
    fn: Callable[[], Dict[str, Any]],
    iterations: int,
    warmup: int = 1,
) -> _OperationStats:
    for _ in range(max(0, int(warmup))):
        fn()

    duration_ms: List[float] = []
    completed_count = 0
    success_true_count = 0
    failure_count = 0
    sample_meta: Dict[str, Any] = {}
    sample_code = ""
    sample_message = ""

    for _ in range(max(1, int(iterations))):
        started = time.perf_counter_ns()
        result: Dict[str, Any] = {}
        try:
            result = fn()
            completed_count += 1
            if bool(result.get("success")):
                success_true_count += 1
            sample_meta = result.get("meta", {}) if isinstance(result.get("meta"), dict) else {}
            sample_code = str(result.get("code") or "")
            sample_message = str(result.get("message") or "")
        except Exception as exc:
            failure_count += 1
            sample_code = "EXCEPTION"
            sample_message = str(exc)
        finally:
            ended = time.perf_counter_ns()
            duration_ms.append((ended - started) / 1_000_000.0)

    return _OperationStats(
        name=name,
        iterations=max(1, int(iterations)),
        duration_ms=duration_ms,
        completed_count=completed_count,
        success_true_count=success_true_count,
        failure_count=failure_count,
        sample_meta=sample_meta,
        sample_code=sample_code,
        sample_message=sample_message,
    )


def _generate_obstacle_entities(entity_count: int, rng: random.Random) -> List[_ObstacleEntity]:
    layers = [
        "S-FNDN-PRIMARY",
        "S-CONC-PAD",
        "E-TRENCH",
        "C-ROAD",
        "S-FENCE",
        "A-BLDG",
        "MISC",
        "A-ANNO-TEXT",
    ]
    object_names = [
        "AcDbPolyline",
        "AcDbPolyline",
        "AcDbLine",
        "AcDbBlockReference",
        "AcDbText",
        "AcDbMText",
    ]

    entities: List[_ObstacleEntity] = []
    for idx in range(max(1, int(entity_count))):
        layer = layers[idx % len(layers)]
        object_name = object_names[idx % len(object_names)]
        min_x = rng.uniform(0.0, 850.0)
        min_y = rng.uniform(0.0, 450.0)
        width = rng.uniform(6.0, 90.0)
        height = rng.uniform(6.0, 90.0)
        bbox = (min_x, min_y, 0.0, min_x + width, min_y + height, 0.0)
        entities.append(
            _ObstacleEntity(
                handle=f"OBS-{idx+1}",
                layer=layer,
                object_name=object_name,
                bbox=bbox,
            )
        )
    return entities


def _generate_terminal_entities(entity_count: int, rng: random.Random) -> List[Any]:
    entities: List[Any] = []
    block_names = [
        "TERMINAL_STRIP_BLOCK",
        "TB_ROUTING",
        "TS_BLOCK",
        "GENERIC_BLOCK",
        "ANNOT_BLOCK",
    ]

    for idx in range(max(1, int(entity_count))):
        if idx % 3 == 0:
            panel_num = (idx % 18) + 1
            side = "L" if idx % 2 == 0 else "R"
            strip_num = (idx % 8) + 1
            attrs = {
                "PANEL_ID": f"RP{panel_num}",
                "PANEL_NAME": f"Relay Panel {panel_num}",
                "SIDE": side,
                "STRIP_ID": f"RP{panel_num}{side}{strip_num}",
                "TERMINAL_COUNT": str(8 + (idx % 20)),
            }
            block_name = block_names[idx % len(block_names)]
            insertion = (rng.uniform(0.0, 900.0), rng.uniform(0.0, 520.0), 0.0)
            entities.append(
                _TerminalBlockEntity(
                    handle=f"TBLK-{idx+1}",
                    name=block_name,
                    insertion=insertion,
                    attrs=attrs,
                )
            )
        else:
            entities.append(_LineEntity(handle=f"LINE-{idx+1}"))
    return entities


def _generate_route_obstacles(obstacle_count: int, rng: random.Random) -> List[Dict[str, Any]]:
    count = max(1, int(obstacle_count))
    obstacles: List[Dict[str, Any]] = []
    for idx in range(count):
        x = rng.uniform(5.0, 860.0)
        y = rng.uniform(5.0, 460.0)
        w = rng.uniform(8.0, 120.0)
        h = rng.uniform(8.0, 120.0)
        obstacles.append(
            {
                "id": f"RT-OBS-{idx+1}",
                "type": OBSTACLE_TYPES[idx % len(OBSTACLE_TYPES)],
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "label": f"OBS-{idx+1}",
            }
        )
    return obstacles


def _synthetic_obstacle_scan_operation(entity_count: int, seed: int) -> Callable[[], Dict[str, Any]]:
    entities = _generate_obstacle_entities(entity_count, random.Random(seed))
    doc = _Doc(name=f"synthetic_obstacles_{entity_count}.dwg", units=2, pickfirst=[], active=[])
    modelspace = _Collection(entities)

    def run() -> Dict[str, Any]:
        return scan_conduit_obstacles(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            entity_bbox_fn=lambda entity: entity._bbox,
            include_modelspace=True,
            selection_only=False,
            max_entities=entity_count,
            canvas_width=980.0,
            canvas_height=560.0,
            layer_names=[],
            layer_type_overrides={},
        )

    return run


def _synthetic_terminal_scan_operation(entity_count: int, seed: int) -> Callable[[], Dict[str, Any]]:
    entities = _generate_terminal_entities(entity_count, random.Random(seed))
    doc = _Doc(name=f"synthetic_terminals_{entity_count}.dwg", units=2, pickfirst=[], active=[])
    modelspace = _Collection(entities)

    def run() -> Dict[str, Any]:
        return scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=entity_count,
        )

    return run


def _synthetic_route_compute_operation(entity_count: int, seed: int) -> Callable[[], Dict[str, Any]]:
    rng = random.Random(seed)
    obstacle_count = max(15, min(4500, entity_count // 20))
    obstacles = _generate_route_obstacles(obstacle_count, rng)
    payload = {
        "start": {"x": 30.0, "y": 35.0},
        "end": {"x": 940.0, "y": 510.0},
        "mode": "plan_view",
        "clearance": 18,
        "canvasWidth": 980,
        "canvasHeight": 560,
        "gridStep": 8,
        "obstacles": obstacles,
    }

    def run() -> Dict[str, Any]:
        return compute_conduit_route(dict(payload))

    return run


def run_synthetic_suite(
    *,
    entity_counts: Sequence[int],
    iterations: int,
    seed: int,
    scenario: str = "all",
) -> Dict[str, Any]:
    allowed_scenarios = {"all", "obstacle_scan", "terminal_scan", "route_compute"}
    scenario_name = str(scenario or "all").strip().lower()
    if scenario_name not in allowed_scenarios:
        raise ValueError(f"Unsupported scenario: {scenario}")

    run_obstacle = scenario_name in {"all", "obstacle_scan"}
    run_terminal = scenario_name in {"all", "terminal_scan"}
    run_compute = scenario_name in {"all", "route_compute"}

    operation_stats: List[_OperationStats] = []
    for idx, entity_count in enumerate(entity_counts):
        base_seed = int(seed) + (idx * 1000)
        if run_obstacle:
            operation_stats.append(
                _run_timed_operation(
                    name=f"synthetic.obstacle_scan.entities_{entity_count}",
                    fn=_synthetic_obstacle_scan_operation(entity_count, base_seed + 1),
                    iterations=iterations,
                )
            )
        if run_terminal:
            operation_stats.append(
                _run_timed_operation(
                    name=f"synthetic.terminal_scan.entities_{entity_count}",
                    fn=_synthetic_terminal_scan_operation(entity_count, base_seed + 2),
                    iterations=iterations,
                )
            )
        if run_compute:
            operation_stats.append(
                _run_timed_operation(
                    name=f"synthetic.route_compute.entities_{entity_count}",
                    fn=_synthetic_route_compute_operation(entity_count, base_seed + 3),
                    iterations=iterations,
                )
            )

    return _build_report(
        suite_kind="synthetic",
        operation_stats=operation_stats,
        extra={
            "entityCounts": list(entity_counts),
            "iterations": int(iterations),
            "seed": int(seed),
            "scenario": scenario_name,
        },
    )


def _normalize_replay_entries(raw_data: Any, source: str) -> List[Dict[str, Any]]:
    if isinstance(raw_data, dict):
        if isinstance(raw_data.get("entries"), list):
            return [dict(entry) for entry in raw_data["entries"] if isinstance(entry, dict)]
        if "kind" in raw_data:
            return [dict(raw_data)]
        if "payload" in raw_data:
            return [{"kind": "compute", "payload": raw_data.get("payload"), "name": source}]
        return []
    if isinstance(raw_data, list):
        return [dict(entry) for entry in raw_data if isinstance(entry, dict)]
    return []


def load_replay_entries(snapshot_paths: Sequence[Path]) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for path in snapshot_paths:
        snapshot_path = Path(path)
        raw_text = snapshot_path.read_text(encoding="utf-8")
        raw_data = json.loads(raw_text)
        normalized = _normalize_replay_entries(raw_data, source=str(snapshot_path))
        for index, entry in enumerate(normalized):
            if "name" not in entry:
                entry["name"] = f"{snapshot_path.name}#{index+1}"
            if "kind" not in entry:
                entry["kind"] = "compute"
            entries.append(entry)
    return entries


def _replay_compute_operation(entry: Dict[str, Any]) -> Callable[[], Dict[str, Any]]:
    payload = entry.get("payload", entry)
    if not isinstance(payload, dict):
        raise ValueError("Replay compute entry requires an object payload.")

    def run() -> Dict[str, Any]:
        return compute_conduit_route(dict(payload))

    return run


def _build_obstacle_entities_from_replay(raw_entities: Any) -> List[_ObstacleEntity]:
    if not isinstance(raw_entities, list):
        raise ValueError("Replay obstacle_scan entry requires entities[] list.")
    entities: List[_ObstacleEntity] = []
    for idx, raw_entity in enumerate(raw_entities):
        if not isinstance(raw_entity, dict):
            continue
        bbox = raw_entity.get("bbox")
        if (
            not isinstance(bbox, (list, tuple))
            or len(bbox) != 6
        ):
            continue
        try:
            parsed_bbox = tuple(float(value) for value in bbox)
        except Exception:
            continue
        entities.append(
            _ObstacleEntity(
                handle=str(raw_entity.get("handle") or f"R-OBS-{idx+1}"),
                layer=str(raw_entity.get("layer") or "MISC"),
                object_name=str(raw_entity.get("objectName") or "AcDbPolyline"),
                bbox=parsed_bbox,  # type: ignore[arg-type]
            )
        )
    return entities


def _replay_obstacle_scan_operation(entry: Dict[str, Any]) -> Callable[[], Dict[str, Any]]:
    document = entry.get("document") if isinstance(entry.get("document"), dict) else {}
    request = entry.get("scanRequest") if isinstance(entry.get("scanRequest"), dict) else {}
    entities = _build_obstacle_entities_from_replay(entry.get("entities"))
    doc = _Doc(
        name=str(document.get("name") or "replay_obstacle_scan.dwg"),
        units=int(document.get("units") or 2),
        pickfirst=[],
        active=[],
    )
    modelspace = _Collection(entities)

    def run() -> Dict[str, Any]:
        return scan_conduit_obstacles(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            entity_bbox_fn=lambda entity: entity._bbox,
            include_modelspace=bool(request.get("includeModelspace", True)),
            selection_only=bool(request.get("selectionOnly", False)),
            max_entities=int(request.get("maxEntities", max(1, len(entities)))),
            canvas_width=float(request.get("canvasWidth", 980.0)),
            canvas_height=float(request.get("canvasHeight", 560.0)),
            layer_names=request.get("layerNames") or [],
            layer_type_overrides=request.get("layerTypeOverrides") or {},
        )

    return run


def _build_terminal_entities_from_replay(raw_entities: Any) -> List[Any]:
    if not isinstance(raw_entities, list):
        raise ValueError("Replay terminal_scan entry requires entities[] list.")
    entities: List[Any] = []
    for idx, raw_entity in enumerate(raw_entities):
        if not isinstance(raw_entity, dict):
            continue
        entity_kind = str(raw_entity.get("kind") or "").strip().lower()
        if entity_kind == "line":
            entities.append(_LineEntity(handle=str(raw_entity.get("handle") or f"R-LINE-{idx+1}")))
            continue

        bbox_like = raw_entity.get("insertionPoint")
        if not isinstance(bbox_like, (list, tuple)) or len(bbox_like) < 2:
            continue
        try:
            insertion = (float(bbox_like[0]), float(bbox_like[1]), float(bbox_like[2] if len(bbox_like) > 2 else 0.0))
        except Exception:
            continue
        attrs_raw = raw_entity.get("attrs") if isinstance(raw_entity.get("attrs"), dict) else {}
        attrs: Dict[str, str] = {str(k): str(v) for k, v in attrs_raw.items()}
        entities.append(
            _TerminalBlockEntity(
                handle=str(raw_entity.get("handle") or f"R-TBLK-{idx+1}"),
                name=str(raw_entity.get("name") or "TERMINAL_STRIP_BLOCK"),
                insertion=insertion,
                attrs=attrs,
            )
        )
    return entities


def _replay_terminal_scan_operation(entry: Dict[str, Any]) -> Callable[[], Dict[str, Any]]:
    document = entry.get("document") if isinstance(entry.get("document"), dict) else {}
    request = entry.get("scanRequest") if isinstance(entry.get("scanRequest"), dict) else {}
    entities = _build_terminal_entities_from_replay(entry.get("entities"))
    doc = _Doc(
        name=str(document.get("name") or "replay_terminal_scan.dwg"),
        units=int(document.get("units") or 2),
        pickfirst=[],
        active=[],
    )
    modelspace = _Collection(entities)

    def run() -> Dict[str, Any]:
        return scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=bool(request.get("includeModelspace", True)),
            selection_only=bool(request.get("selectionOnly", False)),
            max_entities=int(request.get("maxEntities", max(1, len(entities)))),
            terminal_profile=request.get("terminalProfile")
            if isinstance(request.get("terminalProfile"), dict)
            else None,
        )

    return run


def run_replay_suite(
    *,
    entries: Sequence[Dict[str, Any]],
    iterations: int,
    strict: bool = False,
) -> Dict[str, Any]:
    operation_stats: List[_OperationStats] = []
    skipped: List[str] = []
    for entry in entries:
        kind = str(entry.get("kind") or "compute").strip().lower()
        name = str(entry.get("name") or f"replay.{kind}")

        try:
            if kind == "compute":
                operation = _replay_compute_operation(entry)
            elif kind == "obstacle_scan":
                operation = _replay_obstacle_scan_operation(entry)
            elif kind == "terminal_scan":
                operation = _replay_terminal_scan_operation(entry)
            else:
                raise ValueError(f"Unsupported replay entry kind: {kind}")

            operation_stats.append(
                _run_timed_operation(
                    name=f"replay.{kind}.{name}",
                    fn=operation,
                    iterations=iterations,
                )
            )
        except Exception as exc:
            message = f"{name}: {exc}"
            if strict:
                raise
            skipped.append(message)

    report = _build_report(
        suite_kind="replay",
        operation_stats=operation_stats,
        extra={
            "iterations": int(iterations),
            "entryCount": len(entries),
            "executedCount": len(operation_stats),
            "skippedCount": len(skipped),
            "skipped": skipped,
        },
    )
    return report


def _build_report(
    *,
    suite_kind: str,
    operation_stats: Sequence[_OperationStats],
    extra: Dict[str, Any],
) -> Dict[str, Any]:
    results: List[Dict[str, Any]] = []
    for stats in operation_stats:
        summary = _summarize_durations(stats.duration_ms)
        results.append(
            {
                "name": stats.name,
                "iterations": stats.iterations,
                "completedCount": stats.completed_count,
                "successTrueCount": stats.success_true_count,
                "failureCount": stats.failure_count,
                "durationSummary": summary,
                "sampleMeta": stats.sample_meta,
                "sampleCode": stats.sample_code,
                "sampleMessage": stats.sample_message,
            }
        )

    return {
        "kind": suite_kind,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "results": results,
        **extra,
    }


def _print_report(report: Dict[str, Any]) -> None:
    kind = str(report.get("kind") or "benchmark")
    print(f"{kind.upper()} BENCHMARK REPORT")
    print("-" * 88)
    for result in report.get("results", []):
        if not isinstance(result, dict):
            continue
        summary = result.get("durationSummary") if isinstance(result.get("durationSummary"), dict) else {}
        print(str(result.get("name") or "unknown"))
        print(
            "  iterations={iterations} completed={completed} success_true={success_true} failures={failures}".format(
                iterations=result.get("iterations", 0),
                completed=result.get("completedCount", 0),
                success_true=result.get("successTrueCount", 0),
                failures=result.get("failureCount", 0),
            )
        )
        print(
            "  min={min:.2f}ms p50={p50:.2f}ms p95={p95:.2f}ms p99={p99:.2f}ms max={max:.2f}ms mean={mean:.2f}ms".format(
                min=float(summary.get("minMs", 0.0)),
                p50=float(summary.get("p50Ms", 0.0)),
                p95=float(summary.get("p95Ms", 0.0)),
                p99=float(summary.get("p99Ms", 0.0)),
                max=float(summary.get("maxMs", 0.0)),
                mean=float(summary.get("meanMs", 0.0)),
            )
        )
        sample_code = str(result.get("sampleCode") or "")
        if sample_code:
            print(f"  sample_code={sample_code}")
    print("-" * 88)


def _write_report(report: Dict[str, Any], output_path: Optional[Path]) -> None:
    if output_path is None:
        return
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")


def _write_template(path: Path, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise FileExistsError(f"Template file already exists: {path}")

    template = {
        "entries": [
            {
                "name": "compute-sample",
                "kind": "compute",
                "payload": {
                    "start": {"x": 52, "y": 82},
                    "end": {"x": 900, "y": 480},
                    "mode": "plan_view",
                    "clearance": 18,
                    "canvasWidth": 980,
                    "canvasHeight": 560,
                    "gridStep": 8,
                    "obstacles": [
                        {
                            "id": "FNDN-1",
                            "type": "foundation",
                            "x": 320,
                            "y": 180,
                            "w": 180,
                            "h": 120,
                            "label": "Transformer Foundation",
                        }
                    ],
                },
            },
            {
                "name": "obstacle-scan-sample",
                "kind": "obstacle_scan",
                "document": {"name": "sample.dwg", "units": 2},
                "scanRequest": {
                    "selectionOnly": False,
                    "includeModelspace": True,
                    "maxEntities": 50000,
                    "canvasWidth": 980,
                    "canvasHeight": 560,
                    "layerNames": ["S-FNDN-PRIMARY"],
                    "layerTypeOverrides": {"S-FNDN-PRIMARY": "foundation"},
                },
                "entities": [
                    {
                        "handle": "1A2B",
                        "layer": "S-FNDN-PRIMARY",
                        "objectName": "AcDbPolyline",
                        "bbox": [100.0, 120.0, 0.0, 200.0, 180.0, 0.0],
                    }
                ],
            },
            {
                "name": "terminal-scan-sample",
                "kind": "terminal_scan",
                "document": {"name": "sample.dwg", "units": 2},
                "scanRequest": {
                    "selectionOnly": False,
                    "includeModelspace": True,
                    "maxEntities": 50000,
                    "terminalProfile": {
                        "panelIdKeys": ["PANEL_ID"],
                        "sideKeys": ["SIDE"],
                        "stripIdKeys": ["STRIP_ID"],
                        "terminalCountKeys": ["TERMINAL_COUNT"],
                        "defaultPanelPrefix": "RP",
                        "defaultTerminalCount": 12,
                    },
                },
                "entities": [
                    {
                        "kind": "block",
                        "handle": "T1",
                        "name": "TERMINAL_STRIP_BLOCK",
                        "insertionPoint": [120.0, 220.0, 0.0],
                        "attrs": {
                            "PANEL_ID": "RP1",
                            "PANEL_NAME": "Relay Panel 1",
                            "SIDE": "L",
                            "STRIP_ID": "RP1L1",
                            "TERMINAL_COUNT": "16",
                            "TERM01_LABEL": "IN105 (+)",
                            "TERM02_LABEL": "IN105 (-)",
                        },
                    },
                    {"kind": "line", "handle": "L1"},
                ],
            },
        ]
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(template, indent=2), encoding="utf-8")


def _build_cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Offline benchmark harness for conduit-route scan/compute paths."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    synthetic = subparsers.add_parser(
        "synthetic",
        help="Run synthetic benchmark scenarios (obstacle scan, terminal scan, route compute).",
    )
    synthetic.add_argument(
        "--entity-counts",
        default="10000,50000,100000",
        help="Comma-separated entity counts to benchmark.",
    )
    synthetic.add_argument("--iterations", type=int, default=5, help="Iterations per case.")
    synthetic.add_argument("--seed", type=int, default=1337, help="Random seed.")
    synthetic.add_argument(
        "--scenario",
        default="all",
        choices=["all", "obstacle_scan", "terminal_scan", "route_compute"],
        help="Benchmark scenario selection.",
    )
    synthetic.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional JSON output path.",
    )

    replay = subparsers.add_parser(
        "replay",
        help="Replay benchmark using recorded payload/entity snapshots.",
    )
    replay.add_argument(
        "--snapshot",
        action="append",
        required=True,
        type=Path,
        help="Path to replay snapshot JSON (repeat for multiple files).",
    )
    replay.add_argument("--iterations", type=int, default=5, help="Iterations per replay entry.")
    replay.add_argument(
        "--strict",
        action="store_true",
        help="Fail immediately if any entry is invalid.",
    )
    replay.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional JSON output path.",
    )

    template = subparsers.add_parser(
        "template",
        help="Create a replay snapshot template JSON file.",
    )
    template.add_argument(
        "--output",
        type=Path,
        default=Path("backend/benchmarks/snapshots/replay-template.json"),
        help="Output path for template JSON.",
    )
    template.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting an existing template file.",
    )

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _build_cli()
    args = parser.parse_args(argv)

    if args.command == "synthetic":
        entity_counts = parse_entity_counts(args.entity_counts)
        report = run_synthetic_suite(
            entity_counts=entity_counts,
            iterations=args.iterations,
            seed=args.seed,
            scenario=args.scenario,
        )
        _print_report(report)
        _write_report(report, args.output)
        return 0

    if args.command == "replay":
        entries = load_replay_entries(args.snapshot)
        report = run_replay_suite(
            entries=entries,
            iterations=args.iterations,
            strict=bool(args.strict),
        )
        _print_report(report)
        _write_report(report, args.output)
        return 0

    if args.command == "template":
        _write_template(args.output, overwrite=bool(args.overwrite))
        print(f"Wrote replay template: {args.output}")
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

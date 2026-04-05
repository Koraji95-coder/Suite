from __future__ import annotations

import json
import math
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

SUPPORTED_LEARNING_DOMAINS = (
    "autodraft_markup",
    "autodraft_replacement",
    "transmittal_titleblock",
)

_TEXT_CLASSIFIER_DOMAINS = {
    "autodraft_markup",
    "transmittal_titleblock",
}
_POSITIVE_LABELS = {"1", "true", "yes", "selected", "match", "positive"}
_MODEL_CACHE_LOCK = threading.RLock()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _safe_json_dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=True, sort_keys=True)
    except Exception:
        return "{}"


def _safe_json_loads(raw: Any, default: Any) -> Any:
    try:
        return json.loads(str(raw or ""))
    except Exception:
        return default


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _normalize_token(value: Any) -> str:
    return _normalize_text(value).lower().replace(" ", "_")


def _coerce_bool_label(value: Any) -> int:
    normalized = _normalize_token(value)
    return 1 if normalized in _POSITIVE_LABELS else 0


def _combine_text_features(text: str, features: Dict[str, Any]) -> str:
    tokens: List[str] = []
    if text.strip():
        tokens.append(text.strip())
    for key in sorted(features.keys()):
        value = features.get(key)
        normalized_key = _normalize_token(key)
        if not normalized_key:
            continue
        if isinstance(value, bool):
            tokens.append(f"{normalized_key}_{'yes' if value else 'no'}")
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            tokens.append(f"{normalized_key}_{round(float(value), 4)}")
            continue
        if isinstance(value, str):
            normalized_value = _normalize_token(value)
            if normalized_value:
                tokens.append(f"{normalized_key}_{normalized_value}")
            continue
        if isinstance(value, list):
            for item in value:
                normalized_value = _normalize_token(item)
                if normalized_value:
                    tokens.append(f"{normalized_key}_{normalized_value}")
    return " ".join(tokens).strip()


def _default_replacement_feature_names() -> List[str]:
    return [
        "distance",
        "pointer_hit",
        "overlap",
        "pair_hit_count",
        "text_similarity",
        "same_color",
        "same_type",
        "cad_entity_count",
        "base_score",
        "final_score",
        "markup_width",
        "markup_height",
    ]


def _coerce_numeric_feature(value: Any) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    try:
        numeric = float(value)
    except Exception:
        return 0.0
    if math.isnan(numeric) or numeric in {float("inf"), float("-inf")}:
        return 0.0
    return numeric


@dataclass(frozen=True)
class LocalModelPrediction:
    label: str
    confidence: float
    model_version: str
    feature_source: str
    source: str
    reason_codes: List[str]


class LocalLearningRuntime:
    def __init__(self, *, base_dir: Optional[Path] = None) -> None:
        root_dir = (
            Path(base_dir).resolve()
            if base_dir is not None
            else (Path(__file__).resolve().parents[1] / ".learning").resolve()
        )
        self.base_dir = root_dir
        self.db_path = self.base_dir / "learning.sqlite3"
        self.artifacts_dir = self.base_dir / "artifacts"
        self.exports_dir = self.base_dir / "exports"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.db_path), timeout=15)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _open_connection(self):
        connection = self._connect()
        try:
            yield connection
        finally:
            connection.close()

    def _ensure_schema(self) -> None:
        with self._open_connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_examples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    domain TEXT NOT NULL,
                    label TEXT NOT NULL,
                    text_value TEXT NOT NULL DEFAULT '',
                    features_json TEXT NOT NULL DEFAULT '{}',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    source TEXT NOT NULL DEFAULT 'manual',
                    created_utc TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_learning_examples_domain_created
                ON learning_examples (domain, created_utc DESC, id DESC)
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_models (
                    domain TEXT NOT NULL,
                    version TEXT NOT NULL,
                    artifact_path TEXT NOT NULL,
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    active INTEGER NOT NULL DEFAULT 0,
                    created_utc TEXT NOT NULL,
                    PRIMARY KEY (domain, version)
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_learning_models_domain_active
                ON learning_models (domain, active DESC, created_utc DESC)
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    domain TEXT NOT NULL,
                    version TEXT NOT NULL,
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    confusion_json TEXT NOT NULL DEFAULT '{}',
                    promoted INTEGER NOT NULL DEFAULT 0,
                    sample_count INTEGER NOT NULL DEFAULT 0,
                    created_utc TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_bundle_imports (
                    bundle_id TEXT PRIMARY KEY,
                    imported_utc TEXT NOT NULL,
                    summary_json TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_learning_evaluations_domain_created
                ON learning_evaluations (domain, created_utc DESC, id DESC)
                """
            )
            connection.commit()

    def _validate_domain(self, domain: str) -> str:
        normalized = _normalize_token(domain)
        if normalized not in SUPPORTED_LEARNING_DOMAINS:
            raise ValueError(f"Unsupported learning domain '{domain}'.")
        return normalized

    def _write_domain_snapshot(
        self,
        connection: sqlite3.Connection,
        *,
        domain: str,
    ) -> None:
        export_path = self.exports_dir / f"{domain}.jsonl"
        rows = connection.execute(
            """
            SELECT id, domain, label, text_value, features_json, metadata_json, source, created_utc
            FROM learning_examples
            WHERE domain = ?
            ORDER BY id ASC
            """,
            (domain,),
        ).fetchall()
        with export_path.open("w", encoding="utf-8", newline="\n") as handle:
            for row in rows:
                payload = {
                    "id": int(row["id"]),
                    "domain": str(row["domain"] or ""),
                    "label": str(row["label"] or ""),
                    "text": str(row["text_value"] or ""),
                    "features": _safe_json_loads(row["features_json"], {}),
                    "metadata": _safe_json_loads(row["metadata_json"], {}),
                    "source": str(row["source"] or ""),
                    "created_utc": str(row["created_utc"] or ""),
                }
                handle.write(_safe_json_dumps(payload))
                handle.write("\n")

    def record_examples(
        self,
        *,
        domain: str,
        examples: Sequence[Dict[str, Any]],
    ) -> int:
        normalized_domain = self._validate_domain(domain)
        now_iso = _utc_now_iso()
        inserted = 0
        with self._open_connection() as connection:
            for example in examples:
                if not isinstance(example, dict):
                    continue
                label = _normalize_text(example.get("label"))
                if not label:
                    continue
                text_value = _normalize_text(example.get("text"))
                features = (
                    dict(example.get("features"))
                    if isinstance(example.get("features"), dict)
                    else {}
                )
                metadata = (
                    dict(example.get("metadata"))
                    if isinstance(example.get("metadata"), dict)
                    else {}
                )
                source = _normalize_text(example.get("source")) or "manual"
                connection.execute(
                    """
                    INSERT INTO learning_examples (
                        domain,
                        label,
                        text_value,
                        features_json,
                        metadata_json,
                        source,
                        created_utc
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        normalized_domain,
                        label,
                        text_value,
                        _safe_json_dumps(features),
                        _safe_json_dumps(metadata),
                        source,
                        now_iso,
                    ),
                )
                inserted += 1
            connection.commit()
            if inserted > 0:
                self._write_domain_snapshot(connection, domain=normalized_domain)
        return inserted

    def list_models(self, *, domain: Optional[str] = None) -> List[Dict[str, Any]]:
        normalized_domain = self._validate_domain(domain) if domain else None
        query = """
            SELECT domain, version, artifact_path, metrics_json, metadata_json, active, created_utc
            FROM learning_models
        """
        params: List[Any] = []
        if normalized_domain:
            query += " WHERE domain = ?"
            params.append(normalized_domain)
        query += " ORDER BY domain ASC, active DESC, created_utc DESC"
        with self._open_connection() as connection:
            rows = connection.execute(query, params).fetchall()
        models: List[Dict[str, Any]] = []
        for row in rows:
            models.append(
                {
                    "domain": str(row["domain"] or ""),
                    "version": str(row["version"] or ""),
                    "artifact_path": str(row["artifact_path"] or ""),
                    "metrics": _safe_json_loads(row["metrics_json"], {}),
                    "metadata": _safe_json_loads(row["metadata_json"], {}),
                    "active": bool(int(row["active"] or 0)),
                    "created_utc": str(row["created_utc"] or ""),
                }
            )
        return models

    def list_evaluations(
        self,
        *,
        domain: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        normalized_domain = self._validate_domain(domain) if domain else None
        safe_limit = max(1, min(100, int(limit or 20)))
        query = """
            SELECT domain, version, metrics_json, confusion_json, promoted, sample_count, created_utc
            FROM learning_evaluations
        """
        params: List[Any] = []
        if normalized_domain:
            query += " WHERE domain = ?"
            params.append(normalized_domain)
        query += " ORDER BY created_utc DESC, id DESC LIMIT ?"
        params.append(safe_limit)
        with self._open_connection() as connection:
            rows = connection.execute(query, params).fetchall()
        evaluations: List[Dict[str, Any]] = []
        for row in rows:
            evaluations.append(
                {
                    "domain": str(row["domain"] or ""),
                    "version": str(row["version"] or ""),
                    "metrics": _safe_json_loads(row["metrics_json"], {}),
                    "confusion": _safe_json_loads(row["confusion_json"], {}),
                    "promoted": bool(int(row["promoted"] or 0)),
                    "sample_count": max(0, int(row["sample_count"] or 0)),
                    "created_utc": str(row["created_utc"] or ""),
                }
            )
        return evaluations

    def _load_examples(self, domain: str) -> List[Dict[str, Any]]:
        normalized_domain = self._validate_domain(domain)
        with self._open_connection() as connection:
            rows = connection.execute(
                """
                SELECT id, label, text_value, features_json, metadata_json, source, created_utc
                FROM learning_examples
                WHERE domain = ?
                ORDER BY id ASC
                """,
                (normalized_domain,),
            ).fetchall()
        examples: List[Dict[str, Any]] = []
        for row in rows:
            examples.append(
                {
                    "id": int(row["id"]),
                    "label": str(row["label"] or ""),
                    "text": str(row["text_value"] or ""),
                    "features": _safe_json_loads(row["features_json"], {}),
                    "metadata": _safe_json_loads(row["metadata_json"], {}),
                    "source": str(row["source"] or ""),
                    "created_utc": str(row["created_utc"] or ""),
                }
            )
        return examples

    def has_imported_bundle(self, bundle_id: str) -> bool:
        normalized_bundle_id = _normalize_text(bundle_id)
        if not normalized_bundle_id:
            return False
        with self._open_connection() as connection:
            row = connection.execute(
                """
                SELECT bundle_id
                FROM learning_bundle_imports
                WHERE bundle_id = ?
                LIMIT 1
                """,
                (normalized_bundle_id,),
            ).fetchone()
        return row is not None

    def record_imported_bundle(
        self,
        *,
        bundle_id: str,
        summary: Optional[Dict[str, Any]] = None,
    ) -> None:
        normalized_bundle_id = _normalize_text(bundle_id)
        if not normalized_bundle_id:
            return
        with self._open_connection() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO learning_bundle_imports (
                    bundle_id,
                    imported_utc,
                    summary_json
                ) VALUES (?, ?, ?)
                """,
                (
                    normalized_bundle_id,
                    _utc_now_iso(),
                    _safe_json_dumps(summary if isinstance(summary, dict) else {}),
                ),
            )
            connection.commit()

    def _active_model_row(
        self,
        connection: sqlite3.Connection,
        *,
        domain: str,
    ) -> Optional[sqlite3.Row]:
        return connection.execute(
            """
            SELECT domain, version, artifact_path, metrics_json, metadata_json, active, created_utc
            FROM learning_models
            WHERE domain = ? AND active = 1
            ORDER BY created_utc DESC
            LIMIT 1
            """,
            (domain,),
        ).fetchone()

    def _build_text_classifier_bundle(
        self,
        *,
        domain: str,
        examples: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
        from sklearn.model_selection import train_test_split
        from sklearn.pipeline import Pipeline

        texts = [
            _combine_text_features(
                str(example.get("text") or ""),
                example.get("features") if isinstance(example.get("features"), dict) else {},
            )
            for example in examples
        ]
        labels = [str(example.get("label") or "").strip() for example in examples]
        unique_labels = sorted({label for label in labels if label})
        if len(texts) < 6 or len(unique_labels) < 2:
            raise ValueError(
                "At least 6 labeled examples across 2 labels are required for text-domain training."
            )

        stratify_labels = labels if all(labels.count(label) >= 2 for label in unique_labels) else None
        x_train, x_test, y_train, y_test = train_test_split(
            texts,
            labels,
            test_size=0.25,
            random_state=42,
            stratify=stratify_labels,
        )
        pipeline = Pipeline(
            [
                ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
                (
                    "classifier",
                    LogisticRegression(
                        max_iter=2000,
                        class_weight="balanced",
                    ),
                ),
            ]
        )
        pipeline.fit(x_train, y_train)
        predictions = pipeline.predict(x_test)
        metrics = {
            "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
            "macro_f1": round(float(f1_score(y_test, predictions, average="macro")), 4),
            "train_count": len(x_train),
            "test_count": len(x_test),
        }
        confusion = {
            "labels": unique_labels,
            "matrix": confusion_matrix(y_test, predictions, labels=unique_labels).tolist(),
        }
        return {
            "bundle": {
                "domain": domain,
                "model_type": "text_logistic_regression",
                "pipeline": pipeline,
                "feature_source": "text+structured_tokens",
            },
            "metrics": metrics,
            "confusion": confusion,
        }

    def _build_replacement_bundle(
        self,
        *,
        domain: str,
        examples: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        from sklearn.ensemble import HistGradientBoostingClassifier
        from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
        from sklearn.model_selection import train_test_split

        feature_names = sorted(
            {
                *set(_default_replacement_feature_names()),
                *{
                    str(key)
                    for example in examples
                    for key in (
                        example.get("features").keys()
                        if isinstance(example.get("features"), dict)
                        else []
                    )
                },
            }
        )
        if not feature_names:
            feature_names = _default_replacement_feature_names()

        x_rows: List[List[float]] = []
        y_rows: List[int] = []
        for example in examples:
            features = example.get("features") if isinstance(example.get("features"), dict) else {}
            x_rows.append([
                _coerce_numeric_feature(features.get(name))
                for name in feature_names
            ])
            y_rows.append(_coerce_bool_label(example.get("label")))

        if len(x_rows) < 8 or len(set(y_rows)) < 2:
            raise ValueError(
                "At least 8 replacement examples across positive and negative labels are required."
            )

        stratify_rows = y_rows if min(y_rows.count(0), y_rows.count(1)) >= 2 else None
        x_train, x_test, y_train, y_test = train_test_split(
            x_rows,
            y_rows,
            test_size=0.25,
            random_state=42,
            stratify=stratify_rows,
        )
        classifier = HistGradientBoostingClassifier(
            max_depth=6,
            max_iter=250,
            learning_rate=0.08,
            random_state=42,
        )
        classifier.fit(x_train, y_train)
        predictions = classifier.predict(x_test)
        metrics = {
            "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
            "macro_f1": round(float(f1_score(y_test, predictions, average="macro")), 4),
            "train_count": len(x_train),
            "test_count": len(x_test),
        }
        confusion = {
            "labels": [0, 1],
            "matrix": confusion_matrix(y_test, predictions, labels=[0, 1]).tolist(),
        }
        return {
            "bundle": {
                "domain": domain,
                "model_type": "replacement_hist_gradient_boosting",
                "classifier": classifier,
                "feature_names": feature_names,
                "feature_source": "replacement_numeric_features",
            },
            "metrics": metrics,
            "confusion": confusion,
        }

    def _should_promote_model(
        self,
        *,
        active_metrics: Optional[Dict[str, Any]],
        next_metrics: Dict[str, Any],
    ) -> bool:
        if not active_metrics:
            return True
        current_f1 = float(active_metrics.get("macro_f1") or 0.0)
        current_accuracy = float(active_metrics.get("accuracy") or 0.0)
        next_f1 = float(next_metrics.get("macro_f1") or 0.0)
        next_accuracy = float(next_metrics.get("accuracy") or 0.0)
        return next_f1 > current_f1 or (
            abs(next_f1 - current_f1) <= 1e-9 and next_accuracy >= current_accuracy
        )

    def train_domain(self, *, domain: str) -> Dict[str, Any]:
        import joblib

        normalized_domain = self._validate_domain(domain)
        examples = self._load_examples(normalized_domain)
        if normalized_domain in _TEXT_CLASSIFIER_DOMAINS:
            training = self._build_text_classifier_bundle(
                domain=normalized_domain,
                examples=examples,
            )
        else:
            training = self._build_replacement_bundle(
                domain=normalized_domain,
                examples=examples,
            )

        version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        artifact_path = self.artifacts_dir / f"{normalized_domain}-{version}.joblib"
        bundle = dict(training["bundle"])
        bundle["version"] = version
        bundle["trained_utc"] = _utc_now_iso()
        bundle["example_count"] = len(examples)
        joblib.dump(bundle, artifact_path)

        with self._open_connection() as connection:
            active_row = self._active_model_row(connection, domain=normalized_domain)
            active_metrics = (
                _safe_json_loads(active_row["metrics_json"], {})
                if active_row is not None
                else None
            )
            promote = self._should_promote_model(
                active_metrics=active_metrics,
                next_metrics=training["metrics"],
            )
            if promote:
                connection.execute(
                    "UPDATE learning_models SET active = 0 WHERE domain = ?",
                    (normalized_domain,),
                )
            connection.execute(
                """
                INSERT OR REPLACE INTO learning_models (
                    domain,
                    version,
                    artifact_path,
                    metrics_json,
                    metadata_json,
                    active,
                    created_utc
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_domain,
                    version,
                    str(artifact_path),
                    _safe_json_dumps(training["metrics"]),
                    _safe_json_dumps(
                        {
                            "model_type": bundle.get("model_type"),
                            "feature_source": bundle.get("feature_source"),
                            "example_count": len(examples),
                        }
                    ),
                    1 if promote else 0,
                    _utc_now_iso(),
                ),
            )
            connection.execute(
                """
                INSERT INTO learning_evaluations (
                    domain,
                    version,
                    metrics_json,
                    confusion_json,
                    promoted,
                    sample_count,
                    created_utc
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_domain,
                    version,
                    _safe_json_dumps(training["metrics"]),
                    _safe_json_dumps(training["confusion"]),
                    1 if promote else 0,
                    len(examples),
                    _utc_now_iso(),
                ),
            )
            connection.commit()

        with _MODEL_CACHE_LOCK:
            if promote:
                self._model_cache_pop(normalized_domain)
        return {
            "ok": True,
            "domain": normalized_domain,
            "version": version,
            "metrics": training["metrics"],
            "confusion": training["confusion"],
            "promoted": promote,
            "sample_count": len(examples),
            "artifact_path": str(artifact_path),
        }

    def train_domains(self, *, domains: Sequence[str]) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        normalized_domains = (
            [self._validate_domain(domain) for domain in domains]
            if domains
            else list(SUPPORTED_LEARNING_DOMAINS)
        )
        for domain in normalized_domains:
            try:
                results.append(self.train_domain(domain=domain))
            except Exception as exc:
                results.append(
                    {
                        "ok": False,
                        "domain": domain,
                        "message": str(exc),
                    }
                )
        return results

    def benchmark_examples(
        self,
        *,
        domain: str,
        examples: Sequence[Dict[str, Any]],
    ) -> Dict[str, Any]:
        from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

        normalized_domain = self._validate_domain(domain)
        bundle = self._load_active_model_bundle(domain=normalized_domain)
        if not bundle:
            return {
                "ok": False,
                "domain": normalized_domain,
                "sample_count": len(examples),
                "predicted_count": 0,
                "missing_prediction_count": len(examples),
                "message": "No active model is available for this domain.",
            }

        actual_labels: List[str] = []
        predicted_labels: List[str] = []
        missing_prediction_count = 0
        sample_count = 0

        for example in examples:
            if not isinstance(example, dict):
                continue
            sample_count += 1
            prediction: Optional[LocalModelPrediction]
            actual_label = ""
            if normalized_domain in _TEXT_CLASSIFIER_DOMAINS:
                actual_label = str(example.get("label") or "").strip()
                if not actual_label:
                    missing_prediction_count += 1
                    continue
                prediction = self.predict_text_domain(
                    domain=normalized_domain,
                    text=str(example.get("text") or ""),
                    features=(
                        dict(example.get("features"))
                        if isinstance(example.get("features"), dict)
                        else {}
                    ),
                )
            else:
                actual_label = (
                    "selected"
                    if _coerce_bool_label(example.get("label")) == 1
                    else "not_selected"
                )
                prediction = self.predict_replacement(
                    features=(
                        dict(example.get("features"))
                        if isinstance(example.get("features"), dict)
                        else {}
                    )
                )
            if prediction is None or not str(prediction.label or "").strip():
                missing_prediction_count += 1
                continue
            actual_labels.append(actual_label)
            predicted_labels.append(str(prediction.label).strip())

        if not actual_labels:
            return {
                "ok": False,
                "domain": normalized_domain,
                "model_version": str(bundle.get("version") or "unknown"),
                "sample_count": sample_count,
                "predicted_count": 0,
                "missing_prediction_count": missing_prediction_count,
                "message": "No benchmark predictions were produced.",
            }

        labels = sorted(set(actual_labels) | set(predicted_labels))
        metrics = {
            "accuracy": round(float(accuracy_score(actual_labels, predicted_labels)), 4),
            "macro_f1": round(
                float(f1_score(actual_labels, predicted_labels, average="macro")),
                4,
            ),
            "coverage": round(
                float(len(predicted_labels) / max(sample_count, 1)),
                4,
            ),
        }
        confusion = {
            "labels": labels,
            "matrix": confusion_matrix(
                actual_labels,
                predicted_labels,
                labels=labels,
            ).tolist(),
        }
        return {
            "ok": True,
            "domain": normalized_domain,
            "model_version": str(bundle.get("version") or "unknown"),
            "sample_count": sample_count,
            "predicted_count": len(predicted_labels),
            "missing_prediction_count": missing_prediction_count,
            "metrics": metrics,
            "confusion": confusion,
        }

    def _model_cache_pop(self, domain: str) -> None:
        key = self._validate_domain(domain)
        cache = getattr(self, "_model_cache", None)
        if not isinstance(cache, dict):
            self._model_cache = {}
            return
        cache.pop(key, None)

    @property
    def _model_cache(self) -> Dict[str, Dict[str, Any]]:
        cache = getattr(self, "__model_cache", None)
        if not isinstance(cache, dict):
            cache = {}
            setattr(self, "__model_cache", cache)
        return cache

    @_model_cache.setter
    def _model_cache(self, value: Dict[str, Dict[str, Any]]) -> None:
        setattr(self, "__model_cache", value)

    def _load_active_model_bundle(self, *, domain: str) -> Optional[Dict[str, Any]]:
        import joblib

        normalized_domain = self._validate_domain(domain)
        with _MODEL_CACHE_LOCK:
            cached = self._model_cache.get(normalized_domain)
            if isinstance(cached, dict):
                return cached
            with self._open_connection() as connection:
                row = self._active_model_row(connection, domain=normalized_domain)
            if row is None:
                return None
            artifact_path = Path(str(row["artifact_path"] or "")).resolve()
            if not artifact_path.is_file():
                return None
            bundle = joblib.load(str(artifact_path))
            if not isinstance(bundle, dict):
                return None
            self._model_cache[normalized_domain] = bundle
            return bundle

    def predict_text_domain(
        self,
        *,
        domain: str,
        text: str,
        features: Optional[Dict[str, Any]] = None,
    ) -> Optional[LocalModelPrediction]:
        normalized_domain = self._validate_domain(domain)
        if normalized_domain not in _TEXT_CLASSIFIER_DOMAINS:
            raise ValueError(f"Domain '{domain}' is not a text-classifier domain.")
        bundle = self._load_active_model_bundle(domain=normalized_domain)
        if not bundle:
            return None
        pipeline = bundle.get("pipeline")
        if pipeline is None:
            return None
        feature_payload = features if isinstance(features, dict) else {}
        text_payload = _combine_text_features(text, feature_payload)
        try:
            predicted_label = str(pipeline.predict([text_payload])[0])
        except Exception:
            return None

        confidence = 0.0
        if hasattr(pipeline, "predict_proba"):
            try:
                probabilities = pipeline.predict_proba([text_payload])[0]
                classes = list(getattr(pipeline, "classes_", []))
                if predicted_label in classes:
                    confidence = float(probabilities[classes.index(predicted_label)])
            except Exception:
                confidence = 0.0
        return LocalModelPrediction(
            label=predicted_label,
            confidence=max(0.0, min(1.0, confidence)),
            model_version=str(bundle.get("version") or "unknown"),
            feature_source=str(bundle.get("feature_source") or "text+structured_tokens"),
            source="local_model",
            reason_codes=["local_model_prediction"],
        )

    def predict_replacement(
        self,
        *,
        features: Dict[str, Any],
    ) -> Optional[LocalModelPrediction]:
        bundle = self._load_active_model_bundle(domain="autodraft_replacement")
        if not bundle:
            return None
        classifier = bundle.get("classifier")
        feature_names = bundle.get("feature_names")
        if classifier is None or not isinstance(feature_names, list) or not feature_names:
            return None
        row = [[_coerce_numeric_feature(features.get(name)) for name in feature_names]]
        try:
            predicted = int(classifier.predict(row)[0])
        except Exception:
            return None
        confidence = 0.0
        if hasattr(classifier, "predict_proba"):
            try:
                probabilities = classifier.predict_proba(row)[0]
                if len(probabilities) > predicted:
                    confidence = float(probabilities[predicted])
            except Exception:
                confidence = 0.0
        return LocalModelPrediction(
            label="selected" if predicted == 1 else "not_selected",
            confidence=max(0.0, min(1.0, confidence)),
            model_version=str(bundle.get("version") or "unknown"),
            feature_source=str(bundle.get("feature_source") or "replacement_numeric_features"),
            source="local_model",
            reason_codes=["local_model_prediction"],
        )


_RUNTIME_SINGLETON: Optional[LocalLearningRuntime] = None


def get_local_learning_runtime() -> LocalLearningRuntime:
    global _RUNTIME_SINGLETON
    if _RUNTIME_SINGLETON is None:
        _RUNTIME_SINGLETON = LocalLearningRuntime()
    return _RUNTIME_SINGLETON

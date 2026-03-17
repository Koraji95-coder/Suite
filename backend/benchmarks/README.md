# Benchmark Harnesses

Offline benchmark tools for Suite subsystems.

## Why

Use this when you want repeatable performance baselines without requiring a live AutoCAD session.

## Conduit Route

## Commands

- Synthetic workload suite (generated entities/payloads):

```bash
python -m backend.benchmarks.conduit_route_benchmark synthetic --entity-counts 10000,50000,100000 --iterations 5 --scenario all
```

- Replay recorded snapshots (captured payload/entity fixtures):

```bash
python -m backend.benchmarks.conduit_route_benchmark replay --snapshot backend/benchmarks/snapshots/replay-template.json --iterations 5
```

- Write a replay template you can copy/modify:

```bash
python -m backend.benchmarks.conduit_route_benchmark template --output backend/benchmarks/snapshots/replay-template.json --overwrite
```

## Output

Each run prints per-operation timing stats:

- `minMs`
- `p50Ms`
- `p95Ms`
- `p99Ms`
- `maxMs`
- `meanMs`

Use `--output <path>.json` on `synthetic` or `replay` to persist reports for regression tracking.

## AutoDraft Reviewed Runs

Use reviewed-run bundles exported from the AutoDraft compare UI to build local training data and benchmark active models against real operator-reviewed jobs.

- Import reviewed-run bundles into the local feedback/learning stores:

```bash
python -m backend.benchmarks.autodraft_learning_benchmark import path/to/reviewed-run.json
```

- Benchmark active AutoDraft learning models against reviewed-run bundles:

```bash
python -m backend.benchmarks.autodraft_learning_benchmark benchmark path/to/reviewed-run.json --output backend/benchmarks/reports/autodraft-benchmark.json
```

- Import multiple reviewed-run bundles from a directory:

```bash
python -m backend.benchmarks.autodraft_learning_benchmark import path/to/reviewed-runs/
```

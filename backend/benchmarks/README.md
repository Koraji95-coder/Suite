# Conduit Route Benchmark Harness

Offline benchmark harness for conduit-route scan/compute code paths.

## Why

Use this when you want repeatable performance baselines without requiring a live AutoCAD session.

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

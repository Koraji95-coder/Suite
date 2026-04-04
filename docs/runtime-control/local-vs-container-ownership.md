# Local Vs Container Ownership

Suite now uses a deliberate hybrid runtime model.

Docker is important, but it is not the whole workstation portability story.

## Docker-Owned Runtime Core

Use Docker for the shared reproducible lane:

- frontend
- backend
- Redis
- the local Supabase development lane

Why this stays in Docker:

- faster parity between workstations
- easier smoke validation for the shared web/runtime core
- container-status observability inside Runtime Control
- less machine drift across the common dev stack

## Workstation-Local Ownership

Keep these machine-local:

- Runtime Control
- Office companion
- watchdog collectors
- AutoCAD and plugin execution
- startup tasks
- workstation profile and identity
- local learning artifacts
- SQLite state
- JSONL exports
- promoted local model artifacts

Why these stay local:

- they depend on workstation identity or installed desktop software
- they need direct access to local files, scheduled tasks, or CAD hosts
- they are intentionally not part of disposable shared containers

## What Moves Between Workstations

Cross-PC continuity now works like this:

- code moves through Git
- machine setup comes from bootstrap
- workstation identity comes from `npm run workstation:sync`
- local-only state moves through `npm run workstation:mirror` and `npm run workstation:restore`

Docker helps recreate the shared runtime core, but it does not carry the full workstation profile or local-only artifacts by itself.

## Runtime Control Responsibilities

Runtime Control is the machine-local companion door for:

- start and stop actions
- Docker observability
- runtime doctor handoff
- support export bundles
- workstation identity and support state
- local service and CAD-adjacent actions

Suite web should stay light on trust signals and hand off deeper machine-local work to Runtime Control.

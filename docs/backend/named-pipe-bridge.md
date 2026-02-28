# Named Pipe Bridge (Backend <-> .NET)

This guide describes a safe, robust local bridge between the existing backend and a .NET AutoCAD automation service using Windows named pipes. It keeps the TSX UI intact and does not require exposing network ports.

## Goals

- Keep React UI and Python backend as-is.
- Move AutoCAD automation into a .NET service (in-process add-in or local worker).
- Use a local-only IPC channel for reliability and security.

## Overview

- **Frontend (TSX)** calls the existing backend via HTTP.
- **Backend** sends automation jobs to a **.NET named pipe server**.
- **.NET service** executes AutoCAD operations and returns results.

This removes COM connection issues from the backend and avoids exposing keys to the browser.

## Pipe Naming

Pick a stable pipe name with no spaces, e.g.:

- `SUITE_AUTOCAD_PIPE`
- `AutoCAD_UIPipeline`

Named pipes are local to each Windows machine, so the same name can be used on multiple computers without conflict.

## Security & Robustness

- **Local-only**: Named pipes are not reachable from the network.
- **Auth**: Use a short-lived HMAC token from the backend as a request field.
- **Timeouts**: Set read/write timeouts in both client and server.
- **Single-threaded execution**: The .NET service should execute one job at a time to avoid AutoCAD locks.

## Message Protocol (JSON lines)

Each request/response is a single JSON object on its own line (newline-delimited JSON).

Example request:

```json
{"id":"job-123","action":"batch_find_replace","payload":{"files":["C:\\path\\a.dwg"],"rules":[{"find":"A","replace":"B"}]},"token":"<hmac>"}
```

Example response:

```json
{"id":"job-123","ok":true,"result":{"changed":12},"error":null}
```

## Step 1: Create the .NET named pipe server

- Host a `NamedPipeServerStream`.
- Read a line of JSON.
- Execute the requested action.
- Write a JSON response.

Starter code is in: `dotnet/named-pipe-bridge/BatchFindAndReplace.cs`.

## Step 2: Add a backend named pipe client

- Connect with `win32pipe`/`win32file` (pywin32).
- Send JSON request and read JSON response.

Starter code is in: `backend/dotnet_bridge.py`.

## Step 3: Wire into backend endpoints (later)

- Add an internal backend function to call the pipe client.
- Map existing `/api/*` endpoints to the .NET actions.
- Keep input validation in the backend.

## Step 4: Long-running jobs (optional)

For long tasks:

- Backend creates a job ID and returns immediately.
- .NET service processes in background and reports status.
- Frontend polls `/api/jobs/:id`.

## Next steps

- Decide on pipe name and token scheme.
- Confirm where the .NET service will run (AutoCAD add-in vs standalone worker).
- Pick 1 automation feature to pilot (e.g., batch find/replace).

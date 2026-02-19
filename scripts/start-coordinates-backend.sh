#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/src/Ground-grid & coordinates grabber"
API_FILE="$API_DIR/api_server.py"
REQ_FILE="$API_DIR/requirements-api.txt"

INSTALL_DEPS=false
for arg in "$@"; do
  case "$arg" in
    --install-deps)
      INSTALL_DEPS=true
      ;;
    *)
      ;;
  esac
done

if [[ ! -f "$API_FILE" ]]; then
  echo "[ERROR] Backend file not found: $API_FILE"
  exit 1
fi

if ! command -v python >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo "[ERROR] Python is not installed or not on PATH."
  exit 1
fi

PYTHON_BIN="python"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python3"
fi

if [[ "$INSTALL_DEPS" == "true" ]]; then
  echo "[INFO] Installing backend dependencies from requirements-api.txt"
  "$PYTHON_BIN" -m pip install -r "$REQ_FILE"
fi

if [[ "${CODESPACES:-false}" == "true" ]]; then
  echo "[WARNING] You are running inside Codespaces/Linux."
  echo "[WARNING] AutoCAD COM dependencies (pythoncom/win32com) require Windows with AutoCAD installed."
  echo "[WARNING] Use this script on your Windows machine for actual backend execution."
fi

echo "[INFO] Starting Coordinates Grabber API backend..."
cd "$API_DIR"
exec "$PYTHON_BIN" "$API_FILE"

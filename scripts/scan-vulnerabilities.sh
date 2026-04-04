#!/usr/bin/env bash
# Quick vulnerability scanning for Suite images

set -e

REPO_ROOT="${REPO_ROOT:-.}"
IMAGES=(
  "suite-backend:current"
  "suite-frontend:current"
)

echo "[scan] Building current images..."
docker build -f "$REPO_ROOT/docker/runtime-core/backend.Dockerfile" \
  -t suite-backend:current \
  "$REPO_ROOT"

docker build -f "$REPO_ROOT/docker/runtime-core/node.Dockerfile" \
  -t suite-frontend:current \
  "$REPO_ROOT"

echo ""
echo "[scan] === VULNERABILITY REPORT ==="
echo ""

for image in "${IMAGES[@]}"; do
  echo "[scan] Scanning $image..."
  echo "---"
  
  # Try to scan; if Scout not available, show manual instructions
  if command -v docker &> /dev/null; then
    docker scout cves "$image" --format table --only-severity critical,high 2>&1 || {
      echo "  ⚠ Docker Scout may not be configured."
      echo "  To scan, run: docker scout cves $image"
    }
  else
    echo "  ⚠ Docker not found on PATH"
  fi
  
  echo ""
done

echo "[scan] === COMPARISON: Hardened vs Current ==="
echo ""

echo "[scan] Building hardened images (Alpine-based)..."
docker build -f "$REPO_ROOT/docker/runtime-core/backend.Dockerfile.hardened" \
  -t suite-backend:hardened \
  "$REPO_ROOT" 2>&1 | tail -5

docker build -f "$REPO_ROOT/docker/runtime-core/node.Dockerfile.hardened" \
  -t suite-frontend:hardened \
  "$REPO_ROOT" 2>&1 | tail -5

echo ""
echo "[scan] === IMAGE SIZE COMPARISON ==="
docker images | grep -E "suite-(backend|frontend)" | grep -E "(current|hardened)" || echo "No images found"

echo ""
echo "[scan] === NEXT STEPS ==="
echo "1. Review VULNERABILITY_FIX_GUIDE.md for detailed remediation"
echo "2. Update dependencies: npm audit fix && pip audit"
echo "3. Use hardened Dockerfiles by updating compose:"
echo "   - Change dockerfile: docker/runtime-core/backend.Dockerfile"
echo "   - To: dockerfile: docker/runtime-core/backend.Dockerfile.hardened"
echo "4. Re-build and verify: docker compose --file docker/runtime-core/runtime-core.compose.yml up --build"

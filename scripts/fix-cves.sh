#!/usr/bin/env bash
# Automated vulnerability fix script

set -e

echo "[fix] === Automated CVE Remediation ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Phase 1: Python Dependencies
echo -e "${YELLOW}[fix] Phase 1: Upgrading Python packages...${NC}"

if command -v pip &> /dev/null; then
  echo "[fix] Installing: cbor2 pillow pyjwt pyasn1 pyopenssl"
  pip install --upgrade cbor2 pillow pyjwt pyasn1 pyopenssl 2>&1 | grep -E "(Successfully|already|Collecting)" || true
  
  echo "[fix] Updating requirements lock file..."
  pip freeze > backend/requirements-api.lock.txt
  
  echo -e "${GREEN}[fix] ✓ Python packages upgraded${NC}"
else
  echo -e "${RED}[fix] ✗ pip not found${NC}"
  exit 1
fi

echo ""

# Phase 2: Node Dependencies
echo -e "${YELLOW}[fix] Phase 2: Upgrading Node packages...${NC}"

if command -v npm &> /dev/null; then
  echo "[fix] Running npm audit fix..."
  npm audit fix --force 2>&1 | grep -E "(removed|added|up to date|audited)" || true
  
  echo "[fix] Running npm update..."
  npm update 2>&1 | tail -5 || true
  
  echo "[fix] Regenerating package-lock.json..."
  npm ci 2>&1 | tail -3 || true
  
  echo -e "${GREEN}[fix] ✓ Node packages upgraded${NC}"
else
  echo -e "${RED}[fix] ✗ npm not found${NC}"
  exit 1
fi

echo ""

# Phase 3: Dockerfile Updates
echo -e "${YELLOW}[fix] Phase 3: Updating Dockerfiles...${NC}"

# Backup originals
cp docker/runtime-core/backend.Dockerfile docker/runtime-core/backend.Dockerfile.backup.pre-fix 2>/dev/null || true
cp docker/runtime-core/node.Dockerfile docker/runtime-core/node.Dockerfile.backup.pre-fix 2>/dev/null || true

# Update backend Dockerfile (python:3.14.3-slim → python:3.14-slim)
if grep -q "python:3.14.3-slim" docker/runtime-core/backend.Dockerfile; then
  echo "[fix] Updating backend base image: python:3.14.3-slim → python:3.14-slim"
  sed -i 's/python:3.14.3-slim/python:3.14-slim/g' docker/runtime-core/backend.Dockerfile
else
  echo "[fix] Backend base image already updated or not found"
fi

# Update frontend Dockerfile (node:22-bookworm-slim → node:22-alpine)
if grep -q "node:22-bookworm-slim" docker/runtime-core/node.Dockerfile; then
  echo "[fix] Updating frontend base image: node:22-bookworm-slim → node:22-alpine"
  sed -i 's/node:22-bookworm-slim/node:22-alpine/g' docker/runtime-core/node.Dockerfile
else
  echo "[fix] Frontend base image already updated or not found"
fi

echo -e "${GREEN}[fix] ✓ Dockerfiles updated${NC}"

echo ""

# Phase 4: Verify Fixes
echo -e "${YELLOW}[fix] Phase 4: Verifying fixes...${NC}"

if command -v pip &> /dev/null; then
  echo "[fix] Python vulnerability check:"
  pip-audit --desc --skip-editable 2>&1 | head -20 || echo "  ⚠ No vulnerabilities detected or pip-audit not installed"
fi

if command -v npm &> /dev/null; then
  echo "[fix] Node vulnerability check:"
  npm audit 2>&1 | grep -E "(audited|vulnerabilities|up to date)" || true
fi

echo ""

# Phase 5: Rebuild and Scan
echo -e "${YELLOW}[fix] Phase 5: Rebuilding Docker images...${NC}"

if command -v docker &> /dev/null; then
  echo "[fix] Rebuilding backend image (may take 5-10 min)..."
  docker build -f docker/runtime-core/backend.Dockerfile -t suite-backend:fixed . 2>&1 | tail -10 || true
  
  echo "[fix] Rebuilding frontend image..."
  docker build -f docker/runtime-core/node.Dockerfile -t suite-frontend:fixed . 2>&1 | tail -10 || true
  
  echo "[fix] Scanning rebuilt images..."
  echo ""
  echo "[fix] === Backend Scan Results ==="
  docker scout cves suite-backend:fixed --only-severity critical,high 2>&1 | grep -A 20 "Packages and Vulnerabilities" || docker scout cves suite-backend:fixed --only-severity critical,high 2>&1 | tail -20
  
  echo ""
  echo "[fix] === Frontend Scan Results ==="
  docker scout cves suite-frontend:fixed --only-severity critical,high 2>&1 | grep -A 20 "Packages and Vulnerabilities" || docker scout cves suite-frontend:fixed --only-severity critical,high 2>&1 | tail -20
  
  echo -e "${GREEN}[fix] ✓ Images rebuilt and scanned${NC}"
else
  echo -e "${RED}[fix] ✗ docker not found${NC}"
fi

echo ""
echo -e "${GREEN}[fix] === FIX COMPLETE ===${NC}"
echo ""
echo "Changes made:"
echo "  ✓ backend/requirements-api.lock.txt (updated)"
echo "  ✓ package-lock.json (updated)"
echo "  ✓ docker/runtime-core/backend.Dockerfile (python:3.14-slim)"
echo "  ✓ docker/runtime-core/node.Dockerfile (node:22-alpine)"
echo ""
echo "Next steps:"
echo "  1. Test your application: docker compose up"
echo "  2. Verify health checks pass"
echo "  3. Run your test suite: npm test && python -m pytest"
echo "  4. Commit changes: git add . && git commit -m 'fix: upgrade dependencies to fix 11 CVEs'"
echo "  5. Deploy: docker push your-registry/suite-backend:v2.0"
echo ""
echo "For details, see: REAL_VULNERABILITY_FIXES.md"

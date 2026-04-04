#!/usr/bin/env bash
# Fix vulnerabilities in dependencies

set -e

echo "[fix] === VULNERABILITY FIX TOOLKIT ==="
echo ""

# Python fixes
echo "[fix] Checking Python dependencies..."
if command -v pip &> /dev/null; then
  echo "[fix] Running pip-audit..."
  pip install --quiet pip-audit 2>/dev/null || true
  pip-audit --desc --skip-editable 2>&1 || echo "  ⚠ CVEs found. Run: pip audit fix --dry-run"
else
  echo "  ⚠ pip not found"
fi

echo ""

# Node fixes
echo "[fix] Checking Node dependencies..."
if command -v npm &> /dev/null; then
  echo "[fix] Running npm audit..."
  npm audit --legacy-peer-deps 2>&1 || echo "  ⚠ CVEs found. Run: npm audit fix"
  
  echo ""
  echo "[fix] Vulnerable packages details:"
  npm audit --json 2>&1 | jq '.metadata.vulnerabilities | keys' 2>/dev/null || npm audit
else
  echo "  ⚠ npm not found"
fi

echo ""
echo "[fix] === REMEDIATION STEPS ==="
echo ""
echo "For Python:"
echo "  pip install --upgrade pip setuptools wheel"
echo "  pip-audit --skip-editable"
echo "  pip install --upgrade <vulnerable-package>"
echo "  pip freeze > backend/requirements-api.lock.txt"
echo ""
echo "For Node:"
echo "  npm update"
echo "  npm audit fix"
echo "  npm audit fix --force  (if needed; may have breaking changes)"
echo ""
echo "Verify by rebuilding hardened images:"
echo "  docker build -f docker/runtime-core/backend.Dockerfile.hardened -t suite-backend:latest ."
echo "  docker scout cves suite-backend:latest --only-severity critical,high"

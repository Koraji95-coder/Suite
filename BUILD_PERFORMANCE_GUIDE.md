# Build Performance Optimization

## Current Build Times

| Scenario | Time | Bottleneck |
|----------|------|-----------|
| **Cold build** (no cache) | 8-12 min | Compiling scikit-learn, pandas, numpy |
| **Warm build** (code change only) | 30-60 sec | Cache hit on deps, fast code copy |
| **Hardened base build** | 10-15 min | Same deps, different base |

## Why It's Slow

Your `requirements-api.lock.txt` includes heavy packages:
- `scikit-learn` - needs compilation (3-5 min)
- `pandas` - needs compilation (1-2 min)
- `numpy` - needs compilation (1-2 min)
- `lxml` - needs compilation (30 sec)
- `cryptography` - needs compilation (30 sec)

**Total compilation time:** 6-10 minutes

## Optimization Strategies

### Strategy 1: BuildKit Cache Mounts (Recommended)

**File:** `docker/runtime-core/backend.Dockerfile.optimized`

```dockerfile
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements-api.lock.txt
```

This reuses pip's download cache across builds = **2-3x faster on warm builds**.

**Usage:**
```bash
# Enable BuildKit (default in Docker Desktop)
DOCKER_BUILDKIT=1 docker build -f backend.Dockerfile.optimized -t suite-backend .
```

**Result:** Cold build: 8 min → 8 min (deps still need compiling)
           Warm build: 60 sec → 15 sec (huge win)

### Strategy 2: Pre-Built Dependency Image (Advanced)

Create a reusable deps image:

```dockerfile
# backend.deps.Dockerfile
FROM python:3.14-alpine
RUN apk add --no-cache build-base libffi-dev openssl-dev
COPY backend/requirements-api.lock.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements-api.lock.txt
```

Build once:
```bash
docker build -f backend.deps.Dockerfile -t suite-backend-deps:latest .
```

Then use in main Dockerfile:
```dockerfile
FROM suite-backend-deps:latest AS base
COPY --chown=api:api backend/ ./backend/
```

**Result:** Subsequent builds reference pre-built image = **15-30 sec** (no recompilation)

### Strategy 3: Multi-Platform Builds (CI/CD Only)

Use `docker buildx`:
```bash
docker buildx build \
  --cache-from=type=registry,ref=your-registry/suite-backend:buildcache \
  --cache-to=type=registry,ref=your-registry/suite-backend:buildcache,mode=max \
  -f backend.Dockerfile.optimized \
  -t your-registry/suite-backend:latest .
```

**Result:** CI builds cache across machines = **30-60 sec on repeat**

---

## Quick Win: Use Optimized Dockerfile

Current: `docker/runtime-core/backend.Dockerfile.hardened` (no cache optimization)
Optimized: `docker/runtime-core/backend.Dockerfile.optimized` (with BuildKit cache)

**Test it:**
```bash
# First build (baseline)
time docker build -f docker/runtime-core/backend.Dockerfile.optimized -t suite-backend:v1 .

# Change one line in backend code
echo "# test" >> backend/api_server.py

# Second build (should be 15-30 sec with cache)
time docker build -f docker/runtime-core/backend.Dockerfile.optimized -t suite-backend:v2 .
```

---

## For Production: Pre-Built Dependencies

If you want builds to always be fast (even cold builds), pre-build a deps image:

**1. Create deps Dockerfile:**
```dockerfile
# docker/runtime-core/backend-deps.Dockerfile
FROM python:3.14-alpine
RUN apk add --no-cache build-base libffi-dev openssl-dev git ca-certificates
COPY backend/requirements-api.lock.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements-api.lock.txt
```

**2. Build and push deps image (monthly):**
```bash
docker build \
  -f docker/runtime-core/backend-deps.Dockerfile \
  -t your-registry/suite-backend-deps:latest .
docker push your-registry/suite-backend-deps:latest
```

**3. Use in main build (always fast):**
```dockerfile
# docker/runtime-core/backend.Dockerfile
FROM your-registry/suite-backend-deps:latest AS base
COPY --chown=api:api backend/ ./backend/
USER api
CMD ["python", "backend/api_server.py"]
```

**Result:** Every build is **20-30 sec** (no compilation, just code + registry pull)

---

## Summary

| Method | Cold Build | Warm Build | Setup |
|--------|-----------|-----------|-------|
| Current (hardened) | 10-15 min | 60 sec | None |
| **With BuildKit cache** | 10-15 min | **15-30 sec** | Just use `.optimized` |
| With deps image | 2 min | 20-30 sec | Create deps image monthly |
| With CI/CD registry cache | 5 min | 30-60 sec | GitHub Actions + registry |

**Recommendation:** Use `backend.Dockerfile.optimized` immediately (no setup, works today).

For production, set up deps image (requires monthly maintenance but guarantees fast builds).

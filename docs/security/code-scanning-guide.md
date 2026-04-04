# Code Scanning & Security Quality Guide

This guide explains why Suite runs automated code scanning, what the scanners catch, how to run them locally, and how to prevent future alerts.

---

## Why we do this

GitHub runs **CodeQL** (security-and-quality suite) and **njsscan** (Node.js SAST) on every push to `main` and every PR. These appear in the repo's **Security → Code scanning** tab.

In April 2026 we hit **152 accumulated alerts** — a mix of genuine security issues, dead code, and noise from vendored third-party bundles. At that volume, real vulnerabilities hide in the noise. We cleaned them up in one pass and now maintain the scanning backlog at (or near) zero.

### What was wrong

| Category | Count | Root cause |
|----------|-------|-----------|
| Format-string / log injection | 8 | Logger passed user-derived strings as format-string first arg to `console.*` |
| Insecure randomness | 1 | `Math.random()` fallback in session ID generator |
| Clear-text logging of env vars | 4 | Diagnostic payloads logged to stdout without redacting `projectRef` and other env-derived fields |
| Insecure temp file creation | 2 | Direct `writeFileSync` without atomic write-then-rename |
| Unused variables / imports | 8 | Dead declarations left behind after refactors |
| Dead assignments | 10 | Variables initialized with values that are immediately overwritten in every code path |
| Trivial / redundant conditionals | 8+ | Guards that are always true after earlier early returns |
| Unused React state | 1 | `errorInfo` stored in state but never rendered |
| Vendored third-party noise | ~50 | Lighthouse bundle, archived docs flagged for quality issues |

### What we did

1. **Added `.github/codeql-config.yml`** with `paths-ignore` for vendored/third-party/testdata paths to eliminate ~50 noise alerts.
2. **Fixed format-string injection** — logger now uses `console.log("%s", formattedMessage, data)` to prevent interpretation of format specifiers in user data.
3. **Replaced `Math.random()`** with `crypto.getRandomValues()` in session ID fallback.
4. **Redacted env-derived fields** in diagnostic log output using a `redactForLog()` helper.
5. **Used atomic writes** (write to `.tmp`, then `fs.renameSync`) for snapshot manifests.
6. **Removed all dead code** — unused variables, imports, always-overwritten initializers, redundant guards.
7. **Wired `errorInfo`** into the `ErrorBoundary` dev-mode render so the stored state is actually used.

---

## How to run CodeQL locally

### One-time setup

```bash
# Download CodeQL CLI bundle (~765 MB)
curl -sL https://github.com/github/codeql-action/releases/latest/download/codeql-bundle-linux64.tar.gz \
  -o /tmp/codeql-bundle.tar.gz
tar xzf /tmp/codeql-bundle.tar.gz -C /tmp
```

### Run a scan

```bash
# Create the database
/tmp/codeql/codeql database create /tmp/codeql-db \
  --language=javascript-typescript \
  --source-root=.

# Run the security-and-quality suite (same queries GitHub uses)
/tmp/codeql/codeql database analyze /tmp/codeql-db \
  --format=sarif-latest \
  --output=/tmp/results.sarif \
  -- codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls

# For Python:
/tmp/codeql/codeql database create /tmp/codeql-db-py \
  --language=python \
  --source-root=.

/tmp/codeql/codeql database analyze /tmp/codeql-db-py \
  --format=sarif-latest \
  --output=/tmp/results-py.sarif \
  -- codeql/python-queries:codeql-suites/python-security-and-quality.qls
```

### View results

- Open the `.sarif` file in VS Code with the [SARIF Viewer extension](https://marketplace.visualstudio.com/items?itemName=MS-SarifVSCode.sarif-viewer)
- Or parse with: `python3 -c "import json; d=json.load(open('/tmp/results.sarif')); print(len(d['runs'][0]['results']), 'alerts')"`

---

## CodeQL config: `.github/codeql-config.yml`

```yaml
paths-ignore:
  - tools/chrome-devtools-mcp/src/third_party   # vendored Lighthouse bundle
  - docs/autodraft/upgrade-archive               # archived reference code
  - docs/autodraft/reference                      # archived reference code
  - scripts/testdata                              # test fixture data
```

**When to update:** If you add new vendored or third-party code, add its path here so scanning noise doesn't drown real alerts.

---

## Prevention rules (how to avoid new alerts)

### Security

| Rule | Why | Fix |
|------|-----|-----|
| Never use `Math.random()` for IDs, tokens, or session keys | Predictable output; CodeQL flags as `js/insecure-randomness` | Use `crypto.randomUUID()` or `crypto.getRandomValues()` |
| Never pass user-derived data as console format string | First arg is interpreted for `%s`, `%d`, etc.; CodeQL flags as `js/tainted-format-string` and `js/log-injection` | Use `console.log("%s", message)` |
| Never log env vars or secrets to stdout | Tokens and project refs leak to CI logs; CodeQL flags as `js/clear-text-logging` | Redact sensitive fields with a `redactForLog()` helper |
| Use atomic file writes for important data | Crash during `writeFileSync` leaves partial files; CodeQL flags as `js/insecure-temporary-file` | Write to `.tmp` path, then `fs.renameSync()` |
| Validate dynamic method names | CodeQL flags `obj[userInput]()` as `js/unvalidated-dynamic-method-call` | Allowlist valid method names before calling |

### Quality

| Rule | Why | Fix |
|------|-----|-----|
| Remove unused variables and imports | Noise in scans and reviews; CodeQL flags as `js/unused-local-variable` | Delete the declaration |
| Don't initialize variables that are immediately overwritten | `let x = "default"; if (...) x = "a"; else x = "b";` — the initial value is dead; CodeQL flags as `js/useless-assignment-to-local` | Declare without initializer: `let x: string;` |
| Don't guard after early returns | After `if (!project) return;`, every reference to `project` is non-null; CodeQL flags redundant `project &&` as `js/trivial-conditional` | Remove the redundant guard |
| Don't store state you never read | `this.setState({ errorInfo })` without rendering it is dead code; CodeQL flags as `js/react/unused-or-undefined-state-property` | Either render it or remove it |
| Exclude vendored code from scanning | Third-party bundles generate dozens of alerts you can't fix | Add paths to `.github/codeql-config.yml` |

---

## CI integration

### Workflows

| Workflow | File | Trigger | What it does |
|----------|------|---------|-------------|
| CodeQL | `.github/workflows/codeql.yml` | Push to `main`, PRs, weekly schedule | Runs CodeQL security-and-quality for JS/TS and Python |
| njsscan | `.github/workflows/njsscan.yml` | Push to `main`, PRs | Runs njsscan SAST, uploads SARIF |
| CI | `.github/workflows/ci.yml` | Push to `main`, PRs | Lint, typecheck, unit tests, build |

### Checking alerts

1. Go to **Security → Code scanning** in the GitHub repo
2. Filter by **Tool** (CodeQL or njsscan) and **Branch** (your PR branch)
3. Fix any new alerts your changes introduce before requesting review

---

## Quick reference

```bash
# Validate before push
npm run check          # lint + typecheck
npm run test:unit      # unit tests

# Run CodeQL locally (after one-time setup above)
/tmp/codeql/codeql database create /tmp/codeql-db --language=javascript-typescript --source-root=.
/tmp/codeql/codeql database analyze /tmp/codeql-db --format=sarif-latest --output=/tmp/results.sarif \
  -- codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls
```

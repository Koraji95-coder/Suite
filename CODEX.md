# CODEX — Agent Guidance for Suite

This document is for **Codex, Copilot, and any other AI coding agent** working in this repository. It explains recurring issues we've hit, why they matter, and the rules to follow so they don't happen again.

> **CRITICAL — Read this entire section before writing ANY code.** PII leaks have been the single most common agent mistake in this repo. Every commit you make must be clean.

---

## 1. No personal or company information in committed files

### Why it matters

- Real usernames and local paths expose developer identity and machine layout.
- Company and project names leak client information into a public (or semi-public) repo.
- Automated scanners (njsscan, CodeQL) may flag these, and manual reviewers will reject them.
- **This has happened multiple times.** Previous agent sessions introduced PII that had to be cleaned up across 40+ files. Do not repeat this.

### Mandatory replacement table

When writing or modifying **any** file — including test fixtures, placeholder strings, documentation, sample data, and generated manifests — use these generic replacements:

| Category | ❌ Banned (real) | ✅ Required (generic) |
|---|---|---|
| Windows user path | `C:\Users\DustinWard\...` | `C:\Users\Dev\...` |
| Repo-relative staged path | `C:/Users/<anyone>/Documents/GitHub/Suite/output/...` | `output/...` (relative) |
| Company name | `Root 3 Power` | `Company` |
| Project name (client) | `Nanulak` | `MyProject` |
| Project number (specific) | `R3P-25074` | `PROJ-00001` |
| Workstation ID | `DUSTIN-HOME` | `DEV-HOME` |
| Workstation ID (work) | `DUSTIN-WORK` | `DEV-WORK` |
| Display name | `Dustin`, `Dustin Ward` | `Dev`, `Dev User` |
| Email | `dustinward...@outlook.com`, `koraji95coder@gmail.com` | `dev@example.com` |
| Shared-drive folder | `R3P RESOURCES` | `Company Resources` |
| Shared-drive path | `G:\Shared drives\Root 3 Power\...` | `G:\Shared drives\Company\...` |
| Fixture manifest paths | Absolute `C:/Users/*/...` for `stageRoot`, `stagedRoot`, `path`, `stagedFile` | Repo-relative path starting at `output/` |
| Placeholder filenames | Avoid names that hint at real deliverables | Use descriptive but generic names like `source-file.dxf` |

> **Note:** The `R3P-` prefix (e.g. `R3P-{number}-E6-0001`) is a **product convention** used in drawing number generation logic (`projectDrawingProgramService.ts`). This prefix is part of the application's business logic and should NOT be removed from service code or regex patterns. Only replace **specific** project numbers like `R3P-25074` → `PROJ-00001` in test data. When a test uses the service to generate drawing numbers, expect the service output format (e.g. `R3P-00001-E6-0001`).

### Where to check — EVERY file type matters

Previous cleanup attempts missed test files because agents only checked UI code. **Check ALL of these:**

- `src/**/*.test.ts` and `src/**/*.test.tsx` — **largest source of leaks** (test fixture data)
- `backend/tests/**` — Python test data with sample paths and workstation IDs
- `src/features/**/ui/*.tsx` — `placeholder` attributes in `<input>` elements
- `output/**/*.json` — generated fixture manifests
- `src/routes/**/generated/*.json` — auto-generated doc manifests
- `docs/**/*.md` — documentation with example paths and workstation names
- `tools/**/*.json` — workstation profiles and MCP config
- Any file touched by a scaffolding or staging script

### Pre-commit audit — MUST run before every commit

```bash
# Run from repo root — MUST return zero results
grep -rni \
  -e 'DustinWard' \
  -e 'Dustin Ward' \
  -e 'Root 3 Power' \
  -e 'R3P RESOURCES' \
  -e 'Nanulak' \
  -e 'R3P-25074' \
  -e 'DUSTIN-HOME' \
  -e 'DUSTIN-WORK' \
  -e 'dustinward' \
  --include='*.ts' --include='*.tsx' --include='*.py' --include='*.json' --include='*.mjs' --include='*.md' --include='*.toml' \
  . | grep -v node_modules | grep -v '.git/' | grep -v 'CODEX.md'
```

**If this returns any results, fix them before committing.** Do not commit with known PII.

---

## 2. Fixture manifests use relative paths

The staging scripts in `scripts/` generate `output/autodesk-acade-regression-fixtures/manifest.json`. The `stageRoot`, `stagedRoot`, `stagedFile`, and per-file `path` fields **must** be repo-relative (starting at `output/`), never absolute.

The `sourceRoot` and `sourceFile` fields **may** contain absolute Windows paths (`C:/Program Files/Autodesk/...`) because they reference the AutoCAD install directory, which is not user-specific.

---

## 3. Test data uses generic identifiers

Test files across **both** `backend/tests/` and `src/**/*.test.*` often need Windows-style absolute paths, project numbers, or workstation IDs. Always use these generic values:

- Paths: `C:\Users\Dev\...` (not a real username)
- Project numbers: `PROJ-00001` or `00001` (not real project numbers)
- Workstation IDs: `DEV-HOME` or `DEV-WORK` (not real machine names)
- Project names: `MyProject` or `MyProject Substation` (not real client names)

The test logic doesn't depend on these being real — it only needs structurally valid values.

---

## 4. UI placeholders are generic

`placeholder` attributes in React input elements should use generic examples:

```tsx
// ✅ Good
placeholder="C:\\Projects\\MyProject"
placeholder="G:\\Shared drives\\Company\\Projects\\ProjectName"

// ❌ Bad — these are real company/client identifiers
placeholder="C:\\Projects\\R3P-25074"
placeholder="G:\\Shared drives\\Root 3 Power\\Projects\\Nanulak"
```

---

## 5. General agent rules (recap from copilot-instructions.md)

- **Linter/formatter:** Biome only. Never ESLint or Prettier.
- **Indentation:** Tabs.
- **Quotes:** Double quotes in JS/TS.
- **Imports:** ESM only. CommonJS is banned.
- **TypeScript:** `noExplicitAny` is an error. Use `const`/`let` — `var` is banned.
- **CSS:** CSS Modules + global CSS. No Tailwind.
- **Validate before committing:** `npm run check` (lint + typecheck), then `npm run test:unit`.
- **No agent/chat UI** — Office owns that layer.
- **AutoCAD error envelope** must stay: `{ success, code, message, requestId, meta }`.

---

## 6. Common agent mistakes to avoid

1. **Partial PII sweeps.** When fixing PII, search ALL file types (`.ts`, `.tsx`, `.py`, `.json`, `.md`, `.mjs`), not just the ones you're editing. Run the audit command above.
2. **Changing generated output expectations without checking the service logic.** If a service generates `R3P-{number}-...` prefixed drawing numbers, the test expectations must match that format.
3. **Overwriting previously sanitized content.** If you regenerate a manifest or other artifact, verify the output doesn't re-introduce PII from source files.
4. **Ignoring test files.** Test fixtures are the most common place PII hides — they contain realistic sample data that was often copied from real projects.

---

## 7. Code quality and security scanning (CodeQL / njsscan)

### Why this matters

GitHub runs **CodeQL** (security-and-quality suite) and **njsscan** (SAST) on every push to `main` and every PR. These scanners produce alerts that appear under the repo's **Security → Code scanning** tab. Left unchecked, they accumulate into a large backlog (we hit 152 alerts at one point) that makes it hard to spot real vulnerabilities.

Fixing these proactively keeps the signal-to-noise ratio healthy and prevents genuine security issues from hiding among dozens of quality warnings.

### What the scanners catch

| Scanner | What it flags | Example rules |
|---------|--------------|---------------|
| **CodeQL** (security) | Injection, insecure crypto, clear-text secrets, SSRF, prototype pollution | `js/tainted-format-string`, `js/insecure-randomness`, `js/clear-text-logging`, `js/shell-command-injection-from-environment` |
| **CodeQL** (quality) | Dead code, unused variables, trivial conditionals, useless assignments | `js/unused-local-variable`, `js/useless-assignment-to-local`, `js/trivial-conditional` |
| **njsscan** | Node.js-specific SAST (eval, dangerous APIs, insecure patterns) | Uploaded as SARIF alongside CodeQL |

### How to run CodeQL locally

```bash
# 1. Download CodeQL CLI (one-time, ~765 MB)
curl -sL https://github.com/github/codeql-action/releases/latest/download/codeql-bundle-linux64.tar.gz \
  -o /tmp/codeql-bundle.tar.gz
tar xzf /tmp/codeql-bundle.tar.gz -C /tmp

# 2. Create the database (scans source)
/tmp/codeql/codeql database create /tmp/codeql-db \
  --language=javascript-typescript \
  --source-root=.

# 3. Run the security-and-quality suite (same as GitHub default setup)
/tmp/codeql/codeql database analyze /tmp/codeql-db \
  --format=sarif-latest \
  --output=/tmp/results.sarif \
  -- codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls

# 4. View results — open the SARIF file or use a VS Code SARIF viewer extension
```

### CodeQL configuration

The repo uses `.github/codeql-config.yml` to exclude paths that produce noise:

```yaml
paths-ignore:
  - tools/chrome-devtools-mcp/src/third_party   # vendored Lighthouse bundle
  - docs/autodraft/upgrade-archive               # archived reference code
  - docs/autodraft/reference                      # archived reference code
  - scripts/testdata                              # test fixture data
```

If you add new vendored or third-party code, add its path here to avoid drowning real alerts in noise.

### Rules for writing new code (prevent future alerts)

1. **Never use `Math.random()` for IDs, tokens, or anything security-adjacent.** Use `crypto.randomUUID()` or `crypto.getRandomValues()` instead.
2. **Never pass user-derived data as the first argument to `console.log/warn/error/info`.** Use `console.log("%s", message)` or pass the data as a separate argument to avoid format-string injection.
3. **Never log environment variables or secrets to stdout.** If you must log a payload that contains env-derived fields (like `projectRef`), redact them first. Write a `redactForLog()` helper if needed.
4. **Remove unused variables, imports, and dead assignments.** Biome catches some of these, but CodeQL catches more (e.g., `let x = initial; x = overwritten` where the initial is dead). Don't declare variables you don't read.
5. **Don't guard with a condition that is always true or always false.** After an early return (e.g., `if (!project) return`), every subsequent reference to `project` is guaranteed non-null — remove redundant `project &&` guards.
6. **Use atomic file writes for important data.** Write to a `.tmp` sibling, then `fs.renameSync()` into place. This prevents partial writes if the process crashes.
7. **Don't store state you never read.** If you store `errorInfo` in React state but never render it, either render it (e.g., in dev mode) or remove it.
8. **Exclude vendored/third-party code from scanning.** Update `.github/codeql-config.yml` if you add new vendored bundles.

### Pre-PR security check

Before opening a PR, glance at the **Security → Code scanning** tab on your branch (GitHub shows alerts per-PR). If your changes introduce new alerts, fix them before requesting review.

If you can run CodeQL locally (see above), run it against your branch to catch issues before push.


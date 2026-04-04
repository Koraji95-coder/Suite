# CODEX — Agent Guidance for Suite

This document is for **Codex, Copilot, and any other AI coding agent** working in this repository. It explains recurring issues we've hit, why they matter, and the rules to follow so they don't happen again.

---

## 1. No personal or company information in committed files

### What went wrong

Hardcoded personal paths, real usernames, company names, and internal project identifiers were committed across the codebase:

| What leaked | Where it appeared |
|---|---|
| `C:/Users/<RealName>/...` | `manifest.json`, test assertions |
| Company name (`Root 3 Power`) | UI placeholder strings |
| Internal project IDs (`R3P-25074`) | UI placeholder strings |
| Real project names (`Nanulak`) | UI placeholder strings, `.wdp` path examples |
| Shared-drive paths (`G:\Shared drives\R3P RESOURCES\...`) | Generated JSON manifests |

### Why it matters

- Real usernames and local paths expose developer identity and machine layout.
- Company and project names leak client information into a public (or semi-public) repo.
- Automated scanners (njsscan, CodeQL) may flag these, and manual reviewers will reject them.

### The fix rules

When writing or modifying **any** of the following, use the generic replacements shown:

| Category | Bad (real) | Good (generic) |
|---|---|---|
| Windows user path | `C:\Users\DustinWard\...` | `C:\Users\Dev\...` |
| Repo-relative staged path | `C:/Users/<anyone>/Documents/GitHub/Suite/output/...` | `output/...` (relative) |
| Company name | `Root 3 Power` | `Company` |
| Project name (client) | `Nanulak`, `R3P-25074` | `MyProject`, `PROJ-00000` |
| Shared-drive path | `G:\Shared drives\Root 3 Power\...` | `G:\Shared drives\Company\...` |
| Fixture manifest paths | Absolute `C:/Users/*/...` for `stageRoot`, `stagedRoot`, `path`, `stagedFile` | Repo-relative path starting at `output/` |
| Placeholder filenames | Avoid names that hint at real deliverables | Use descriptive but generic names like `source-file.dxf` |

### Where to check

These file types are the most likely to contain leaks:

- `output/**/*.json` — generated fixture manifests
- `backend/tests/**` — test data and assertions with sample paths
- `src/features/**/ui/*.tsx` — `placeholder` attributes in `<input>` elements
- `src/routes/**/generated/*.json` — auto-generated doc manifests
- Any file touched by a scaffolding or staging script

### Quick audit command

```bash
# Run from repo root — should return zero results
grep -rn \
  -e 'DustinWard' \
  -e 'Root 3 Power' \
  -e 'R3P RESOURCES' \
  -e 'Nanulak' \
  -e 'R3P-25' \
  --include='*.ts' --include='*.tsx' --include='*.py' --include='*.json' --include='*.mjs' \
  . | grep -v node_modules | grep -v '.git/'
```

---

## 2. Fixture manifests use relative paths

The staging scripts in `scripts/` generate `output/autodesk-acade-regression-fixtures/manifest.json`. The `stageRoot`, `stagedRoot`, `stagedFile`, and per-file `path` fields **must** be repo-relative (starting at `output/`), never absolute.

The `sourceRoot` and `sourceFile` fields **may** contain absolute Windows paths (`C:/Program Files/Autodesk/...`) because they reference the AutoCAD install directory, which is not user-specific.

---

## 3. Test data uses generic identifiers

Test files under `backend/tests/` often need Windows-style absolute paths for assertions. Always use `C:\Users\Dev\...` (not a real username). The test logic doesn't depend on the username — it only needs a structurally valid Windows path.

---

## 4. UI placeholders are generic

`placeholder` attributes in React input elements should use generic examples:

```tsx
// ✅ Good
placeholder="C:\\Projects\\MyProject"
placeholder="G:\\Shared drives\\Company\\Projects\\ProjectName"

// ❌ Bad
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

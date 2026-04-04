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
| Workstation ID | `DUSTIN-HOME` | `DEV-WORKSTATION` |
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
grep -rn \
  -e 'DustinWard' \
  -e 'Root 3 Power' \
  -e 'R3P RESOURCES' \
  -e 'Nanulak' \
  -e 'R3P-25074' \
  -e 'DUSTIN-HOME' \
  --include='*.ts' --include='*.tsx' --include='*.py' --include='*.json' --include='*.mjs' --include='*.md' \
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
- Workstation IDs: `DEV-WORKSTATION` (not real machine names)
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

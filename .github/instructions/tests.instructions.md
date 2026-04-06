---
applyTo: "**/*.test.ts,**/*.test.tsx,backend/tests/**"
---
- CRITICAL: Never use real names, company names, or machine paths in test data
- Use these generic values: `Dev` for usernames, `Company` for company names, `MyProject` for project names, `PROJ-00001` for project numbers, `DEV-HOME` or `DEV-WORK` for workstation IDs
- Windows paths in tests: `C:\Users\Dev\...` (never real usernames)
- Run the PII audit grep from CODEX.md before committing any test file change
- Frontend tests use Vitest + Testing Library
- Backend tests use pytest
- Test fixtures use repo-relative paths starting at `output/`, not absolute paths

---
applyTo: "backend/**/*.py"
---
- All routes must return the error envelope: `{ success, code, message, requestId, meta }`
- Never echo raw exception text in route responses
- Use `pip-compile` for dependency locking, never `pip freeze`
- Security tests go in `backend/tests/test_api_*.py`
- Run `npm run check:security:routes` after any route changes
- Python version is defined in `.python-version` at the repo root

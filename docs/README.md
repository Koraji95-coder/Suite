# Vigilant Space Robot Docs

Central documentation hub for this workspace.

## Sections

- [Backend: Coordinates Grabber API](backend/coordinates-grabber-api.md)
- [Development: Command Center](development/command-center.md)
- [Development: Public Rollout Readiness](development/public-rollout-readiness.md)
- [Security: Environment & Secrets](security/environment-and-secrets.md)
- [Security: Supabase RLS Hardening](security/supabase-rls-hardening.md)
- [Security: Supabase Apply + Verify](security/supabase-apply-and-verify.md)

## Documentation Policy

- Keep all long-form docs in this `docs/` folder.
- Use local README/API files only as short pointers to the canonical doc in `docs/`.
- Prefer updating existing docs pages instead of creating duplicate notes in feature folders.

## Runtime Matrix

- Frontend app (`npm run dev`): runs in this Linux workspace (Codespaces/dev container) or local machine.
- Coordinates backend (`api_server.py`): runs on Windows host with AutoCAD COM support.
- Shared integration point: frontend calls backend via `VITE_COORDINATES_BACKEND_URL` and `X-API-Key`.

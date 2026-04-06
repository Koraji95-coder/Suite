---
applyTo: "scripts/**"
---
- Scripts use ESM (`import`/`export`), never CommonJS
- Guard scripts (`scripts/guard-*.mjs`) enforce repo-wide invariants — extend them, don't bypass them
- When adding new guard scripts, wire them into the `check` or `check:prepush` npm script chain
- Generated artifacts should be regenerated via their npm scripts, not hand-edited
- Supabase CLI invocations must go through `scripts/run-supabase-cli.mjs`, not raw `npx supabase`

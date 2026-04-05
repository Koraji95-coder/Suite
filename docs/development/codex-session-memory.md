# Codex Session Memory Digest

Last updated: 2026-04-05

This file is the portable replacement for machine-local Codex rollout history from `C:\Users\koraj\.codex\sessions`.

Those `.jsonl` session files are readable on the original machine, but they do not become automatic persistent memory for a fresh Codex session on another computer. Use this digest as bootstrap context instead.

## How To Use

In a new Codex session, point the agent at this file first and say to treat it as prior project context before continuing work.

## Stable Context

- Primary repo: `Suite`
- Current workspace path on this machine: `C:\Users\koraj\OneDrive\Documents\GitHub\Suite`
- Earlier sessions also used `C:\Users\DustinWard\Documents\GitHub\Suite`
- Related repo: `C:\Users\DustinWard\Documents\GitHub\Office`
- Main recent work areas: workstation transition, Office plus Runtime integration, local state restore and sync, repo cleanup after the Suite reboot, runtime and logging diagnostics, TypeScript and Vite debugging, UI overhaul planning, and frontend architecture cleanup

## Likely High-Value Docs To Read First

- `docs/runtime-control/workstation-transfer-runbook.md`
- `docs/runtime-control/workstation-bringup.md`
- `docs/development/post-bridge-tranche-handoff-2026-04-03.md`
- `docs/development/long-term-overhaul-todo-plan.md`
- `docs/development/ui-overhaul-audit-2026-03-18.md`
- `docs/development/repo-hygiene-playbook.md`

## Recent Project Themes

- 2026-04-04: workstation move planning for another computer, including repo sync and Docker image/runtime parity
- 2026-04-04: accuracy audit of package and TypeScript configuration
- 2026-04-03: frontend and architecture work around Suite branding, app feature ideas, and UI slice planning
- 2026-04-02: runtime log location investigation and TypeScript/Vite error diagnosis
- 2026-04-01: combined Office plus Runtime workstation transition, including split work across the `Office` and `Suite` repos
- 2026-03-25: repo audits for dead files, structural drift, zeroclaw residue, and Doctor/runtime/support duplication
- 2026-03-18: local state sync task scripting and dashboard/watchdog refactor targeting
- 2026-03-04: local dev bring-up issues including missing `vite` and websocket mount/dismount churn

## Notes On Older History

- The oldest captured sessions in this local archive are from 2025-09-30 and 2025-10-16
- Those older sessions appear to reference earlier codebases or earlier project naming, including `Root3power`, `R3P.*`, and a `web-panel`
- Treat those as lower-priority background context unless a current task explicitly points back to them

## Session Index

Format: `date | file | first prompt snippet`

- 2025-09-30 | `rollout-2025-09-30T05-46-32-01999a3b-27d3-74e1-a46c-25c18b8a79da.jsonl` | `R3P.Conduit` and earlier project context
- 2025-09-30 | `rollout-2025-09-30T14-00-01-01999bfe-f4cd-70a1-8888-52f98d544e64.jsonl` | `MeasurementService` and earlier `R3P` work
- 2025-10-16 | `rollout-2025-10-16T16-58-10-0199ef07-ce8d-7030-ba50-a47f90240560.jsonl` | `web-panel/tsconfig.json` configuration review
- 2026-03-04 | `rollout-2026-03-04T06-11-22-019cb8c2-873a-72c2-bad1-2eb3457007a7.jsonl` | `npm run dev` failing because `vite` was not recognized
- 2026-03-04 | `rollout-2026-03-04T06-17-31-019cb8c8-27a3-7af2-b2ad-053a07ab6f76.jsonl` | `npm run dev:full` bring-up investigation
- 2026-03-04 | `rollout-2026-03-04T19-32-03-019cbb9f-94ec-7d80-8750-59b6c0255f0c.jsonl` | websocket mount and dismount churn
- 2026-03-18 | `rollout-2026-03-18T08-19-55-019d011a-5337-7800-b31e-d7e4bdfb1898.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T09-04-36-019d0143-3b17-7b00-b6b1-1e846100e8bb.jsonl` | dashboard/watchdog refactor recommendation
- 2026-03-18 | `rollout-2026-03-18T10-33-21-019d0194-7a36-7ee1-8157-2a32d436d91a.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T10-33-26-019d0194-8e66-7522-b95d-ff634cd127ed.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T10-35-45-019d0196-adee-7c71-b6dc-bfa7ee51dc0d.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T10-35-50-019d0196-c230-71b0-905d-31cb98e36a73.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T10-43-25-019d019d-b2df-7be1-9a98-08bcbbd8be6b.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T11-24-54-019d01c3-ac9d-7160-9cd4-94a17a628c44.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T11-24-59-019d01c3-c0c7-7512-bf76-5e12ea9dcaf6.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-18 | `rollout-2026-03-18T11-25-04-019d01c3-d501-7a93-a866-caf20225b12a.jsonl` | `install-suite-local-state-sync-task.ps1`
- 2026-03-25 | `rollout-2026-03-25T18-16-47-019d2749-4a9f-75c2-992b-b32693fbb933.jsonl` | audit for remaining structural residue after the Suite reboot direction
- 2026-03-25 | `rollout-2026-03-25T18-16-47-019d2749-4abe-76c0-9244-9b71502c548f.jsonl` | audit for duplication and drift in Doctor/runtime/support architecture
- 2026-03-25 | `rollout-2026-03-25T21-29-38-019d27f9-da14-7c00-afd8-de04d1980c81.jsonl` | audit for remaining `zeroclaw-main` references or assumptions
- 2026-03-25 | `rollout-2026-03-25T21-29-39-019d27f9-da36-7032-aac7-9da51147aabb.jsonl` | audit for dead files and workshop/product split residue
- 2026-04-01 | `rollout-2026-04-01T08-10-18-019d492a-8da1-7832-8351-3ef8a13d783e.jsonl` | `restore-suite-local-state.ps1`
- 2026-04-01 | `rollout-2026-04-01T08-10-24-019d492a-a20a-7142-a2ed-f5d95e76fe05.jsonl` | `restore-suite-local-state.ps1`
- 2026-04-01 | `rollout-2026-04-01T08-10-29-019d492a-b67b-7ea1-88f9-50972256e5a8.jsonl` | `restore-suite-local-state.ps1`
- 2026-04-01 | `rollout-2026-04-01T10-45-29-019d49b8-9ea4-7eb3-b6d3-046339c62313.jsonl` | `restore-suite-local-state.ps1`
- 2026-04-01 | `rollout-2026-04-01T14-08-52-019d4a72-d2d5-75c1-a693-16ac570fe449.jsonl` | Office-side provider and settings groundwork only
- 2026-04-01 | `rollout-2026-04-01T15-12-38-019d4aad-35cf-7da3-a0d4-300ca5d197f3.jsonl` | `restore-suite-local-state.ps1`
- 2026-04-01 | `rollout-2026-04-01T15-21-25-019d4ab5-3efa-7cf3-8bf6-e1ccd9bfee21.jsonl` | implement the Office-side slice in the `Office` repo only
- 2026-04-01 | `rollout-2026-04-01T15-21-38-019d4ab5-73da-7ae2-865f-bc443dc94492.jsonl` | implement the Suite-side slice in the `Suite` repo only
- 2026-04-01 | `rollout-2026-04-01T17-54-52-019d4b41-bcfb-72c3-b26c-5657365f8003.jsonl` | `restore-suite-local-state.ps1`
- 2026-04-01 | `rollout-2026-04-01T17-55-03-019d4b41-e8e9-7a93-a3bd-08c9f4adbf4c.jsonl` | `restore-suite-local-state.ps1`
- 2026-04-01 | `rollout-2026-04-01T21-18-44-019d4bfc-601d-7de2-9ce1-36e12d3b52ff.jsonl` | continue the combined Office plus Runtime workstation transition work
- 2026-04-01 | `rollout-2026-04-01T21-19-41-019d4bfd-3f95-72c0-b54f-8ad367d26874.jsonl` | continue the combined Office plus Runtime workstation transition work
- 2026-04-01 | `rollout-2026-04-01T21-19-47-019d4bfd-566e-7993-8393-313ebb1c2162.jsonl` | continue the combined Office plus Runtime workstation transition work
- 2026-04-01 | `rollout-2026-04-01T21-19-53-019d4bfd-6e4c-7eb3-987f-f2c72e712582.jsonl` | continue the combined Office plus Runtime workstation transition work
- 2026-04-02 | `rollout-2026-04-02T00-10-37-019d4c99-bea0-7bd3-a491-eed09972aa1b.jsonl` | runtime log location and launch logging behavior for the Office/Suite runtime app
- 2026-04-02 | `rollout-2026-04-02T20-17-06-019d50ea-5187-7540-b555-eae5305843a8.jsonl` | investigate TypeScript-looking errors in the middle of `vite` output
- 2026-04-03 | `rollout-2026-04-03T07-52-02-019d5366-8ad6-7352-bc8a-c6fbb702faaa.jsonl` | `long-term-overhaul-todo-plan.md` and current planning context
- 2026-04-03 | `rollout-2026-04-03T14-42-59-019d54de-c631-7782-89d0-bcadb130419f.jsonl` | app feature ideas, index, Playwright, and package planning context
- 2026-04-03 | `rollout-2026-04-03T22-57-16-019d56a3-4e35-7cd2-8488-e5473147524c.jsonl` | branding and frontend files such as `main.tsx`, `SuiteLogo.module.css`, and architecture map work
- 2026-04-04 | `rollout-2026-04-04T00-23-32-019d56f2-4a7e-7752-9cc3-b5fc9b3759c2.jsonl` | audit `package.json` and `tsconfig.app.json` for accuracy
- 2026-04-04 | `rollout-2026-04-04T21-15-12-019d5b6c-3b10-7da1-bfdb-8128d38e4d65.jsonl` | what is needed to move to the other computer, especially repo and Docker image parity
- 2026-04-05 | `rollout-2026-04-05T00-03-20-019d5c06-26e0-7a63-9c0d-658c619635a7.jsonl` | load local `.codex\sessions` into working memory

## Practical Constraint

The raw files in `C:\Users\koraj\.codex\sessions` are machine-local artifacts. A fresh Codex session on another computer will not automatically absorb them just because the folder exists somewhere else.

This digest is the portable fallback. If you want a new agent to inherit the old context, make it read this file at the start of the session.

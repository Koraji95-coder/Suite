# Long-Term Overhaul TODO Plan

Date: April 3, 2026

This is the canonical long-term handoff and planning note for the current Suite overhaul.

Use this document when starting a new conversation. It is meant to replace chat-memory dependence with repo-owned context.

## Current Status

The original project/frontend separation lane is effectively complete.

What is already done:

- project UI ownership was moved out of `src/components/apps/projects` into feature-owned slices under `src/features/*`
- project setup/title-block browser flow was cut over to:
  - hosted core: `/api/project-setup/*`
  - Runtime Control: `/api/workstation/project-setup/*`
  - CAD/plugin: `suite-cad-authoring`
- standards checker, project review, delivery, revisions, watchdog, project detail, transmittal builder, automation studio, and project core/model ownership were separated into feature slices
- docs were reorganized into runtime-owned sections:
  - `docs/frontend`
  - `docs/backend`
  - `docs/runtime-control`
  - `docs/cad`
- the old project app tree was collapsed and removed as an active owner
- `backend/route_groups/api_title_block_sync.py` was deleted
- the old `backend/tests/test_api_title_block_sync.py` test file was deleted
- `/api/watchdog/pick-root` was removed from the live watchdog backend route

## Completed In This Tranche

The immediate project-setup/title-block cutover tranche is now complete.

What was finished:

- Runtime Control project-setup/title-block fallback was removed for scan/open/apply dispatch
- `suite-cad-authoring` now owns:
  - `suite_acade_project_open`
  - `suite_acade_project_create`
  - `suite_drawing_list_scan`
  - `suite_title_block_apply`
- shared in-process title-block selection/update logic was consolidated so markup authoring and project setup use the same core behavior
- stale compatibility docs/startup assumptions were rewritten to stop describing retired paths as active architecture
- `docs/development/post-overhaul-feature-backlog.md` was created as the deferred execution queue
- architecture metadata and generated documentation manifests were refreshed
- the conservative cleanup for this tranche targeted tracked stale references and generated artifacts rather than ignored local `bin`, `obj`, and `__pycache__` folders

## What Is Not Finished Yet

The broader overhaul is not done yet.

The main unfinished areas are:

- broader backend/runtime/CAD cleanup outside the project/title-block slice
- named-pipe bridge reclassification from remaining transport to diagnostic-only
- conservative tracked cleanup for other legacy support files, tests, and stale assets
- UI/design system overhaul
- future release/install/hosted-lane work
- post-overhaul backlog execution
- ML / APS staging

## Immediate Next Tranche

### 1. Broader runtime/CAD cleanup beyond project setup

Goal:

- reduce remaining bridge-backed CAD execution paths and make ownership explicit outside the project-setup/title-block slice

Tasks:

- audit the remaining bridge-backed consumers across:
  - AutoDraft
  - batch find/replace
  - terminal authoring
  - conduit-route / broader `api_autocad` flows
- decide the target owner per slice:
  - hosted core
  - Runtime Control
  - `suite-cad-authoring`
- cut over the next highest-value slice without changing CAD business behavior
- preserve backward-compatible AutoCAD error envelopes:
  - `success`
  - `code`
  - `message`
  - `requestId`
  - optional `meta`

### 2. Reclassify named-pipe bridge toward diagnostic-only

Goal:

- stop treating the bridge as a default path once the remaining consumers are explicitly mapped

Tasks:

- document the exact remaining bridge-backed consumers
- remove default/canonical wording as each slice is migrated
- keep the bridge available only where still required until each slice has a replacement

### 3. Finish conservative tracked cleanup

Goal:

- remove tracked stale compatibility files without turning this into a top-level repo reshape

Tasks:

- delete tracked legacy tests/docs/assets that only existed for retired compatibility paths
- keep ignored local `bin`, `obj`, and `__pycache__` folders out of repo-cleanup work
- do not normalize `backend/Transmittal-Builder` yet

### 4. Hold backlog execution until the runtime/CAD lane is clearer

Goal:

- keep the new backlog usable without interleaving product backlog work into unfinished architecture cleanup

Tasks:

- use `docs/development/post-overhaul-feature-backlog.md` as the queue once the next runtime/CAD slice is scoped
- keep `docs/app feature ideas.md` as raw intake and `docs/app-feature-roadmap-opinions.md` as opinion/analysis

## After The Immediate Tranche

### Phase B: UI And Design Overhaul

Goal:

- improve the Suite and Runtime Control visual system without reintroducing Tailwind-style sprawl

Rules:

- keep global CSS + CSS Modules
- keep primitives and tokens central
- do not let each route invent its own layout language

Target work:

- refine semantic tokens and surface hierarchy
- normalize shell/layout patterns
- clean page-level rhythm and spacing
- unify Suite + Runtime Control visual language without forcing identical implementations

### Phase C: Release-Ready Architecture

Goal:

- stay dev-first while making production/release more realistic

Likely shape:

- hosted core for shared web/backend logic
- Windows companion for machine-local capabilities
- CAD/plugin for in-process AutoCAD execution

Likely work:

- production-like image build lane
- companion installer/update plan
- environment separation:
  - local dev
  - hosted smoke
  - release build

### Phase D: ML / APS Staging

These should happen after the overhaul, not during it.

High-confidence future lanes:

- transmittal title-block confidence scoring
- AutoDraft markup assistance
- replacement ranking
- anomaly detection / reporting support
- APS Viewer SDK exploration for browser-side review, block browsing, and traceability workflows

Constraints:

- ML stays assistive, not deterministic CAD authority
- APS Viewer work should be staged against real Suite workflows, not as a random SDK branch

## Questions Still Expected From Dustin

Future chats should expect recurring product-direction questions, especially around:

- what belongs on hosted core vs Windows companion vs CAD/plugin
- what business logic must stay server-owned
- what local actions are required vs optional
- what feature ideas are worth productizing vs just using as inspiration
- what UI direction should define the next design overhaul

That is normal and expected. The architecture is clearer now, but later tranches still need product decisions.

## How To Resume In A New Conversation

Use a message like:

`Read docs/development/long-term-overhaul-todo-plan.md and continue the next major tranche.`

If the new conversation is specifically about feature planning, use:

`Read docs/development/long-term-overhaul-todo-plan.md and docs/app-feature-roadmap-opinions.md, then propose the next backlog cut.`

If the new conversation is specifically about APS / ML staging, use:

`Read docs/development/long-term-overhaul-todo-plan.md and docs/app feature ideas.md, then assess APS Viewer SDK and ML staging for Suite.`

## Recommended Priority Order

1. Move into the broader runtime/CAD cleanup lane
2. Reclassify named-pipe bridge toward diagnostic-only
3. Finish conservative tracked cleanup
4. Plan the UI/design overhaul
5. Stage release-ready architecture
6. Revisit ML and APS integration
7. Execute backlog items from `docs/development/post-overhaul-feature-backlog.md`

# App Feature Roadmap And Opinions

This note is the opinionated filter layer on top of [App Feature Ideas](./app%20feature%20ideas.md).

The raw ideas note stays broad and messy on purpose. This document is the narrower answer to:

- which ideas feel like real Suite product work
- which ideas should wait until after the current overhaul
- which ideas should probably stay as inspiration instead of becoming features
- where each idea belongs in the architecture

## Overall Opinion

The strongest ideas in the current note are the ones that:

- save repetitive drafting/review time
- fit P&C and drawing-package workflows directly
- can stay deterministic
- layer cleanly onto the hosted core + Windows companion + CAD execution split

The weakest ideas are the ones that are vague, overly generic, or look like marketable CAD “magic” without a clear repeatable workflow win.

## Recommendation Buckets

### Build Soon After Overhaul

- Crosswires
- Link Data
- Batch find and replace

### Build Later

- Drawing List Manager additional ideas
- Dimension sets
- Express Auto Align
- time-saved graphs / digitizer-style reporting

### Explore Only If A Real Need Shows Up

- Earthplex lite ideas
- more apps from the shared drive app library
- the unnamed Autodesk App Store links in the “More ideas” section

### Probably Skip As A Product Lane

- AI CAD GPT as a primary product direction
- Tinkercad as a core Suite direction

## Item-By-Item Opinions

### Crosswires

**Opinion:** strong fit.

Why:

- It is small enough to ship.
- It is immediately visible to end users.
- It fits the deterministic CAD lane better than a lot of the flashier ideas.
- It pairs naturally with the future wiring/AutoConduit/AutoDraft execution lane if you keep it style-driven instead of heuristic-heavy.

What I would build:

- a deterministic crosswire tool with company-specific style presets
- preview/apply support
- standards-backed default styles per project or profile

Where it belongs:

- hosted core: project/profile defaults and audit
- Windows companion: command dispatch
- CAD/plugin: actual wire crossing geometry and draw/apply behavior

Risk:

- low if you keep it deterministic
- medium if you try to make it “smart” before the wiring lane is stable

### Link Data

**Opinion:** one of the best ideas in the note.

Why:

- It maps to a real design-review pain point.
- It is useful even before deep CAD automation is complete.
- It has value in both DWG and PDF review worlds.
- It creates traceability, which fits Suite’s broader review/readiness/transmittal identity.

What I would build:

- drawing-to-drawing references
- symbol/equipment cross-reference indexing
- exported or companion-generated PDF hyperlink packs
- project-aware navigation between source sheets, detail sheets, and linked references

Where it belongs:

- hosted core: link graph, indexing, review metadata, persistence
- browser: navigation UX, cross-reference views, review workflows
- Windows companion/CAD: optional source extraction from drawings
- PDF export layer: hyperlink generation

Risk:

- medium, because it can sprawl if you try to solve every link type at once

My recommendation:

- start with sheet-to-sheet and item-to-sheet links, not arbitrary graph everything

### Drawing List Manager Additional Ideas

**Opinion:** good, but should stay disciplined.

Why:

- You already have a meaningful Drawing List Manager lane.
- This should evolve from your real drafting standard, not from generic database screens.
- It can become a backbone feature if tied directly to your electrical standard and package workflows.

What I would build:

- standard-aware drawing metadata validation
- issue-set aware drawing selection
- package pairing with issued PDFs and workbook rows
- controlled sync against your actual electrical drafting standard

Where it belongs:

- hosted core: project metadata, persistence, validations, package relationships
- browser: list UX, review, overrides, issue-set context
- Windows companion/CAD: optional extraction and sync helpers

Risk:

- medium if it turns into a generic admin database instead of a drafting/package workflow tool

### Dimension Sets

**Opinion:** useful later, especially for conduit/wiring quantity and reporting.

Why:

- Measurement and takeoff are real value.
- It supports future conduit/wire automation and reporting.
- It also creates a path toward hard ROI metrics.

What I would build:

- deterministic polyline/path measurement
- grouped totals by system/type/run
- export to reports and package summaries

Where it belongs:

- CAD/plugin: geometry truth and measurement
- hosted core: saved measurements, rollups, reporting
- browser: summaries, filters, exports

Risk:

- medium if attempted before geometry conventions are stable

### AI CAD GPT

**Opinion:** not a product pillar.

Why:

- It sounds more like branding than a reliable workflow.
- The failure mode is high: users think it understands more than it actually does.
- Your strongest value is deterministic drafting and review acceleration, not chat-for-everything.

What I would allow:

- assistant overlays
- suggestion UIs
- explain/locate/help workflows

What I would not do:

- make it the primary CAD execution surface
- let it silently issue geometry or mutate drawings without deterministic review gates

Where it belongs if used at all:

- browser and hosted core as an assistive layer

Risk:

- high if treated as a core workflow engine

### Express Auto Align

**Opinion:** good utility, not a top-tier platform feature.

Why:

- Cleanup tools matter.
- Dirty drawings are real.
- Alignment/cleanup can save time in nasty legacy files.

What I would build:

- safe align/cleanup commands
- preview/apply
- object-class scope filters

Where it belongs:

- Windows companion + CAD/plugin

Risk:

- low to medium, depending on how destructive the command gets

### Earthplex Lite

**Opinion:** maybe useful, but not clearly core to Suite right now.

Why:

- It sounds potentially relevant to physical design, but the current Suite center of gravity is still review, drafting workflows, standards, package readiness, and CAD productivity.

My recommendation:

- keep it in the exploration bucket unless your physical-design lane becomes a first-class product lane

Risk:

- medium opportunity cost; it can distract from more central workflows

### Batch Find And Replace

**Opinion:** very strong feature candidate.

Why:

- It is repetitive work.
- It has immediate productivity value.
- It can serve both CAD text workflows and broader document/package prep workflows.
- It is naturally deterministic if built correctly.

What I would build:

- preview-first batch find/replace
- scoped runs by project, drawing set, selection, attribute type, text type
- safety report before apply
- result export and undo-friendly receipts

Where it belongs:

- hosted core: job definition, receipts, saved presets, audit
- browser: scope builder, preview, review
- Windows companion/CAD: actual DWG-side text operations
- optional document lane: PDF/text package find/replace later

Risk:

- low if preview-first and scoped

### More Apps At Work / Shared App Library

**Opinion:** useful as research intake, not as a roadmap by itself.

Why:

- A bucket of apps is not a product direction.
- It is only useful after triage.

How I would use it:

- inventory each app
- classify by workflow solved
- discard generic clutter quickly
- only carry forward ideas that align with Suite’s core lanes

Recommendation:

- treat `G:\Shared drives\Company Resources\APPS` as a research queue, not an implementation list

### Transmittal Builder Reference

**Opinion:** keep as a benchmark/reference, not as an active branch of truth.

Why:

- You already believe Suite’s internal version is the better active lane.
- The older tool is still useful as a regression and workflow reference.

Recommendation:

- use it to compare feature parity and practical UX
- do not let it compete with the current Suite transmittal lane as a second source of truth

### Digitizer / Time Saved Graphs

**Opinion:** good later-stage product instrumentation.

Why:

- Time-saved reporting is valuable for adoption and internal proof.
- It is not the right thing to optimize before the core workflows are stable.

What I would build later:

- feature usage telemetry
- accepted suggestion counts
- run durations
- package-prep time deltas
- standards-review time deltas

Where it belongs:

- hosted core + analytics/reporting

### ProView

**Opinion:** unclassified right now.

Why:

- The name alone is too ambiguous.
- I do not want to build plans around a product I cannot positively identify from the current note.

Recommendation:

- do not plan around it yet
- identify the actual executable, vendor, or workflow first

### “More Ideas” Autodesk Links

**Opinion:** needs manual triage.

Why:

- Right now they are just links without problem statements.
- A link by itself is not enough to rank.

Recommendation:

- for each one, add:
  - what problem it solves
  - who uses it
  - how often the problem appears
  - whether Suite already partially solves it

### Scikit-learn And PyTorch

**Opinion:** useful, but only after the overhaul and only as assistive intelligence.

Best fits:

- transmittal title-block confidence scoring
- AutoDraft markup interpretation assistance
- replacement ranking
- anomaly detection in telemetry/review pipelines

Bad fits:

- primary CAD geometry issuance
- silent deterministic business-rule overrides

Where it belongs:

- hosted core or local-only promoted model workflows, depending on the domain

### Tinkercad

**Opinion:** not a core Suite lane.

Why:

- It is too far from the main product shape.
- At best it is inspiration for onboarding, education, or very light interaction patterns.

Recommendation:

- keep as peripheral inspiration only

## Suggested Roadmap

### Phase 1: Finish Stabilization

- finish this overhaul cleanly
- remove stale adapters and stale docs
- lock the hosted core / companion / CAD ownership model

### Phase 2: High-ROI Deterministic CAD Productivity

- Batch find and replace
- Crosswires
- targeted drawing-list-manager enhancements

### Phase 3: Navigation And Traceability

- Link Data
- PDF hyperlink/export workflows
- sheet/item traceability across packages

### Phase 4: Quantification And Analytics

- Dimension sets
- package and drafting metrics
- time-saved graphs and operations reporting

### Phase 5: Assistive Intelligence

- local ML scoring/ranking where it actually helps
- never as a substitute for deterministic CAD/package logic

## Final Opinion

If I were choosing where to invest next after the overhaul, the order would be:

1. Batch find and replace
2. Link Data
3. Crosswires
4. Drawing List Manager enhancements
5. Dimension sets

That order matches the best combination of:

- repeatable value
- deterministic implementation
- architectural fit
- visibility to users
- leverage across the rest of Suite

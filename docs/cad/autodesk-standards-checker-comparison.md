# Autodesk Standards Checker Comparison And Flow

This is the canonical comparison between Autodesk's built-in standards surfaces and Suite's standards-checker workflow.

## Local Autodesk Signals On This Workstation

- Core command inventory includes `STANDARDS`, `CHECKSTANDARDS`, and `STANDARDSVIOLATION` in [AcCommandWeight.xml](C:/Program%20Files/Autodesk/AutoCAD%202026/Acade/UserDataCache/en-US/Electrical/UserSupport/AcCommandWeight.xml).
- ACADE wire-layer editing exposes direct DWS controls like `add_dws`, `rmv_dws`, and `dws_ie_flags` in [wdwirlay.dcl](C:/Program%20Files/Autodesk/AutoCAD%202026/Acade/Support/en-US/wdwirlay.dcl).
- The local reference pack already captures standards-family menu catalogs and related lookup data in [autocad-electrical-2026-suite-integration-playbook.md](../development/autocad-electrical-2026-suite-integration-playbook.md) and [autocad-electrical-2026-reference-pack.md](../development/autocad-electrical-2026-reference-pack.md).
- ACADE also exposes project-oriented standards data around `ace_electrical_standards.mdb` through the AutoLISP surface documented in [AutoCAD Electrical 2026 AutoLISP Reference API Documentation.md](../development/AutoCAD%20Electrical%202026%20AutoLISP%20Reference%20API%20Documentation.md).

## What Autodesk Gives Us

### Core AutoCAD Standards

- Drawing standards files (`.dws`) and native standards commands.
- Native CAD checks are about drawing-definition drift: layers, linetypes, styles, and standards-file compliance.
- This lane is local-CAD execution, not package workflow.

### ACADE Standards-Aware Surface

- Standards-family symbol/menu catalogs such as JIC, NFPA, IEEE, IEC, and IEC 60617.
- Wire-layer and electrical-standards data that affect how ACADE interprets project content.
- Catalog/lookup/reference data that helps Suite choose the right CAD family or symbol lane.

## What Suite Gives Us

- Project/package context.
- Standards evidence tied to review, waivers, issue sets, and transmittals.
- Browser review workflows that combine standards findings with title-block, revision, and setup follow-up.
- Drawing-backed review evidence persisted through `drawing_annotations`.

## Current Gap

Suite's current standards checker is not the same thing as Autodesk's native standards checker.

- The browser standards-pack selector is still Suite-owned, but the package-review run path is no longer fake or sample-driven.
- The active package-review lane now dispatches through hosted-core ticketing into Runtime Control and then into the in-process CAD host for a deterministic read-only project inspection.
- The drawing-evidence lane is still persisted and useful, but it is distinct from the package-level native review record.
- Autodesk standards-family data is available today as reference context through `/api/autocad/reference/standards`, not as the literal primary execution engine.

## Recommended Flow

1. The project or package selects a standards profile in Suite.
2. Suite loads Autodesk standards-family reference data to choose the right CAD context:
   - JIC / NFPA for North American defaults
   - IEEE / IEC / IEC 60617 where appropriate
3. If the operator needs native CAD standards validation, the request goes through Runtime Control into the CAD layer.
4. The CAD layer owns local AutoCAD/ACADE execution:
   - native standards command usage
   - DWS-aware checks where applicable
   - wire-layer or standards-database reads tied to the active project
5. Suite ingests the resulting findings as a hosted latest-review record and then folds that into package evidence.
6. Review, readiness, issue sets, and transmittals continue to use Suite as the source of truth for blockers, waivers, and package status.

## Ownership Boundary

### Browser / Suite Frontend

- Select project/package scope.
- Show Autodesk standards-family context.
- Present findings, waivers, and review decisions.

### Hosted Core

- Persist standards evidence and review decisions.
- Feed project review, readiness, issue-set, and transmittal workflows.
- Provide read-only Autodesk reference endpoints.

### Runtime Control + CAD Layer

- Run native AutoCAD/ACADE standards commands or standards-file checks.
- Read project-local CAD standards context safely on the workstation.
- Return request-correlated results without changing the AutoCAD error envelope contract.

## Guardrails

- Do not mutate Autodesk-installed support trees in place.
- Treat shipped sample content as reference or copied regression fixtures, not as mutable runtime assets.
- Keep AutoCAD-facing error envelopes backward compatible: `success`, `code`, `message`, `requestId`, optional `meta`.
- Do not let browser-only mock checks masquerade as native CAD standards validation.

## Practical Conclusion

Autodesk standards should be treated as a CAD-native validation/input surface.
Suite standards should be treated as the package-review and evidence surface.

The correct long-term design is not to replace Suite with `CHECKSTANDARDS`.
The correct design is to let Suite orchestrate and record standards review while Runtime Control and the CAD layer own native standards execution.

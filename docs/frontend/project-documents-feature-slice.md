# Project Documents Feature Slice

This is the canonical frontend note for the project-documents slice.

## Summary

Browser-owned source of truth now lives under:

- `src/features/project-documents/*`

This slice owns the document-metadata workflow used by:

- project setup readiness
- review inbox
- issue-set review
- deliverable register pairing
- transmittal builder document matching
- drawing-list metadata normalization/export helpers

## Active Responsibilities

The project-documents slice owns:

- project document snapshot loading and short-lived caching
- mapping title-block scan rows into normalized metadata rows
- filename fallback behavior
- ACADE report parsing (`.xlsx`, `.csv`, `.tsv`)
- export-row shaping for drawing index workflows
- standard-document shaping for transmittal and package workflows

## Runtime Relationship

Project documents is browser-owned, but it composes with the project-setup slice for the underlying workstation-backed scan:

- `src/features/project-documents/service.ts`
- `src/features/project-setup/snapshotService.ts`

The active snapshot flow is:

`project-documents -> project-setup snapshot -> hosted core preview -> Runtime Control scan snapshot`

That means project-documents owns the browser-facing metadata model, while project-setup still owns the workstation-backed scan/planning contract.

## What This Slice Does Not Own

Project documents does not own:

- folder picking
- workstation-local scanning
- artifact creation
- ACADE open/create/apply
- hosted-core profile persistence

Those remain under `src/features/project-setup`, backend `project_setup`, Runtime Control, and CAD/plugin ownership.

## Current Code Roots

- `src/features/project-documents/service.ts`
- `src/features/project-documents/index.ts`

## Cleanup Outcome

The old browser-side `src/services/projectDocumentMetadataService.ts` path has been removed from active code.

Consumers should now import from:

- `@/features/project-documents`

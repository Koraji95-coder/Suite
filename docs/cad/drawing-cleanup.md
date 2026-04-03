# Drawing Cleanup

This is the canonical runtime note for the Drawing Cleanup workflow that now lives inside Batch Find & Replace.

## Ownership

- Browser surface: `/app/apps/batch-find-replace`
- Backend routes:
  - `POST /api/batch-find-replace/cad/cleanup-preview`
  - `POST /api/batch-find-replace/cad/cleanup-apply`
- Native CAD actions:
  - `suite_drawing_cleanup_preview`
  - `suite_drawing_cleanup_apply`
- Execution owner: `dotnet/suite-cad-authoring`

There is no standalone compatibility route and no separate cleanup app. Cleanup stays on the same Batch Find & Replace surface so operators can move directly from cleanup into text/attribute replacement.

## Request Shape

Both cleanup endpoints use the same request contract:

- `entryMode`: `current_drawing` or `import_file`
- `preset`: `full`, `text`, `blocks`, `layers`, `overlap`, or `import_full`
- optional `sourcePath`
- optional `saveDrawing`
- optional `timeoutMs`

`cleanup-apply` also accepts:

- `selectedFixIds`
- `approvedReviewIds`

## Response Shape

Cleanup responses keep the standard AutoCAD envelope:

- `success`
- `code`
- `message`
- `requestId`
- optional `meta`
- optional `warnings`
- optional `data`

The cleanup `data` payload includes:

- `summary`
- `deterministicFixes`
- `reviewQueue`
- optional `drawing`

## Behavior

- Deterministic fixes are preselected in preview.
- Ambiguous layer/text/overlap work is queued into `reviewQueue` and should not apply silently.
- `current_drawing` targets the active AutoCAD document.
- `import_file` loads a DXF/DWG into the native host, runs cleanup, and can save the cleaned drawing.
- `import_full` is only valid with `entryMode=import_file`.

## Scope

The current generic cleanup lane keeps only broadly useful imported-drawing remediation:

- layer normalization
- block normalization
- text normalization
- review-first overlap cleanup
- import-clean-save workflow for dirty external files

Legacy plugin loading, legacy command names, and old source-system branding were removed in this tranche.

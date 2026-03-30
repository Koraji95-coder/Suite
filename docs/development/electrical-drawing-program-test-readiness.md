# Electrical Drawing Program Test Readiness

Use this before the first focused test pass of the new `R3P Electrical v1` drawing-program workflow.

## Required Setup Before Testing

- project number is present in the saved title-block defaults
- ACADE project file (`.wdp`) exists and opens cleanly
- title block profile is already saved for the project
- template mappings exist for the electrical families you plan to provision
- you are working in a **safe copied DWG folder**, not in live production drawings

## Minimum Project State

- project root points at the intended drawing folder
- ACADE project path is saved in Suite
- the project opens from Suite into ACADE without manual browsing
- the drawing-program panel is using the built-in `R3P Electrical v1` standard unless you intentionally replaced it with a project override

## First Functional Test Scenario

1. Open the project in `Drawing List Manager`.
2. Bootstrap the minimal starter package.
3. Confirm Suite creates:
   - `E0-0000` cover
   - `E0-0001` drawing index
   - one `E6` single-line starter
4. Add six three-line drawings.
5. Confirm the planned numbering lands inside the `E6` three-line band (`0101-0200`).
6. Provision the selected rows.
7. Verify DWG files were created or copied into the safe test folder.
8. Verify `Drawing Index.xlsx` updated from the Suite-owned row set.
9. Verify the `.wdp` order matches the Suite drawing stack.
10. Verify pending title-block review is staged automatically for the affected DWGs.

## What To Check After Provision

- new rows exist in the Suite drawing program
- workbook mirror contains stable Suite row ids
- `.wdp` ordering follows the Suite row order
- title-block review lane rehydrates with the provisioned paths after reload
- no numbering crossed outside the assigned family band

## Ripple Renumber Test

After the first provision succeeds:

1. Insert one new drawing ahead of an existing three-line.
2. Preview the ripple renumber plan.
3. Confirm only the affected family band ripples.
4. Apply the plan.
5. Verify:
   - Suite rows updated
   - filenames renamed
   - workbook mirror updated
   - `.wdp` stack updated
   - title-block review was staged again for the affected set

## Workbook Reconcile Test

1. Open `Drawing Index.xlsx` manually.
2. Make a small safe edit such as:
   - title change
   - status change
   - order change inside the same family band
3. Save the workbook.
4. Return to Suite and confirm workbook drift is surfaced.
5. Run `Preview workbook reconcile`.
6. Approve only the intended changes.

Do not treat direct workbook edits as authoritative. Reconcile stays preview-first.

## Known Non-Goals For This Test Pass

- no free-text cross-reference rewriting in unmanaged drawings
- no family-band overflow testing against live production files
- no automatic title-block apply
- no ACADE-native object authoring beyond the project-stack sync

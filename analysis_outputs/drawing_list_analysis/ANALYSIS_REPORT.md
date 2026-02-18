# Drawing List Analysis Report

Location: `/workspaces/Suite/analysis_outputs/drawing_list_analysis/`

This report documents:
- what standards / rules were identified in the research materials
- what was implemented in `drawing_list_manager.py` to address them
- where each rule came from (file + function/section references)

## Materials Reviewed (sources)

### Drawing list research module
- `/workspaces/Research/drawing_list/drawing_list_manager.py`
  - Contains the reference implementation for drawing list ingestion, header normalization/aliasing, parsing, and row validation.

### Transmittal builder research module
- `/workspaces/Research/transmittal_builder/transmittal_builder.py`
  - Contains the reference implementation for building transmittal outputs from normalized drawing metadata.

### Target implementation updated
- `/workspaces/Suite/analysis_outputs/drawing_list_analysis/drawing_list_manager.py`
  - Updated with expanded docstrings to explicitly encode standards, validation intent, and traceability to the research sources.

> Note on “R3P-SPEC” citations: no explicit `R3P-SPEC` text/sections were found in the provided research directories during scanning. All citations in the updated docstrings therefore point to the research code files above (which appear to embody the practical rules). If an R3P-SPEC document exists elsewhere in the repo, provide its path and I can add exact section citations.

## Standards / Rules Identified

### 1) Header normalization and tolerant column matching
**Standard/rule:** Drawing list spreadsheets may use different header names for the same concept; the system must normalize and map them to canonical internal keys.

**Evidence/source:**
- `Research/drawing_list/drawing_list_manager.py` implements header normalization and alias handling.
- `Research/transmittal_builder/transmittal_builder.py` follows a normalize-before-validate pattern for inputs used in transmittal rows.

**Implementation in Suite file:**
- `normalize_column_name()` docstring now documents the normalization behavior and rationale.
- `detect_header_mapping()` docstring now documents the canonical keys, heuristic nature, and source rationale.

**Why it matters:**
- Prevents brittle failures when a client uses “DWG#” instead of “Drawing Number”, etc.

### 2) Required column validation
**Standard/rule:** A drawing list must contain a minimum set of canonical fields to be usable for transmittal creation.

**Evidence/source:**
- `Research/drawing_list/drawing_list_manager.py` includes required-field expectations.
- `Research/transmittal_builder/transmittal_builder.py` requires stable identifiers to create transmittal line items.

**Implementation in Suite file:**
- `validate_required_columns()` docstring now describes required canonical columns, return behavior (missing list), and cites both research modules.

### 3) Sheet number parsing (numeric normalization)
**Standard/rule:** Sheet numbers should be normalized to integers when possible to support ordering/grouping; non-numeric values should not crash parsing.

**Evidence/source:**
- `Research/drawing_list/drawing_list_manager.py` normalizes sheet numbers for sorting/validation.

**Implementation in Suite file:**
- `parse_sheet_number()` docstring documents rules: empty→None, numeric→int, non-numeric→None, with examples.

### 4) Revision normalization
**Standard/rule:** Revision is a required identifier for transmittals; format can vary, so normalize consistently (trim/uppercase) and validate presence rather than enforce a single global regex.

**Evidence/source:**
- `Research/transmittal_builder/transmittal_builder.py` carries revision as an identifier in transmittal rows.
- `Research/drawing_list/drawing_list_manager.py` normalizes/validates revision.

**Implementation in Suite file:**
- `parse_revision()` docstring documents: empty→None, strip, uppercase, and cites both research sources.

### 5) Row-level validation for transmittal readiness
**Standard/rule:** Each row must have enough metadata to uniquely identify and describe a drawing for transmittal purposes.

**Evidence/source:**
- `Research/drawing_list/drawing_list_manager.py` contains row validation checks.
- `Research/transmittal_builder/transmittal_builder.py` requires drawing identifiers + title + revision to build the register.

**Implementation in Suite file:**
- `validate_row()` docstring documents implemented checks:
  - `drawing_number` present
  - `title` present
  - `revision` present
  - `sheet_number` numeric if present

### 6) End-to-end ingestion pipeline
**Standard/rule:** Prefer producing a complete error report rather than failing fast; drawing lists are often partially correct.

**Evidence/source:**
- `Research/drawing_list/drawing_list_manager.py` structure implies ingest→normalize→validate→outputs.

**Implementation in Suite file:**
- `build_drawing_list()` docstring documents pipeline stages and return values (`clean_df`, `errors_df`) and cites research modules.

## What Was Implemented (summary)

### Updated `drawing_list_manager.py`
- Added expanded, traceable docstrings for every function in the file:
  - purpose and behavior
  - validation rules
  - examples
  - citations to the research code files that motivated the logic

No functional behavior changes were introduced in this pass; the update is documentation/traceability focused per request.

## Gaps / Follow-ups

1. **R3P-SPEC citations not possible with provided inputs**
   - No R3P-SPEC document or section markers were found in `/workspaces/Research/drawing_list/` or `/workspaces/Research/transmittal_builder/`.
   - If you provide the R3P-SPEC file path (PDF/MD/etc.), I can:
     - extract exact section references
     - update docstrings and YAML to cite those sections directly

2. **Standards extraction could be expanded**
   - If additional standards exist (status codes, discipline codes, drawing numbering regex), they may live in other project folders or config files not included in the two research directories.


# AutoCAD Electrical Project-Level Sidecar Files

This document is the canonical reference for the project-level sidecar files that AutoCAD Electrical 2026 creates and manages alongside a `.wdp` project. Suite reads and inspects these files but does **not** create or own them.

## Ownership boundary

All sidecar files listed here are **ACADE-managed**. AutoCAD Electrical creates, updates, and resolves them. Suite should never write fake copies of these files to simulate a project. If Suite needs to seed or copy fixtures for test workspaces, it must use the Autodesk-provided sample/demo project trees only.

See [Project Flow Reference](../development/autocad-electrical-2026-project-flow-reference.md) for the authoritative notes on project creation, activation, and `.wdp` lifecycle.

## Primary project file

### `.WDP` — AutoCAD Electrical Project Definition

- The root project file. A plain-text file with any name and the `.WDP` extension.
- Lists the complete path to each drawing included in the project.
- Encodes the folder structure defined in Project Manager, used to organize drawings for the AutoCAD Electrical toolset.
- Stores the description, section, and sub-section values assigned to each drawing.
- Contains default settings that are referenced when new drawings are created and added to the project.
- Suite should treat the `.wdp` as the root anchor for resolving all other sidecar paths and Autodesk search sequences.

## Auto-managed secondary files

### `.AEPX` — AutoCAD Electrical Project eXtension

- A secondary XML-format project state file managed entirely by AutoCAD Electrical.
- AutoCAD Electrical recreates this file automatically if it is deleted.
- Suite should treat it as read-only presence evidence; the absence of `.aepx` does not mean the project is corrupt.

## Title block and label sidecars

### `.WDT` — Title Block Mapping

- Controls how drawing attribute values are mapped to title block fields when AutoCAD Electrical updates title blocks across project drawings.
- Contains field-name-to-attribute-name mappings for the title block automation routines.
- Resolved by ACADE using Autodesk search sequence "A": explicit path first, then the Autodesk user support folder, then the active project's `.wdp` folder.
- Suite reads `.WDT` presence during project inspection to determine whether a custom title block mapping is in effect. Suite does not write or modify `.WDT` files.

### `.WDL` — Project Label / LINEx Customization

- Contains project-level label text overrides for LINE1 through LINE-N fields used in title block and report output.
- Allows per-project label customization without changing shared library files.
- Resolved relative to the active `.wdp` or via Autodesk search sequence "A".
- Suite reads `.WDL` presence to report available label customization. Suite does not write `.WDL` files.

## Catalog and component lookup

### `*_CAT.MDB` / `DEFAULT_CAT.MDB` — Catalog Database

- Microsoft Access (`.MDB`) database files that provide the component catalog lookup for schematic symbols and panel footprints.
- The project may reference a named catalog (e.g. `MyProject_CAT.MDB`) or fall back to `DEFAULT_CAT.MDB` in the ACADE support path.
- Resolved via Autodesk search sequence "B": catalog/panel support paths checked before general AutoCAD support paths.
- Suite does not modify catalog databases. References to catalog MDB files surface in Suite's project inspection output for diagnostics.

## Instance and location defaults

### `.INST` — Component Instance Defaults

- A text file storing default values for component instance fields (manufacturer, catalog number, assembly code, etc.) used when inserting new schematic symbols.
- Resolved relative to the active project folder or via Autodesk search sequence "A".
- Suite reads `.INST` presence as a project context signal. Suite does not write `.INST` files.

### `.LOC` — Location Code Defaults

- A text file listing the default location codes (installation/location tag values) applicable to the project.
- Resolved relative to the active project folder or via Autodesk search sequence "A".
- Suite reads `.LOC` presence as a project context signal. Suite does not write `.LOC` files.

## Wire and conductor sidecars

### `.WDW` — Wire Color / Gauge Label Mappings

- Contains the wire color and wire gauge label definitions used by AutoCAD Electrical wire numbering and conductor labeling routines.
- Resolved via Autodesk search sequence "A".
- Suite reads `.WDW` presence during project inspection. Suite does not write `.WDW` files.

## Resolution model summary

| Sidecar | Autodesk search sequence | Suite ownership |
|---|---|---|
| `.WDP` | N/A — explicit path required | Read (root anchor) |
| `.AEPX` | Co-located with `.WDP` | Read-only (presence check) |
| `.WDT` | A (explicit → user support → project folder) | Read (inspection only) |
| `.WDL` | A (explicit → user support → project folder) | Read (inspection only) |
| `*_CAT.MDB` | B (catalog/panel → general AutoCAD) | Read (diagnostics only) |
| `.INST` | A (explicit → user support → project folder) | Read (inspection only) |
| `.LOC` | A (explicit → user support → project folder) | Read (inspection only) |
| `.WDW` | A (explicit → user support → project folder) | Read (inspection only) |

## Suite integration notes

- When Suite inspects an existing ACADE project it should anchor on the `.wdp` file and enumerate sidecars that are co-located or resolved via the WD.ENV search sequences.
- Suite must never create `.wdp`, `.wdt`, `.wdl`, or related project files itself to mimic an ACADE project. Pass the intended project root path into the ACADE-side flow as an operator intent or plugin argument instead.
- For regression test workspaces, use Autodesk sample/demo project fixtures as the source rather than hand-crafted fake sidecar files. See [AutoCAD Electrical 2026 Regression Fixtures](../development/autocad-electrical-2026-regression-fixtures.md).
- The `.aepx` is recreated on demand by ACADE; its absence must not be treated as a project error by Suite inspection logic.

## See also

- [AutoCAD Electrical 2026 Project Flow Reference](../development/autocad-electrical-2026-project-flow-reference.md) — project creation, activation, and `.wdp` lifecycle
- [AutoCAD Electrical 2026 Reference Pack](../development/autocad-electrical-2026-reference-pack.md) — consolidated local reference pack
- [AutoCAD Electrical 2026 Regression Fixtures](../development/autocad-electrical-2026-regression-fixtures.md) — safe fixture selection for test workspaces
- [Named Pipe Bridge](./named-pipe-bridge.md) — Suite ↔ ACADE transport layer

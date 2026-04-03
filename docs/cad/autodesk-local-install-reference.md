# Autodesk Local Install Reference

This note is the canonical inventory of local-only Autodesk material under `C:\Program Files\Autodesk\AutoCAD 2026` that is useful to Suite architecture and CAD/runtime work.

## High-Value Categories

### AutoCAD Electrical sample projects and catalogs

- `Acade\\UserDataCache\\My Documents\\Acade 2026\\AeData\\Proj\\*`
- `Acade\\UserDataCache\\My Documents\\Acade 2026\\AeData\\en-US\\catalogs\\*.mdb`
- `Acade\\UserDataCache\\My Documents\\Acade 2026\\AeData\\en-US\\Plc\\ace_plc.mdb`
- `Acade\\en-US\\DB\\*.mdb`

Why it matters:

- Suite now has a local reference source for real `.wdp`, `.wdt`, `.wdl`, `.dwg`, PLC, and catalog data instead of relying only on hand-written fixtures.
- These paths are useful for local validation, exploratory testing, and reverse-engineering expected ACADE data shape.

### Electrical support and command metadata

- `Acade\\Support\\en-US\\attribconfig.xml`
- `Acade\\UserDataCache\\en-US\\Electrical\\UserSupport\\AcCommandWeight.xml`

Why it matters:

- `attribconfig.xml` is a concrete reference for ACADE attribute names and sequencing.
- `AcCommandWeight.xml` confirms shipped command names such as `AEPROJECT`, `AEUPDATETITLEBLOCK`, `AETAGTERMINAL`, and `AETERMINALSTRIP`.

### Database and external connectivity samples

- `Sample\\Database Connectivity\\CAO\\caotest.lsp`
- `Sample\\Database Connectivity\\CAO\\caotest.dvb`
- `Sample\\Database Connectivity\\db_samples.mdb`
- `Sample\\ActiveX\\ExternalCall\\readme_ActiveXCall.txt`
- `Sample\\ActiveX\\ExtAttr\\readme_ActiveXExtract.txt`

Why it matters:

- Autodesk still ships example patterns for ADO/OLE DB/CAO-driven drawing-to-database workflows.
- These are useful for understanding interoperability boundaries and legacy host expectations.
- They are not a signal that Suite should move its primary runtime back to VBA/COM-centric architecture.

### Visual LISP and reactor samples

- `Sample\\VisualLISP\\reactors\\*.lsp`
- `Sample\\VisualLISP\\External\\*.lsp`
- `Tutorial\\VisualLISP\\readme.txt`
- `vl16.tlb`
- `vlcom.dll`

Why it matters:

- These samples show Autodesk-supported patterns for dialog loading, reactors, command/event reaction, and COM access from the AutoCAD side.
- They are useful references when Suite needs to understand in-process AutoCAD behavior or compare plugin behavior against LISP-era patterns.

### Design Automation and console activity manifests

- `Design Automation\\Bin\\Activities\\*.json`
- Example: `Design Automation\\Bin\\Activities\\AutoCAD.PlotToPdf+prod.json`

Why it matters:

- Autodesk ships concrete `AcCoreConsole.exe` activity patterns for batch/offline work such as plotting, publish, and block metadata extraction.
- This is useful reference material for future offline CAD batch lanes or worker-style processing.

## What This Changes For Suite

- Prefer Autodesk-shipped sample projects and catalog data as local reference material when validating ACADE assumptions.
- Keep `suite-cad-authoring` and Runtime Control as the primary execution architecture.
- Treat VBA/ActiveX/Visual LISP/database samples as interoperability references, not as the target runtime model.
- Use the command catalog and support XML files as reference inputs when validating command names or attribute parsing logic.

## Guardrail

- Do not copy Autodesk sample projects, databases, or other install assets into the Suite repo unless licensing explicitly allows it.
- Use local install paths for exploration and build Suite-owned sanitized fixtures when committed test data is needed.

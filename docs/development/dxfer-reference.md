# ETAP DXF Cleanup Tool — AutoCAD .NET Plugin

## Overview

This AutoCAD .NET plugin loads DXF files exported from ETAP and automatically fixes common issues: misaligned text, overlapping labels, improperly scaled blocks, and messy layer organization. It runs inside AutoCAD as a set of custom commands.

## Build in This Repository (Current)

Use the committed solution/project directly:

```bash
dotnet build src/components/apps/dxfer/EtapDxfCleanup.sln -v minimal
```

The project auto-detects AutoCAD managed DLLs in this order:

1. `/p:AutoCadInstallDir=...` MSBuild property
2. `AUTOCAD_INSTALL_DIR` environment variable
3. `C:\\Program Files\\Autodesk\\AutoCAD $(AutoCadVersion)` (defaults to `2026`)
4. fallback probes for `2026..2022`

Framework target auto-selects based on `AutoCadVersion`:

- `2025+` -> `net8.0-windows`
- `2024 and below` -> `net48`

Override when needed with `/p:AutoCadTargetFramework=...`.

## In-App Trigger (Current Backend Bridge)

Suite can queue plugin commands through the backend route:

- `POST /api/etap/cleanup/run`

Example payload:

```json
{
  "command": "ETAPFIX",
  "pluginDllPath": "C:\\AutoCAD\\Plugins\\EtapDxfCleanup.dll",
  "waitForCompletion": true,
  "timeoutMs": 90000,
  "saveDrawing": false
}
```

Allowed commands:

- `ETAPFIX`
- `ETAPTEXT`
- `ETAPBLOCKS`
- `ETAPLAYERFIX`
- `ETAPOVERLAP`
- `ETAPIMPORT`

---

## How It Works (Step by Step)

### 1. ETAP Exports a DXF

ETAP (Electrical Transient Analyzer Program) exports single-line diagrams (SLDs) as DXF files. These exports typically have:

- **Text overlapping bus bars, cables, and equipment blocks**
- **Labels stacked on top of each other** (voltage, current, power factor all piled up)
- **Blocks at inconsistent scales or rotations**
- **No layer discipline** — everything dumped on layer 0 or a few generic layers
- **Dimension text too small or too large** relative to the drawing scale

### 2. AutoCAD Opens the DXF

AutoCAD natively reads DXF. When you open a `.dxf` in AutoCAD, it becomes a standard drawing database (`.dwg` in memory). This is important — once opened, the .NET API treats it identically to any DWG file.

### 3. The Plugin Scans and Fixes

The plugin registers custom commands (typed into AutoCAD's command line) that:

| Command | What It Does |
|---|---|
| `ETAPFIX` | Runs the full cleanup pipeline |
| `ETAPTEXT` | Fixes only text alignment and overlap |
| `ETAPBLOCKS` | Fixes only block scales, rotations, and positions |
| `ETAPLAYERFIX` | Reorganizes objects into proper layers |
| `ETAPOVERLAP` | Detects and resolves overlapping entities |

### 4. The Fix Pipeline

```
Open DXF in AutoCAD
        │
        ▼
┌─────────────────────┐
│  Layer Cleanup       │  Organize entities into logical layers
│  (buses, cables,     │  (BUSES, CABLES, EQUIPMENT, TEXT-LABELS,
│   equipment, text)   │   ANNOTATIONS, DIMENSIONS)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Block Normalization │  Standardize block scales, fix rotations,
│                      │  ensure insertion points are consistent
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Text Alignment      │  Align labels to their parent objects,
│                      │  standardize text heights, fix justification
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Overlap Detection   │  Build spatial index of all bounding boxes,
│  & Resolution        │  detect collisions, nudge text/blocks apart
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Final Cleanup       │  Purge unused blocks/layers, audit drawing
└─────────────────────┘
```

---

## Project Structure

```
EtapDxfCleanup/
├── EtapDxfCleanup.sln              # Visual Studio solution
├── EtapDxfCleanup.csproj           # Project file (targets AutoCAD .NET API)
├── Commands/
│   └── CleanupCommands.cs          # AutoCAD command definitions
├── Core/
│   ├── DrawingScanner.cs           # Scans the drawing, catalogs all entities
│   ├── TextFixer.cs                # Text alignment, sizing, justification
│   ├── BlockFixer.cs               # Block normalization (scale, rotation)
│   ├── OverlapResolver.cs          # Spatial overlap detection and nudging
│   ├── LayerOrganizer.cs           # Layer creation and entity reassignment
│   └── SpatialIndex.cs             # R-tree spatial index for fast lookups
├── Models/
│   ├── EntityInfo.cs               # Wrapper for entity + bounding box
│   └── CleanupConfig.cs            # User-configurable settings
├── Utilities/
│   ├── BoundingBoxHelper.cs        # Calculate geometric extents
│   ├── TextStyleHelper.cs          # Manage text styles
│   └── TransactionHelper.cs        # Transaction wrappers for safety
└── README.md
```

---

## Setup Instructions

### Prerequisites

1. **AutoCAD 2022+** (or any version with .NET API support)
2. **Visual Studio 2022** with C# / .NET Framework workload
3. **AutoCAD .NET API references** (ObjectARX SDK)

### Step 1: Create the Project

```
1. Open Visual Studio → New Project → Class Library (.NET Framework)
2. For AutoCAD 2025+, target `.NET 8 (Windows)`; for 2024 and below, target `.NET Framework 4.8`
3. Name it "EtapDxfCleanup"
```

### Step 2: Add AutoCAD References

Add references to these DLLs (found in your AutoCAD install directory):

```
C:\Program Files\Autodesk\AutoCAD 2026\
  ├── accoremgd.dll        (Core managed wrapper)
  ├── acdbmgd.dll          (Database/entity access)
  ├── acmgd.dll            (Application/editor/UI)
  └── AcCui.dll            (optional, for UI customization)
```

**Important**: Set `Copy Local = False` for all AutoCAD references.

In this repository, `EtapDxfCleanup.csproj` already wires these references and validates them at build time.

### Step 3: Build and Load

```
1. Build the solution (produces EtapDxfCleanup.dll)
2. In AutoCAD, type: NETLOAD
3. Browse to your bin/Debug/EtapDxfCleanup.dll
4. Type ETAPFIX to run the full cleanup
```

### Step 4: Auto-Load (Optional)

To auto-load the plugin every time AutoCAD starts, create a `.bundle` folder or add it to the `acad.lsp` startup sequence. See AutoCAD documentation for `NETLOAD` automation.

---

## Configuration

Edit `CleanupConfig.cs` to tune behavior:

```csharp
// Minimum gap between text entities (drawing units)
public double MinTextGap = 2.0;

// Standard text height for labels
public double StandardTextHeight = 2.5;

// How far to nudge overlapping items
public double NudgeDistance = 3.0;

// Block scale tolerance (blocks within this % are normalized)
public double ScaleTolerance = 0.1;

// Target layers for ETAP entity types
public string BusLayer = "BUSES";
public string CableLayer = "CABLES";
public string EquipmentLayer = "EQUIPMENT";
public string TextLayer = "TEXT-LABELS";
```

---

## How DXF → DWG Works

You do NOT need a separate conversion step. AutoCAD's `Database.ReadDwg()` and `Database.DxfIn()` methods handle this:

```csharp
// Method 1: Open DXF directly in AutoCAD (user does File → Open)
// The .NET API sees it as a normal database — no conversion needed.

// Method 2: Programmatic import
Database db = new Database(false, true);
db.DxfIn("C:\\path\\to\\etap_export.dxf", null);
// Now 'db' is a full AutoCAD database you can manipulate.

// Method 3: Save as DWG after cleanup
db.SaveAs("C:\\path\\to\\cleaned.dwg", DwgVersion.Current);
```

---

## Key AutoCAD .NET API Concepts

### Transactions
Every database modification MUST happen inside a transaction:
```csharp
using (Transaction tr = db.TransactionManager.StartTransaction())
{
    // read/write entities here
    tr.Commit(); // or changes are rolled back
}
```

### Accessing Entities
```csharp
BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
BlockTableRecord btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead) as BlockTableRecord;

foreach (ObjectId id in btr)
{
    Entity ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
    if (ent is DBText text) { /* fix text */ }
    if (ent is MText mtext) { /* fix mtext */ }
    if (ent is BlockReference blk) { /* fix block */ }
}
```

### Modifying Entities
```csharp
// Must open ForWrite to modify
DBText text = tr.GetObject(textId, OpenMode.ForWrite) as DBText;
text.Height = 2.5;
text.Position = new Point3d(newX, newY, 0);
text.Justify = AttachmentPoint.MiddleLeft;
```

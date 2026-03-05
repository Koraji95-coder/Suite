# ConduitRoute — Implementation Guide & TODO

## Cable Routing & Conduit Auto-Router for Substation P&C Design

---

## Table of Contents

1. Project Overview & Goals
2. Architecture Summary
3. Environment Setup
4. Phase 1 — Python Core Engine
5. Phase 2 — TypeScript Frontend + Python Backend
6. Phase 3 — AutoCAD .NET Integration
7. Phase 4 — Advanced Features
8. Module Implementation Details
9. AutoCAD Block Standards
10. NEC Reference Data
11. Testing Strategy
12. File Structure Reference

---

## 1. Project Overview & Goals

ConduitRoute is a cable routing and conduit management platform for substation protection & control design. It has two operational domains:

**P&C Schematic Domain** handles automated wire routing inside wiring diagrams, AC/DC wire color assignment per substation standards, cable jumpering at wire crossings, cable reference tagging, and cable/wire schedule generation.

**Physical Design Domain** handles conduit routing on plan views with foundation avoidance, cable tag annotation mode (line + text), conduit bend and pull tension calculations, raceway/trench fill analysis, 2D section cuts (stub-up, duct bank, entryway, trench), and NEC-compliant thermal/ampacity analysis.

---

## 2. Architecture Summary

The system is built in three phases. Phase 1 establishes the Python core (routing engine, NEC calculations, data model). Phase 2 adds the TypeScript/React frontend with a FastAPI backend. Phase 3 connects to AutoCAD through a .NET bridge plugin.

**Data flow:** AutoCAD Drawing → .NET Bridge reads blocks/geometry → JSON → Python Engine computes routes → JSON → .NET Bridge writes polylines/text back to drawing. The frontend connects to the Python backend via REST API for interactive use outside AutoCAD.

**Key design decision:** The .NET bridge owns all AutoCAD database transactions (reading entities, writing entities, event handling). Python owns all computation (routing, NEC calcs, schedule generation). Communication between them uses JSON-RPC or REST.

---

## 3. Environment Setup

### Python Environment

```bash
# Create virtual environment
python -m venv conduitroute-env
conduitroute-env\Scripts\activate  # Windows

# Install core dependencies
pip install fastapi uvicorn pydantic sqlalchemy
pip install pywin32 comtypes  # For AutoCAD COM (Windows only)
pip install numpy  # For thermal grid calculations
pip install openpyxl reportlab  # For schedule export (XLSX, PDF)

# Install dev dependencies
pip install pytest pytest-cov black ruff mypy
```

### Node/TypeScript Environment

```bash
# Frontend project setup
npx create-next-app@latest conduitroute-ui --typescript --tailwind
cd conduitroute-ui

# Additional dependencies
npm install three @react-three/fiber @react-three/drei  # 3D preview
npm install recharts  # Charts for NEC calc results
npm install lucide-react  # Icons
npm install zustand  # State management
```

### .NET Environment

```
Visual Studio 2022 or later
Target: .NET Framework 4.8 (for AutoCAD 2022-2025 compatibility)
NuGet: Newtonsoft.Json (JSON serialization)

AutoCAD ObjectARX SDK — download from Autodesk developer portal:
  - AcDbMgd.dll (Database)
  - AcMgd.dll (Application)
  - AcCoreMgd.dll (Core)
```

### AutoCAD Requirements

```
AutoCAD 2022 or later (for .NET 4.8 support)
  OR
AutoCAD Electrical 2022+ (for native terminal strip support)

The COM connector (Python) works with any AutoCAD version 2018+.
The .NET bridge requires matching the ObjectARX SDK version to
your AutoCAD version.
```

---

## 4. Phase 1 — Python Core Engine

### TODO Checklist

```
[  ] 4.1  Data model (SQLAlchemy ORM)
[  ] 4.2  A* routing engine with turn penalties
[  ] 4.3  Obstacle model with clearance inflation
[  ] 4.4  Wire color tables (AC/DC substation standards)
[  ] 4.5  Cable reference numbering system
[  ] 4.6  Wire crossing detection + jump insertion
[  ] 4.7  Cable tag mode (line + text annotation)
[  ] 4.8  NEC conduit fill calculator (Ch. 9 Tables 4/5)
[  ] 4.9  NEC ampacity derating (Table 310.15(C)(1))
[  ] 4.10 NEC ambient temperature correction
[  ] 4.11 Conduit bend calculation (max 360 degrees)
[  ] 4.12 Section cut SVG generator
[  ] 4.13 Cable schedule generator
[  ] 4.14 Conduit schedule generator
[  ] 4.15 CLI interface for testing
[  ] 4.16 JSON import/export for frontend communication
```

### 4.1 Data Model

Create `conduitroute/models.py` using SQLAlchemy:

```python
# Key tables:
# - Project (id, name, drawing_path, units, created_at)
# - Equipment (id, project_id, name, type, x, y, panel_name)
# - TerminalStrip (id, equipment_id, strip_id, side, strip_number, terminal_count)
# - Terminal (id, strip_id, terminal_id, full_id, x, y, index)
# - Cable (id, project_id, ref, cable_type, wire_function, color_code,
#          from_terminal_id, to_terminal_id, gauge, insulation_type)
# - CableRoute (id, cable_id, path_json, length, bend_count, bend_degrees)
# - Conduit (id, project_id, ref, conduit_type, size, from_equip, to_equip)
# - ConduitSegment (id, conduit_id, start_x, start_y, end_x, end_y)
# - ConduitCable (conduit_id, cable_id)  # junction table
# - Obstacle (id, project_id, obstacle_type, geometry_json, layer, clearance)
```

**How to implement:** Start with the Cable and Obstacle models. The routing engine consumes obstacles and produces CableRoute records. Equipment and Terminal models are needed for the terminal strip integration. Conduit models come later when you add conduit assignment.

### 4.2 A* Routing Engine

The core algorithm is in `conduitroute/routing/astar.py`. The implementation is provided in `routing_engine.py` from the previous deliverable. Key implementation notes:

**Grid discretization:** The routing area (drawing extents + padding) is divided into cells of configurable resolution (default 1.0 drawing unit = 1 foot). Smaller resolution = finer routing but slower computation.

**Turn penalty:** Each direction change adds a cost of 3.0 to 5.0 (configurable). This naturally produces clean orthogonal routes with minimal turns. Higher penalty = straighter routes with fewer bends.

**Proximity gradient:** Beyond the hard-blocked exclusion zone, a soft cost gradient discourages routes from passing too close to obstacles. This provides a natural "comfort margin" beyond the configured clearance.

**Trench corridor bonus:** Cells inside trench geometry get a negative cost (bonus), so the router preferentially routes through existing trenches.

**How to implement:** Copy `routing_engine.py` as your starting point. The `GridRouter` class is the core — `add_obstacle()` rasterizes obstacles onto the grid, and `route()` runs A* with turn penalties. Test with the `_demo()` function first.

### 4.3 Obstacle Model

The obstacle system recognizes geometry from AutoCAD layers. The layer-to-type mapping is:

```
Layer Pattern        → Obstacle Type       → Default Clearance
S-FNDN, FOUNDATION  → FOUNDATION          → 3.0 ft
S-CONC, PAD          → EQUIPMENT_PAD       → 2.0 ft
S-STRU, S-STEEL      → STRUCTURE           → 2.5 ft
A-WALL, BUILDING     → BUILDING            → 1.0 ft
E-CONDUIT            → EXISTING_CONDUIT    → 1.0 ft
E-TRENCH, TRENCH     → TRENCH             → 0.0 ft (routable)
FENCE, S-FENCE       → FENCE              → 4.0 ft
ROAD                 → ROAD               → 2.0 ft
KEEPOUT              → KEEPOUT            → 0.5 ft
```

**How to implement:** In your .NET bridge, iterate ModelSpace entities. For each entity on a matching layer, extract its bounding box (for blocks and circles) or vertex list (for polylines). Serialize as JSON and send to the Python engine. The Python engine's `load_obstacles_from_json()` method handles the rest.

**For the .NET side:** Use a `Transaction` to read all entities in a single pass. Group by layer name, filter to known obstacle layers, extract geometry. This is where .NET is dramatically faster than COM — a single transaction can read thousands of entities.

### 4.4–4.6 Wire Colors, References, Jump Detection

Wire color tables are defined in `routing_engine.py` under `WIRE_COLORS`. Cable references follow the format `{AC|DC}-{NNN}` where NNN is zero-padded sequential.

**Jump detection algorithm:**
1. After all routes are computed, build a spatial index of segments.
2. For each grid cell, check if multiple routes pass through it.
3. Where two or more routes share a cell, insert a jump symbol on the later-routed wire.
4. The jump is a half-circle arc centered on the crossing point.

### 4.7 Cable Tag Mode

Cable tag mode produces a line (typically phantom/dashed linetype) with text placed along the longest straight segment. This is for plan view cable run annotation — you pick two points, it draws the routed line, and places text like "487B-001 Z01" rotated to read along the line.

**How to implement:** The routing is identical to plan_view mode. The difference is in the output: instead of a heavy conduit polyline, you get a thin phantom line and a text entity. The `compute_tag_placement()` function in `routing_engine.py` finds the optimal text position and rotation angle.

**AutoCAD output:** The .NET bridge creates an `AcDbLine` or lightweight polyline on layer `CR-CABLE-TAG` with linetype `PHANTOM`, plus an `AcDbText` entity at the computed position with the computed rotation.

### 4.8–4.10 NEC Calculations

All NEC calculation functions are in `conduitroute/nec/`. Key formulas:

**Conduit Fill (Chapter 9 Table 1):**
- 1 conductor: max 53% fill
- 2 conductors: max 31% fill
- 3+ conductors: max 40% fill
- Fill % = (total conductor area / conduit internal area) × 100
- Conductor areas from NEC Table 5 (by gauge and insulation type)
- Conduit areas from NEC Table 4 (by conduit type and trade size)

**Ampacity Derating (Table 310.15(C)(1)):**
- 1–3 conductors: 100%
- 4–6 conductors: 80%
- 7–9 conductors: 70%
- 10–20 conductors: 50%
- 21–30 conductors: 45%
- 31–40 conductors: 40%
- 41+ conductors: 35%

**Temperature Correction (based on ambient vs. 30°C baseline):**
- 31–35°C: 94%
- 36–40°C: 88%
- 41–45°C: 82%
- 46–50°C: 75%
- 51–55°C: 67%
- 56–60°C: 58%

**Combined formula:**
```
Final Ampacity = Base Ampacity × Derating Factor × Temp Correction
```

**How to implement:** Create pure functions for each calculation. Store NEC table data as Python dicts/lists. The frontend calls these via the `/api/nec/conduit-fill` and `/api/nec/ampacity` endpoints.

### 4.11 Conduit Bend Calculation

NEC limits total bends between pull points to 360 degrees (NEC 344.26 for RGS, 358.26 for EMT, etc.). The routing engine counts bends and flags violations.

**How to implement:** After computing a route, iterate the path segments. Each direction change is a 90° bend (Manhattan routing). Sum all bends. If total exceeds 360°, warn the user to add a pull point (junction box).

**Pull point suggestion:** When a route exceeds 360°, identify the bend closest to the midpoint of the route's cumulative bend angle and suggest inserting a pull point there.

### 4.12 Section Cut Generator

Section cuts are generated as SVG. Four types are implemented in the frontend prototype: conduit stub-up, duct bank cross-section, cable trench cross-section, and building entry section.

**How to implement:** Create `conduitroute/physical/section_cut.py` with functions that accept parameters (conduit count, conduit sizes, cables per conduit, trench width, etc.) and return SVG strings. The frontend renders these directly. For AutoCAD output, the .NET bridge converts the SVG coordinates to AutoCAD entities (lines, circles, text).

### 4.13–4.14 Schedule Generation

The cable schedule is produced directly from routed cable data. Each cable produces a row:

```
Cable Ref | Type | Function | Color Code | From | To | Length | Conduit | Notes
DC-001    | DC   | Positive | RD         | RP1L1:T03 | JB1C1:T07 | 142.5ft | C-001 | —
```

The conduit schedule aggregates cables by conduit:

```
Conduit Ref | Type | Size | Fill % | Cables | CCC | Derating | Status
C-001       | EMT  | 2"   | 34.2%  | 6      | 6   | 80%      | PASS
```

**How to implement:** Query all Cable and CableRoute records from the database. For conduit schedule, join through the ConduitCable junction table. Export to CSV, XLSX (via openpyxl), or PDF (via reportlab).

---

## 5. Phase 2 — TypeScript Frontend + Python Backend

### TODO Checklist

```
[  ] 5.1  FastAPI backend scaffold
[  ] 5.2  REST API endpoints (route, nec, schedule, section)
[  ] 5.3  React project setup with Zustand state management
[  ] 5.4  Plan View canvas (SVG) with obstacle rendering
[  ] 5.5  Interactive routing (click-to-route with live preview)
[  ] 5.6  Cable tag annotation mode
[  ] 5.7  Schematic wire routing mode
[  ] 5.8  Terminal strip browser panel
[  ] 5.9  NEC calculator panel
[  ] 5.10 Section cut viewer
[  ] 5.11 Cable schedule table with export
[  ] 5.12 Conduit schedule table with export
[  ] 5.13 Route inspector panel
[  ] 5.14 Thermal heat map overlay
[  ] 5.15 Project save/load (JSON persistence)
[  ] 5.16 3D preview (Three.js, extending existing ground grid engine)
```

### 5.1 FastAPI Backend

```python
# conduitroute/api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ConduitRoute API", version="2.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# Include routers:
# app.include_router(route_router, prefix="/api/route")
# app.include_router(nec_router, prefix="/api/nec")
# app.include_router(schedule_router, prefix="/api/schedule")
# app.include_router(section_router, prefix="/api/section")
# app.include_router(acad_router, prefix="/api/acad")
```

### 5.2 API Endpoints

```
POST /api/route/compute
  Input: { start, end, mode, clearance, cable_type, wire_function, waypoints }
  Output: { path, length, bends, bend_degrees, cable_ref, warnings }

POST /api/route/batch
  Input: { cables[{ from_terminal, to_terminal }], obstacles, clearance }
  Output: { routes[], crossings[], schedule_preview }

GET  /api/nec/conduit-fill?conduit=2+EMT&wires=12AWG:6,10AWG:3
  Output: { fill_pct, limit_pct, pass, total_area, conduit_area }

GET  /api/nec/ampacity?gauge=12AWG&insulation=THHN&temp=40&conductors=6
  Output: { base, derating, temp_correction, final_ampacity }

POST /api/schedule/cable
  Input: { project_id }
  Output: { cables[{ ref, type, fn, color, from, to, length, conduit }] }

POST /api/schedule/export
  Input: { project_id, format: "csv"|"xlsx"|"pdf" }
  Output: file download

POST /api/section/generate
  Input: { type, parameters }
  Output: { svg_data }

POST /api/acad/scan
  Input: { block_name_filter }
  Output: { strips[], panels{}, terminal_count, warnings }

POST /api/acad/draw-route
  Input: { route_data from /api/route/compute }
  Output: { success, entity_handles[] }
```

### 5.5 Interactive Routing Implementation

The frontend routing canvas works like this:

1. User selects routing mode (Plan View / Cable Tag / Schematic)
2. User selects cable type (AC/DC) and wire function
3. User clicks start point on the SVG canvas
4. A pulsing indicator shows the selected start point
5. A dashed preview line follows the cursor
6. User clicks end point
7. Frontend calls `POST /api/route/compute` with start/end/mode/clearance
8. Backend runs A* and returns the path
9. Frontend renders the path as an SVG path with arc corners
10. Cable reference is auto-assigned and displayed at the path midpoint
11. For cable tag mode, tag text is placed along the longest segment

### 5.8 Terminal Strip Browser

The terminal strip browser is a tree panel in the sidebar:

```
▼ RP1 — Relay Panel 1
  ▼ Left Side
    RP1L1 (16T) ●●●●●●●●●●●●●●●●
    RP1L2 (12T) ●●●●●●●●●●●●
    RP1L3 (20T) ●●●●●●●●●●●●●●●●●●●●
  ▼ Right Side
    RP1R1 (16T) ●●●●●●●●●●●●●●●●
    RP1R2 (12T) ●●●●●●●●●●●●
▼ RP2 — Relay Panel 2
  ...
▼ JB1 — Junction Box 1
  ...
```

Clicking a terminal in the tree selects it as the start/end point for routing. Connected terminals show their wire color. The tree data comes from the AutoCAD scan via `/api/acad/scan`.

---

## 6. Phase 3 — AutoCAD .NET Integration

### TODO Checklist

```
[  ] 6.1  .NET plugin project scaffold (Class Library, ObjectARX refs)
[  ] 6.2  Command registration (IExtensionApplication)
[  ] 6.3  CROUTE command — interactive route between two picked points
[  ] 6.4  CROUTE_SCAN — scan drawing for terminal strips + obstacles
[  ] 6.5  CROUTE_TAG — cable tag annotation mode
[  ] 6.6  CROUTE_SCHEDULE — generate cable schedule to table/CSV
[  ] 6.7  CROUTE_FILL — conduit fill check on selected conduit
[  ] 6.8  CROUTE_SECTION — generate section cut at selected location
[  ] 6.9  Layer management (create CR-* layers automatically)
[  ] 6.10 Entity creation (polylines with arcs, attributed blocks, text)
[  ] 6.11 JSON-RPC bridge to Python engine
[  ] 6.12 Database reactor (auto-update when entities change)
[  ] 6.13 Jig implementation (rubber-band preview during routing)
[  ] 6.14 Palette/panel UI (WPF hosted in AutoCAD palette)
```

### 6.1 .NET Project Setup

```csharp
// ConduitRoute.Plugin/ConduitRouteApp.cs
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.ApplicationServices;

[assembly: ExtensionApplication(typeof(ConduitRoute.Plugin.ConduitRouteApp))]
[assembly: CommandClass(typeof(ConduitRoute.Plugin.Commands))]

namespace ConduitRoute.Plugin
{
    public class ConduitRouteApp : IExtensionApplication
    {
        public void Initialize()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            doc?.Editor.WriteMessage("\nConduitRoute v2.1 loaded. Type CROUTE to begin.\n");
        }
        public void Terminate() { }
    }
}
```

### 6.3 CROUTE Command

```csharp
// Pseudocode for the CROUTE command
[CommandMethod("CROUTE")]
public void RouteCommand()
{
    // 1. Prompt user to pick start point
    // 2. Prompt user to pick end point
    // 3. Scan drawing for obstacles (foundations, structures, etc.)
    // 4. Send to Python engine: POST /api/route/compute
    // 5. Receive path back as array of (x,y) points
    // 6. Create lightweight polyline with arc segments at turns
    // 7. Set layer, color, lineweight per wire function
    // 8. Place cable reference text at midpoint
    // 9. Add to cable schedule database
}
```

### 6.4 Obstacle Scanning (.NET)

```csharp
// Pseudocode for reading obstacles
public List<ObstacleData> ScanObstacles(Database db)
{
    var obstacles = new List<ObstacleData>();
    using (var tr = db.TransactionManager.StartTransaction())
    {
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        var ms = (BlockTableRecord)tr.GetObject(
            bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

        foreach (ObjectId id in ms)
        {
            var ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
            if (ent == null) continue;

            string layer = ent.Layer.ToUpper();
            if (!IsObstacleLayer(layer)) continue;

            // Extract bounding box
            var extents = ent.GeometricExtents;
            obstacles.Add(new ObstacleData
            {
                Id = ent.Handle.ToString(),
                Type = LayerToObstacleType(layer),
                MinX = extents.MinPoint.X,
                MinY = extents.MinPoint.Y,
                MaxX = extents.MaxPoint.X,
                MaxY = extents.MaxPoint.Y,
                Layer = layer
            });
        }
        tr.Commit();
    }
    return obstacles;
}
```

### 6.5 Cable Tag Command

The CROUTE_TAG command works identically to CROUTE but creates different entities:

1. Polyline on layer `CR-CABLE-TAG` with linetype `PHANTOM`
2. Text entity at the tag position with the cable designation
3. Text is rotated to align with the longest straight segment
4. Lineweight is thinner (0.18mm vs 0.35mm for conduit)

### 6.11 JSON-RPC Bridge

The .NET plugin communicates with the Python engine via HTTP:

```csharp
public class PythonBridge
{
    private static readonly HttpClient _client = new HttpClient();
    private const string BASE_URL = "http://localhost:8000/api";

    public async Task<RouteResult> ComputeRoute(RouteRequest request)
    {
        var json = JsonConvert.SerializeObject(request);
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        var response = await _client.PostAsync($"{BASE_URL}/route/compute", content);
        var result = await response.Content.ReadAsStringAsync();
        return JsonConvert.DeserializeObject<RouteResult>(result);
    }
}
```

The Python FastAPI server must be running for the .NET plugin to work. You can either start it manually or have the .NET plugin spawn the Python process on load.

---

## 7. Phase 4 — Advanced Features

### TODO Checklist

```
[  ] 7.1  3D conduit/raceway visualization (Three.js)
[  ] 7.2  Thermal heat map generation
[  ] 7.3  Pull tension calculations
[  ] 7.4  Multi-drawing cable tracking
[  ] 7.5  Cable tray fill per NEC Article 392
[  ] 7.6  Duct bank editor (conduit array layout)
[  ] 7.7  Conduit stub-up detail generator
[  ] 7.8  Bill of materials export
[  ] 7.9  SDS Tools workpoint format interop
[  ] 7.10 Batch routing (route all unrouted cables)
[  ] 7.11 Route optimization (minimize total crossings)
[  ] 7.12 Revision tracking (mark changed routes)
```

### 7.2 Thermal Heat Map

The thermal analysis module models mutual heating in conduit banks. For each conduit segment, it calculates the effective ambient temperature considering heat from adjacent conduits.

**Algorithm:**
1. Build a 2D grid over the raceway layout
2. For each conduit, compute heat output based on I²R losses
3. Model heat dissipation as a function of distance (inverse square law, simplified)
4. Sum contributions at each grid cell
5. Color-map the grid: green (cool) → yellow (warm) → red (critical)
6. Flag cells where combined derating drops below threshold

### 7.3 Pull Tension Calculations

For conduit runs, calculate the maximum pulling tension to ensure cables can be physically installed:

```
T = W × L × f × (1 + bend_factor)

Where:
  T = pulling tension (lbs)
  W = cable weight per foot (lbs/ft)
  L = conduit run length (ft)
  f = friction coefficient (0.35 typical for lubricated cable in conduit)
  bend_factor = additional tension per bend
```

NEC and manufacturer limits apply. Typical maximum sidewall bearing pressure is 300–500 lbs/ft/in.

---

## 8. Module Implementation Details

### Routing Engine Modes

| Mode | Grid Res | Turn Penalty | Obstacles | Output |
|------|----------|-------------|-----------|--------|
| SCHEMATIC | 0.5 | 3.0 | None | Heavy polyline + cable ref |
| PLAN_VIEW | 1.0 | 5.0 | Full clearance | Heavy polyline + cable ref |
| CABLE_TAG | 1.0 | 5.0 | Full clearance | Phantom line + tag text |

### AutoCAD Layer Convention

```
CR-WIRE-AC-PHA     Black    Phase A wires
CR-WIRE-AC-PHB     Red      Phase B wires
CR-WIRE-AC-PHC     Blue     Phase C wires
CR-WIRE-AC-NEU     White    Neutral wires
CR-WIRE-AC-GND     Green    AC Ground wires
CR-WIRE-DC-POS     Red      DC Positive wires
CR-WIRE-DC-NEG     White    DC Negative wires
CR-WIRE-DC-GND     Green    DC Ground wires
CR-CONDUIT         Cyan     Conduit paths
CR-CABLE-TAG       Magenta  Cable tag annotations
CR-RACEWAY         Yellow   Raceway/trench paths
CR-SECTION         Gray     Section cut viewports
CR-THERMAL         —        Thermal overlay (color by value)
CR-ANNOTATION      White    Labels and dimensions
```

### Wire Color Standards (Substation)

**AC Power:**
- Phase A: Black (BK)
- Phase B: Red (RD)
- Phase C: Blue (BL)
- Neutral: White (WH)
- Ground: Green (GN) or Green/Yellow (GN/YL)

**DC Control:**
- Positive: Red (RD)
- Negative: Black (BK)
- Positive Alternate: Blue (BL)
- Negative Alternate: White (WH)
- Ground: Green (GN)
- Return: White/Black (WH/BK)

---

## 9. AutoCAD Block Standards

### Terminal Strip Block Definition

Create a block named `TERMINAL_STRIP` with these attributes:

| Attribute Tag | Prompt | Default | Required | Example |
|---------------|--------|---------|----------|---------|
| PANEL | Panel Name | — | Yes | RP1 |
| SIDE | Side (L/R/C) | L | Yes | L |
| STRIP_NUM | Strip Number | 1 | Yes | 1 |
| STRIP_ID | Strip ID | — | No | RP1L1 |
| TERM_COUNT | Terminal Count | 20 | No | 20 |
| PANEL_DESC | Panel Description | — | No | Relay Panel 1 |

**How to create the block:**
1. Draw the terminal strip geometry (rectangle with terminal pin circles)
2. Add attribute definitions (ATTDEF command) for each tag above
3. Create the block (BLOCK command), name it `TERMINAL_STRIP`
4. Set the insertion point at the first terminal position
5. The connector will read these attributes when scanning

**Panel naming convention:**
- RP = Relay Panel
- CP = Control Panel
- JP = Junction Panel
- JB = Junction Box
- TB = Terminal Box
- MCC = Motor Control Center
- SWG = Switchgear
- PP = Protection Panel

**Strip ID format:** `{PANEL}{SIDE}{STRIP_NUM}` — examples: RP1L1, RP1R2, JB1C1

**Terminal ID format:** `{STRIP_ID}:T{NN}` — examples: RP1L1:T01, RP2R2:T15

### Cable Tag Block (Optional)

For the cable tag annotation mode, you can optionally define a `CABLE_TAG` block:

| Attribute Tag | Prompt | Example |
|---------------|--------|---------|
| CABLE_REF | Cable Reference | DC-001 |
| CABLE_TAG | Full Tag | 487B-001 Z01 |
| FROM_EQUIP | From Equipment | RP1L1:T03 |
| TO_EQUIP | To Equipment | JB1C1:T07 |

---

## 10. NEC Reference Data

### Conduit Internal Areas (NEC Table 4, sq inches)

```
Trade Size    EMT      RGS      PVC-40   PVC-80
1/2"          0.304    0.314    0.285    0.217
3/4"          0.533    0.533    0.508    0.409
1"            0.864    0.887    0.832    0.688
1-1/4"        1.496    1.526    1.453    1.237
1-1/2"        2.036    2.071    2.018    1.711
2"            3.356    3.408    3.291    2.874
2-1/2"        5.858    5.153    5.281    4.695
3"            8.846    9.521    8.085    7.268
3-1/2"        11.545   —        10.631   —
4"            15.901   16.351   14.753   13.174
```

### Conductor Areas (NEC Table 5, THHN/THWN-2, sq inches)

```
Size          Area (sq in)
14 AWG        0.0097
12 AWG        0.0133
10 AWG        0.0211
8 AWG         0.0366
6 AWG         0.0507
4 AWG         0.0824
3 AWG         0.0973
2 AWG         0.1158
1 AWG         0.1562
1/0 AWG       0.1855
2/0 AWG       0.2223
3/0 AWG       0.2679
4/0 AWG       0.3237
250 kcmil     0.3970
300 kcmil     0.4608
350 kcmil     0.5242
500 kcmil     0.7073
```

### Base Ampacity (NEC Table 310.16, Copper, 75°C column)

```
14 AWG:  20A      2 AWG:  115A     250 kcmil: 255A
12 AWG:  25A      1 AWG:  130A     300 kcmil: 285A
10 AWG:  35A      1/0:    150A     350 kcmil: 310A
8 AWG:   50A      2/0:    175A     500 kcmil: 380A
6 AWG:   65A      3/0:    200A
4 AWG:   85A      4/0:    230A
```

---

## 11. Testing Strategy

### Unit Tests

```
tests/
├── test_astar.py           # Pathfinding correctness
├── test_obstacles.py        # Clearance inflation, point-in-polygon
├── test_nec_fill.py         # Conduit fill calculations
├── test_nec_derating.py     # Ampacity derating factors
├── test_nec_temperature.py  # Temperature correction
├── test_wire_colors.py      # Color table completeness
├── test_cable_ref.py        # Reference numbering
├── test_jump_detection.py   # Wire crossing detection
├── test_tag_placement.py    # Cable tag positioning
├── test_bend_calc.py        # Bend accumulation + NEC limit
├── test_schedule.py         # Schedule generation
└── test_acad_connector.py   # COM interface (requires AutoCAD)
```

**Key test cases for the routing engine:**
- Route between two points with no obstacles → straight L-shaped path
- Route around a single obstacle → path avoids with clearance
- Route through a trench → path preferentially uses trench
- Route with waypoints → path passes through all waypoints
- Route exceeding 360° bends → warning generated
- No valid path exists → returns failure with message

**Key test cases for NEC calculations:**
- 12 × 12 AWG THHN in 3/4" EMT → 29.9% fill (pass at 40%)
- 6 conductors → 80% derating
- 40°C ambient → 88% temperature correction
- Combined: 30A × 0.80 × 0.88 = 21.1A

---

## 12. File Structure Reference

```
conduitroute/
├── api/
│   ├── main.py              # FastAPI application
│   ├── routes/
│   │   ├── route.py         # /api/route endpoints
│   │   ├── nec.py           # /api/nec endpoints
│   │   ├── schedule.py      # /api/schedule endpoints
│   │   └── acad.py          # /api/acad endpoints
│   └── models.py            # Pydantic request/response models
├── routing/
│   ├── engine.py            # RoutingEngine class
│   ├── astar.py             # GridRouter + A* implementation
│   ├── obstacles.py         # Obstacle model + clearance
│   ├── jumper.py            # Wire crossing detection
│   └── optimizer.py         # Multi-route optimization
├── wire/
│   ├── colors.py            # AC/DC color tables
│   ├── gauges.py            # Wire gauge data
│   └── reference.py         # Cable ref numbering
├── nec/
│   ├── conduit_fill.py      # Chapter 9 fill calcs
│   ├── ampacity.py          # Table 310.16 ampacities
│   ├── derating.py          # Table 310.15(C)(1) factors
│   ├── temperature.py       # Ambient temp correction
│   └── tables.py            # Raw NEC table data
├── physical/
│   ├── section_cut.py       # SVG section cut generator
│   ├── conduit_bend.py      # Bend radius + accumulation
│   ├── duct_bank.py         # Duct bank layout
│   ├── trench.py            # Trench/raceway design
│   └── thermal.py           # Heat map generator
├── schedule/
│   ├── cable_schedule.py    # Cable schedule from routes
│   ├── conduit_schedule.py  # Conduit schedule
│   └── export.py            # CSV/XLSX/PDF export
├── acad/
│   ├── connector.py         # COM connector (acad_connector.py)
│   ├── scanner.py           # Terminal strip + obstacle scanner
│   └── writer.py            # Write entities back to drawing
├── models/
│   ├── database.py          # SQLAlchemy setup
│   └── orm.py               # ORM models
├── tests/
│   └── ...                  # Test files (see section 11)
├── cli.py                   # Command-line interface
└── config.py                # Configuration (clearances, colors, etc.)

conduitroute-ui/             # React/TypeScript frontend
├── src/
│   ├── components/
│   │   ├── RouteCanvas.tsx
│   │   ├── PanelTree.tsx
│   │   ├── NecCalculator.tsx
│   │   ├── SectionCutViewer.tsx
│   │   ├── CableSchedule.tsx
│   │   ├── RouteInspector.tsx
│   │   └── ThermalOverlay.tsx
│   ├── lib/
│   │   ├── api.ts           # Backend API client
│   │   ├── routing.ts       # Client-side routing (for preview)
│   │   └── nec.ts           # Client-side NEC calcs
│   └── store/
│       └── useProjectStore.ts  # Zustand state
└── ...

ConduitRoute.Plugin/         # .NET AutoCAD plugin
├── ConduitRouteApp.cs       # IExtensionApplication
├── Commands.cs              # Command registrations
├── Scanner.cs               # Drawing entity scanner
├── EntityWriter.cs          # Polyline/text/block creation
├── PythonBridge.cs          # HTTP client to Python API
├── Models/                  # Data transfer objects
│   ├── RouteRequest.cs
│   ├── RouteResult.cs
│   ├── ObstacleData.cs
│   └── TerminalData.cs
└── UI/
    └── RoutePalette.xaml    # WPF palette for in-AutoCAD UI
```

---

## Quick Start

1. Clone the repo
2. Set up Python environment (section 3)
3. Run `python routing_engine.py` to verify the engine works
4. Run `python acad_connector.py` with AutoCAD open to test scanning
5. Start the API: `uvicorn conduitroute.api.main:app --reload`
6. Start the frontend: `cd conduitroute-ui && npm run dev`
7. Load the .NET plugin in AutoCAD: `NETLOAD` → select DLL
8. Type `CROUTE` in AutoCAD command line

---

## Other Helpful Docs that may help
https://apps.autodesk.com/ACD/en/Detail/Index?id=2161196326287749437&appLang=en&os=Win64
https://apps.autodesk.com/ACD/en/Detail/HelpDoc?appId=2161196326287749437&appLang=en&os=Win64
https://apps.autodesk.com/ACD/en/Detail/Index?id=6997702161505600235&appLang=en&os=Win32_64
https://apps.autodesk.com/ACD/en/Detail/HelpDoc?appId=6997702161505600235&appLang=en&os=Win32_64
https://apps.autodesk.com/ACD/en/Detail/Index?id=8830477268989461753&appLang=en&os=Win32_64
https://apps.autodesk.com/ACD/en/Detail/HelpDoc?appId=8830477268989461753&appLang=en&os=Win32_64

*ConduitRoute — Built for substation P&C engineers who are tired of routing wires by hand.*


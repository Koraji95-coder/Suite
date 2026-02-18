# Coordinates Grabber - Standalone Version

**Pure Python implementation | No AutoCAD required | Works on Windows, Mac, Linux**

Extract coordinate data from CAD drawings (DXF/DWG files) and generate Excel reports with reference points at geometry centers or corner positions.

## Features

### Core Capabilities
- ✅ **DXF/DWG File Support**: Read CAD files using ezdxf library
- ✅ **Flexible Extraction**: Extract points from polylines, circles, blocks, and other entities
- ✅ **Center Mode**: Single point at geometry center
- ✅ **Corners Mode**: Four points at bounding box corners (NW, NE, SW, SE)
- ✅ **Excel Export**: Generate formatted coordinate tables
- ✅ **Configuration**: JSON-based configuration files
- ✅ **Progress Reporting**: Real-time feedback during processing

### Entity Support
- LWPOLYLINE, POLYLINE (all vertices)
- LINE (endpoints)
- CIRCLE, ARC (center point)
- SPLINE (control points)
- REGION, SOLID (boundary points)
- INSERT (block insertion point)

## Installation

### Requirements
- Python 3.9+
- Operating System: Windows, macOS, or Linux

### Setup

```bash
# Clone or download the repository
cd /path/to/Suite

# Install dependencies
pip install ezdxf openpyxl

# Verify installation
python src/Ground-grid\ \&\ coordinates\ grabber/standalone_geometry.py --help
```

## Usage

### Command Line

#### Basic Usage (Center Mode)
```bash
python standalone_geometry.py input.dxf -l "Survey Points" -o output.xlsx
```

#### Extract Corner Points
```bash
python standalone_geometry.py drawing.dxf -l "Box Points" -m corners -o corners.xlsx
```

#### Custom Point Naming
```bash
python standalone_geometry.py plot.dxf -l "Controls" -p "CTRL" -s 100 -o points.xlsx
```

### Command Line Options

```
Usage: standalone_geometry.py INPUT [OPTIONS]

Positional Arguments:
  INPUT                     Input DXF or DWG file path

Optional Arguments:
  -l, --layer LAYER        Target layer name (required)
  -o, --output OUTPUT      Output Excel file path
  -m, --mode {center,corners}  Extraction mode (default: center)
  -p, --prefix PREFIX      Point ID prefix (default: P)
  -s, --start NUMBER       Starting point number (default: 1)
  -d, --decimals PLACES    Decimal places in output (default: 3)
  -c, --config FILE        Load configuration from JSON file
  -v, --verbose            Show detailed processing information
  -h, --help              Show help message
```

### Python API

#### Simple Processing
```python
from standalone_geometry import StandaloneConfig, process_file

config = StandaloneConfig(
    input_file="survey.dxf",
    output_excel="coordinates.xlsx",
    target_layer="Survey Points",
    extraction_mode="center",
)

rows, output_path = process_file(config)
print(f"Extracted {len(rows)} points to {output_path}")
```

#### With Progress Feedback
```python
def progress_handler(current: int, total: int, message: str):
    print(f"[{current:3d}%] {message}")

rows, output_path = process_file(
    config,
    progress_callback=progress_handler
)
```

#### Extract Only (No Export)
```python
from standalone_geometry import extract_geometries_from_file

rows = extract_geometries_from_file(config)
for row in rows:
    print(f"{row.point_id}: ({row.east:.3f}, {row.north:.3f}, {row.elevation:.3f})")
```

## Configuration Files

### JSON Configuration Format

Create a `config.json` file to automate processing:

```json
{
  "input_file": "/data/survey.dxf",
  "output_excel": "/output/coordinates.xlsx",
  "target_layer": "Survey Points",
  "extraction_mode": "center",
  "point_prefix": "SP",
  "start_number": 1,
  "decimal_places": 3,
  "use_blocks": true,
  "include_modelspace": true,
  "verbose": false
}
```

Run with configuration:
```bash
python standalone_geometry.py dummy.dxf -c config.json
```

The input DXF path is ignored when using `-c` config option.

## Output Format

### Excel Spreadsheet Structure

#### Center Mode Output
| Point ID | East (X) | North (Y) | Elevation (Z) | Entity Type | Layer |
|----------|----------|-----------|---------------|-------------|-------|
| P1       | 1234.567 | 5678.901  | 234.567      | LWPOLYLINE  | Survey Points |
| P2       | 1245.678 | 5689.012  | 234.578      | LWPOLYLINE  | Survey Points |

#### Corners Mode Output
| Point ID | Corner | East (X) | North (Y) | Elevation (Z) | Entity Type | Layer |
|----------|--------|----------|-----------|---------------|-------------|-------|
| P1_NW    | NW     | 1234.567 | 5689.012  | 234.567      | LWPOLYLINE  | Survey Points |
| P1_NE    | NE     | 1245.678 | 5689.012  | 234.567      | LWPOLYLINE  | Survey Points |
| P1_SW    | SW     | 1234.567 | 5678.901  | 234.567      | LWPOLYLINE  | Survey Points |
| P1_SE    | SE     | 1245.678 | 5678.901  | 234.567      | LWPOLYLINE  | Survey Points |

### Data Types
- **Point ID**: Text (e.g., P1, P1_NW)
- **Corner**: Text (NW, NE, SW, SE, or blank for center mode)
- **East, North, Elevation**: Decimal numbers with configured precision
- **Entity Type**: DXF entity type code (LWPOLYLINE, LINE, CIRCLE, etc.)
- **Layer**: Source layer name

## Examples

### Example 1: Extract Boundary Corners

Extract 4 corner points from boundary polygons in a survey drawing:

```bash
python standalone_geometry.py site_plan.dxf \
  -l "Boundary" \
  -m corners \
  -p "BOUND" \
  -o site_corners.xlsx
```

**Output**: 4 points per boundary polygon with corner labels (NW, NE, SW, SE)

### Example 2: Extract Control Points

Extract center points of control blocks:

```bash
python standalone_geometry.py survey.dxf \
  -l "Control Points" \
  -m center \
  -p "CP" \
  -s 100 \
  -o control_points.xlsx
```

**Output**: Points named CP100, CP101, CP102, etc.

### Example 3: Batch Processing with Config

Create `config.json`:
```json
{
  "input_file": "ignored.dxf",
  "output_excel": "batch_output.xlsx",
  "target_layer": "Survey Data",
  "extraction_mode": "corners",
  "point_prefix": "CTRL",
  "start_number": 1001,
  "decimal_places": 4,
  "verbose": true
}
```

Process multiple files:
```bash
for file in *.dxf; do
  python standalone_geometry.py "$file" -c config.json
  mv batch_output.xlsx "${file%.dxf}_extracted.xlsx"
done
```

## Coordinate System

### Axes Convention (Surveying Standard)
- **X-axis**: East (positive = East direction)
- **Y-axis**: North (positive = North direction)
- **Z-axis**: Elevation (positive = Up)

### Corner Positions
- **NW**: Northwest corner (min-X, max-Y)
- **NE**: Northeast corner (max-X, max-Y)
- **SW**: Southwest corner (min-X, min-Y)
- **SE**: Southeast corner (max-X, min-Y)

## Troubleshooting

### Issue: ModuleNotFoundError: No module named 'ezdxf'

**Solution**: Install the missing dependency
```bash
pip install ezdxf openpyxl
```

### Issue: FileNotFoundError: File not found

**Solution**: Check the file path
```bash
# Use absolute paths
python standalone_geometry.py /full/path/to/file.dxf -l "Layer Name"

# Or navigate to the directory first
cd /path/to/cad/files
python /path/to/standalone_geometry.py drawing.dxf -l "Layer Name"
```

### Issue: No points extracted

**Solutions**:
1. Verify the layer name is correct (case-sensitive):
   ```bash
   python standalone_geometry.py file.dxf -l "Survey Points" -v
   ```

2. Check that the layer contains geometry entities

3. Verify entity types are supported (see Entity Support section)

### Issue: DWG file not loading

**Note**: DWG support in ezdxf requires LibreDWG for full compatibility. For best results:
- Convert DWG to DXF using AutoCAD: `DXFOUT` command
- Or use professional CAD conversion tools

### Issue: Decimal places not matching

**Solution**: Adjust decimal places with `-d` option
```bash
# For 4 decimal places
python standalone_geometry.py file.dxf -l "Data" -d 4 -o output.xlsx
```

## Performance

| Operation | Time (Typical) | Notes |
|-----------|----------------|-------|
| Load DXF (1MB) | 100-200ms | First read from disk |
| Extract 1000 points | 50-100ms | Finding points on layer |
| Export Excel | 500ms-1s | CSV export much faster |
| Total (typical file) | 1-2 seconds | Most time spent in I/O |

## Limitations

1. **DWG Support**: Limited; recommend converting to DXF first
2. **Degenerate Geometries**: Lines/points return single point, not 4 corners
3. **Block Nesting**: Nested block definitions not yet supported
4. **Transformations**: Rotation/scaling of inserted blocks not applied
5. **3D Processing**: Z-coordinates averaged across geometry

## Advanced Usage

### Custom Processing Pipeline

```python
from standalone_geometry import (
    load_cad_file,
    get_entities_on_layer,
    extract_entity_points,
    bbox_corners,
    StandaloneConfig,
    export_to_excel
)

# Load file
doc = load_cad_file("drawing.dxf")

# Get entities on layer
entities = get_entities_on_layer(doc, "Survey Layer")

# Process with custom logic
rows = []
for i, entity in enumerate(entities, start=1):
    points = extract_entity_points(entity)
    
    # Custom corner extraction
    corners = bbox_corners(points)
    for corner_pt, corner_name in corners:
        # Custom processing here
        print(f"Found corner {corner_name} at ({corner_pt[0]:.2f}, {corner_pt[1]:.2f})")

# Export
config = StandaloneConfig(
    input_file="drawing.dxf",
    output_excel="output.xlsx",
    target_layer="Survey Layer",
    extraction_mode="corners"
)
export_to_excel(config, rows)
```

### Extending Entity Support

Add support for custom entity types:

```python
def extract_entity_points(entity):
    """Extended version with custom entity support."""
    # ... existing code ...
    
    ent_type = entity.dxftype()
    
    if ent_type == "MTEXT":
        # Get text insertion point
        insert = entity.dxf.insert
        points.append((float(insert[0]), float(insert[1]), float(insert[2])))
    
    # ... rest of function ...
```

## Contributing

To contribute improvements:

1. Test changes thoroughly with various DXF files
2. Follow the existing code style
3. Add docstrings for new functions
4. Test both center and corners modes
5. Verify Excel output formatting

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-18 | Initial standalone release |
| | | - Full DXF support |
| | | - Center and corners modes |
| | | - JSON configuration |
| | | - Command-line interface |

## License

See main Suite repository for licensing information.

## Support

For issues with the standalone version:
1. Check the Troubleshooting section above
2. Review the IMPLEMENTATION_GUIDE.md in the project root
3. Verify DXF file integrity with `DXF Viewer` or similar tools

---

**Last Updated**: February 18, 2026
**Status**: Stable Release (v1.0.0+)

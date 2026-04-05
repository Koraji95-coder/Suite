from __future__ import annotations

from typing import Any, Optional, Tuple


def entity_bbox(
    ent: Any,
    *,
    dyn_fn: Any,
) -> Optional[Tuple[float, float, float, float, float, float]]:
    ent = dyn_fn(ent)
    try:
        mn, mx = ent.GetBoundingBox()
        minx, miny = float(mn[0]), float(mn[1])
        maxx, maxy = float(mx[0]), float(mx[1])
        minz = float(mn[2]) if len(mn) > 2 else 0.0
        maxz = float(mx[2]) if len(mx) > 2 else 0.0
        if maxx < minx:
            minx, maxx = maxx, minx
        if maxy < miny:
            miny, maxy = maxy, miny
        if maxz < minz:
            minz, maxz = maxz, minz
        return (minx, miny, minz, maxx, maxy, maxz)
    except Exception:
        return None


def poly_centroid(
    ent: Any,
    *,
    dyn_fn: Any,
) -> Optional[Tuple[float, float, float]]:
    ent = dyn_fn(ent)
    try:
        obj_name = str(ent.ObjectName)
    except Exception:
        obj_name = ""

    coords = []
    try:
        raw = list(ent.Coordinates)
        if obj_name == "AcDb3dPolyline":
            for i in range(0, len(raw), 3):
                if i + 2 < len(raw):
                    coords.append((float(raw[i]), float(raw[i + 1]), float(raw[i + 2])))
        else:
            elev = 0.0
            try:
                elev = float(ent.Elevation)
            except Exception:
                pass  # Entity may lack Elevation property; default to 0.0
            for i in range(0, len(raw), 2):
                if i + 1 < len(raw):
                    coords.append((float(raw[i]), float(raw[i + 1]), elev))
    except Exception:
        try:
            n = int(ent.NumberOfVertices)
            elev = 0.0
            try:
                elev = float(ent.Elevation)
            except Exception:
                pass  # Entity may lack Elevation property; default to 0.0
            for i in range(n):
                p = ent.Coordinate(i)
                z = float(p[2]) if len(p) > 2 else elev
                coords.append((float(p[0]), float(p[1]), z))
        except Exception:
            return None

    if not coords:
        return None

    n = len(coords)
    return (
        sum(p[0] for p in coords) / n,
        sum(p[1] for p in coords) / n,
        sum(p[2] for p in coords) / n,
    )


def entity_center(
    ent: Any,
    *,
    dyn_fn: Any,
) -> Optional[Tuple[float, float, float]]:
    ent = dyn_fn(ent)
    try:
        obj_name = str(ent.ObjectName)
    except Exception:
        obj_name = ""

    if obj_name in ("AcDbPolyline", "AcDb2dPolyline", "AcDb3dPolyline"):
        result = poly_centroid(ent, dyn_fn=dyn_fn)
        if result:
            return result

    bbox = entity_bbox(ent, dyn_fn=dyn_fn)
    if bbox:
        minx, miny, minz, maxx, maxy, maxz = bbox
        return ((minx + maxx) / 2.0, (miny + maxy) / 2.0, (minz + maxz) / 2.0)

    return None

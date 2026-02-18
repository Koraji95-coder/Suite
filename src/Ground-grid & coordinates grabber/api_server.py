#!/usr/bin/env python3
"""
Coordinates Grabber API Server
Flask-based HTTP/WebSocket bridge between React frontend and AutoCAD COM interface

Uses LATE-BOUND COM (dynamic dispatch) to avoid gen_py cache corruption.
Pattern taken from coordtable_excel_always_place_refpoints.py.

This server runs on localhost:5000 and provides:
- AutoCAD process detection (checks for acad.exe)
- COM connection management
- Layer and selection information
- Coordinate extraction from layers
- Real-time status updates

Usage:
    python api_server.py

Requirements:
    pip install flask flask-cors psutil pywin32
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import psutil
import pythoncom
import win32com.client
import win32com.client.gencache as gencache
import threading
import time
import json
import math
import os
import traceback
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime

# ── gen_py cache fix (from coordtable) ──────────────────────────
# Prevent gen_py from writing wrappers that cause CDispatch issues
gencache.is_readonly = True

app = Flask(__name__)
CORS(app)  # Allow requests from React frontend (localhost:5173)

# Global AutoCAD manager instance
_manager = None


# ── Late-bound COM helpers (from coordtable) ────────────────────
def dyn(obj: Any) -> Any:
    """
    Force late-bound dynamic dispatch on a COM object.
    Avoids stale gen_py wrappers and CDispatch type errors.
    """
    try:
        if type(obj).__name__ == "CDispatch":
            return obj
    except Exception:
        pass

    try:
        ole = obj._oleobj_
    except Exception:
        ole = obj

    try:
        disp = ole.QueryInterface(pythoncom.IID_IDispatch)
        return win32com.client.dynamic.Dispatch(disp)
    except Exception:
        try:
            return win32com.client.dynamic.Dispatch(obj)
        except Exception:
            return obj


def connect_autocad() -> Any:
    """Connect to AutoCAD using late-bound dynamic dispatch (no gen_py)."""
    acad = win32com.client.dynamic.Dispatch("AutoCAD.Application")
    if acad is None:
        raise RuntimeError("Could not connect to AutoCAD.Application")
    return dyn(acad)


def com_call_with_retry(callable_func, max_retries: int = 25, initial_delay: float = 0.03):
    """Retry COM calls that get RPC_E_CALL_REJECTED (AutoCAD busy)."""
    delay = initial_delay
    for _ in range(max_retries):
        try:
            return callable_func()
        except pythoncom.com_error as e:
            if e.args and e.args[0] == -2147418111:  # RPC_E_CALL_REJECTED
                time.sleep(delay)
                delay = min(delay * 1.5, 0.5)
                continue
            raise
    raise RuntimeError("AutoCAD COM call failed: RPC busy too long")


class AutoCADManager:
    """
    Thread-safe AutoCAD connection manager
    Uses late-bound COM (dynamic dispatch) to avoid gen_py cache issues.
    """
    
    def __init__(self):
        self.start_time = time.time()
        self._lock = threading.Lock()
        self._cached_status = None
        self._cache_ttl = 2.0  # Cache status for 2 seconds
        self.last_check_time = 0
        
        print("[AutoCADManager] Initialized")
    
    def is_autocad_process_running(self) -> Tuple[bool, Optional[str]]:
        """
        Check if acad.exe process is running on Windows
        Returns: (is_running, process_exe_path)
        """
        try:
            for proc in psutil.process_iter(['name', 'exe']):
                try:
                    proc_name = proc.info.get('name', '').lower()
                    if proc_name == 'acad.exe':
                        return (True, proc.info.get('exe'))
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            print(f"[AutoCADManager] Error checking process: {e}")
        
        return (False, None)
    
    def _fresh_com_connection(self) -> Tuple[Any, Any, bool, Optional[str], Optional[str]]:
        """
        Get a FRESH late-bound COM connection every time.
        Never caches COM objects across calls (avoids stale ref issues).
        Returns: (acad, doc, drawing_open, drawing_name, error_message)
        """
        try:
            acad = connect_autocad()
            
            try:
                doc = dyn(acad.ActiveDocument)
                if doc is None:
                    return (acad, None, False, None, "No drawing is open")
                
                try:
                    drawing_name = str(doc.Name)
                except Exception:
                    drawing_name = "Unknown"
                
                return (acad, doc, True, drawing_name, None)
                
            except Exception as e:
                return (acad, None, False, None, f"Cannot access ActiveDocument: {str(e)}")
                
        except Exception as e:
            return (None, None, False, None, f"Cannot connect to AutoCAD: {str(e)}")
    
    def get_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get comprehensive AutoCAD status.
        Uses process-level caching only; COM refs are always fresh.
        """
        with self._lock:
            current_time = time.time()
            
            # Return cached status if still valid
            if not force_refresh and self._cached_status is not None:
                if current_time - self._cached_status['timestamp'] < self._cache_ttl:
                    return self._cached_status
            
            process_running, acad_path = self.is_autocad_process_running()
            
            if not process_running:
                status = {
                    'connected': False,
                    'autocad_running': False,
                    'drawing_open': False,
                    'drawing_name': None,
                    'autocad_path': None,
                    'error': 'AutoCAD process (acad.exe) not detected',
                    'checks': {'process': False, 'com': False, 'document': False},
                    'backend_uptime': current_time - self.start_time,
                    'timestamp': current_time
                }
            else:
                # Fresh COM connection every time (no stale refs)
                try:
                    pythoncom.CoInitialize()
                    acad, doc, drawing_ok, drawing_name, error = self._fresh_com_connection()
                    com_ok = acad is not None
                except Exception as e:
                    com_ok, drawing_ok, drawing_name, error = False, False, None, str(e)
                finally:
                    try:
                        pythoncom.CoUninitialize()
                    except:
                        pass
                
                status = {
                    'connected': com_ok,
                    'autocad_running': process_running,
                    'drawing_open': drawing_ok,
                    'drawing_name': drawing_name,
                    'autocad_path': acad_path,
                    'error': error,
                    'checks': {
                        'process': process_running,
                        'com': com_ok,
                        'document': drawing_ok
                    },
                    'backend_uptime': current_time - self.start_time,
                    'timestamp': current_time
                }
            
            self._cached_status = status
            self.last_check_time = current_time
            return status
    
    def get_layers(self) -> Tuple[bool, List[str], Optional[str]]:
        """
        Get list of layer names from active drawing.
        Uses fresh late-bound COM connection every call.
        """
        status = self.get_status()
        
        if not status['drawing_open']:
            return (False, [], status.get('error', 'No drawing open'))
        
        try:
            pythoncom.CoInitialize()
            
            acad = connect_autocad()
            doc = dyn(acad.ActiveDocument)
            
            if doc is None:
                return (False, [], 'Document reference lost')
            
            layers = []
            layer_collection = dyn(doc.Layers)
            for i in range(int(layer_collection.Count)):
                layer = dyn(layer_collection.Item(i))
                layers.append(str(layer.Name))
            
            return (True, sorted(layers), None)
            
        except Exception as e:
            return (False, [], f'COM error: {str(e)}')
        finally:
            try:
                pythoncom.CoUninitialize()
            except:
                pass
    
    def execute_layer_search(self, config: Dict) -> Dict[str, Any]:
        """
        Execute coordinate extraction from a layer.
        Uses the same late-bound COM pattern as coordtable.
        """
        try:
            pythoncom.CoInitialize()
            
            acad = connect_autocad()
            doc = dyn(acad.ActiveDocument)
            ms = dyn(doc.ModelSpace)
            
            if doc is None or ms is None:
                raise RuntimeError('Cannot access AutoCAD document or modelspace')
            
            layer_name = config.get('layer_search_name', 'Layer 0').strip()
            prefix = config.get('prefix', 'P')
            start_num = int(config.get('initial_number', 1))
            precision = int(config.get('precision', 3))
            use_corners = config.get('layer_search_use_corners', False)
            
            points = []
            point_num = start_num
            
            # Iterate through all entities in modelspace
            entity_count = int(ms.Count)
            for idx in range(entity_count):
                try:
                    ent = dyn(ms.Item(idx))
                    
                    # Get entity info via late-bound dispatch
                    try:
                        obj_name = str(ent.ObjectName)
                    except Exception:
                        continue
                    
                    try:
                        ent_layer = str(ent.Layer)
                    except Exception:
                        continue
                    
                    # Check layer match
                    if ent_layer.lower() != layer_name.lower():
                        continue
                    
                    # ── Polyline vertices ──
                    if obj_name in ('AcDbPolyline', 'AcDb2dPolyline', 'AcDb3dPolyline'):
                        try:
                            coords = list(ent.Coordinates)
                            
                            if obj_name == 'AcDb3dPolyline':
                                for i in range(0, len(coords), 3):
                                    if i + 2 < len(coords):
                                        points.append({
                                            'name': f'{prefix}{point_num}',
                                            'x': round(float(coords[i]), precision),
                                            'y': round(float(coords[i+1]), precision),
                                            'z': round(float(coords[i+2]), precision),
                                            'source': obj_name
                                        })
                                        point_num += 1
                            else:
                                elev = 0.0
                                try:
                                    elev = float(ent.Elevation)
                                except Exception:
                                    pass
                                for i in range(0, len(coords), 2):
                                    if i + 1 < len(coords):
                                        points.append({
                                            'name': f'{prefix}{point_num}',
                                            'x': round(float(coords[i]), precision),
                                            'y': round(float(coords[i+1]), precision),
                                            'z': round(elev, precision),
                                            'source': obj_name
                                        })
                                        point_num += 1
                        except Exception as e:
                            print(f"[execute] Polyline error: {e}")
                            # Fallback: try indexed vertex access
                            try:
                                n = int(ent.NumberOfVertices)
                                elev = 0.0
                                try:
                                    elev = float(ent.Elevation)
                                except Exception:
                                    pass
                                for i in range(n):
                                    p = ent.Coordinate(i)
                                    z = float(p[2]) if len(p) > 2 else elev
                                    points.append({
                                        'name': f'{prefix}{point_num}',
                                        'x': round(float(p[0]), precision),
                                        'y': round(float(p[1]), precision),
                                        'z': round(z, precision),
                                        'source': obj_name
                                    })
                                    point_num += 1
                            except Exception as e2:
                                print(f"[execute] Vertex fallback error: {e2}")
                                continue
                    
                    # ── Block reference centers ──
                    elif obj_name in ('AcDbBlockReference', 'AcDbMInsertBlock'):
                        try:
                            if use_corners:
                                # 4 corners from bounding box
                                mn, mx = ent.GetBoundingBox()
                                corners = [
                                    (float(mn[0]), float(mx[1])),  # NW
                                    (float(mx[0]), float(mx[1])),  # NE
                                    (float(mn[0]), float(mn[1])),  # SW
                                    (float(mx[0]), float(mn[1])),  # SE
                                ]
                                z_val = (float(mn[2]) + float(mx[2])) / 2.0 if len(mn) > 2 else 0.0
                                for cx, cy in corners:
                                    points.append({
                                        'name': f'{prefix}{point_num}',
                                        'x': round(cx, precision),
                                        'y': round(cy, precision),
                                        'z': round(z_val, precision),
                                        'source': 'BlockCorner'
                                    })
                                    point_num += 1
                            else:
                                # Center point
                                try:
                                    mn, mx = ent.GetBoundingBox()
                                    x = (float(mn[0]) + float(mx[0])) / 2.0
                                    y = (float(mn[1]) + float(mx[1])) / 2.0
                                    z = (float(mn[2]) + float(mx[2])) / 2.0 if len(mn) > 2 else 0.0
                                except Exception:
                                    ip = ent.InsertionPoint
                                    x = float(ip[0])
                                    y = float(ip[1])
                                    z = float(ip[2]) if len(ip) > 2 else 0.0
                                
                                points.append({
                                    'name': f'{prefix}{point_num}',
                                    'x': round(x, precision),
                                    'y': round(y, precision),
                                    'z': round(z, precision),
                                    'source': 'BlockCenter'
                                })
                                point_num += 1
                        except Exception as e:
                            print(f"[execute] Block error: {e}")
                            continue
                    
                    # ── Lines ──
                    elif obj_name == 'AcDbLine':
                        try:
                            sp = ent.StartPoint
                            ep = ent.EndPoint
                            for p in [sp, ep]:
                                points.append({
                                    'name': f'{prefix}{point_num}',
                                    'x': round(float(p[0]), precision),
                                    'y': round(float(p[1]), precision),
                                    'z': round(float(p[2]) if len(p) > 2 else 0.0, precision),
                                    'source': 'Line'
                                })
                                point_num += 1
                        except Exception as e:
                            print(f"[execute] Line error: {e}")
                            continue
                    
                    # ── Points / circles / arcs ──
                    elif obj_name in ('AcDbPoint', 'AcDbCircle', 'AcDbArc'):
                        try:
                            try:
                                c = ent.Center
                            except Exception:
                                c = ent.Position if hasattr(ent, 'Position') else None
                            if c:
                                points.append({
                                    'name': f'{prefix}{point_num}',
                                    'x': round(float(c[0]), precision),
                                    'y': round(float(c[1]), precision),
                                    'z': round(float(c[2]) if len(c) > 2 else 0.0, precision),
                                    'source': obj_name
                                })
                                point_num += 1
                        except Exception as e:
                            print(f"[execute] Point/Circle error: {e}")
                            continue
                
                except Exception as e:
                    print(f"[execute] Entity {idx} error: {e}")
                    continue
            
            return {
                'success': len(points) > 0,
                'points': points,
                'count': len(points),
                'layer': layer_name,
                'error': None if points else f'No entities found on layer "{layer_name}"'
            }
        
        except Exception as e:
            traceback.print_exc()
            return {
                'success': False,
                'points': [],
                'count': 0,
                'error': str(e)
            }
        finally:
            try:
                pythoncom.CoUninitialize()
            except:
                pass


# Initialize manager
def get_manager() -> AutoCADManager:
    global _manager
    if _manager is None:
        _manager = AutoCADManager()
    return _manager


# ========== API ENDPOINTS ==========

@app.route('/api/status', methods=['GET'])
def api_status():
    """
    Health check endpoint - returns detailed AutoCAD connection status
    
    Response:
    {
        "connected": bool,          # COM connection established
        "autocad_running": bool,     # acad.exe process detected
        "drawing_open": bool,        # Drawing is open in AutoCAD
        "drawing_name": str|null,    # Name of active drawing
        "autocad_path": str|null,    # Path to acad.exe
        "error": str|null,           # Error message if any
        "checks": {
            "process": bool,         # Process check result
            "com": bool,             # COM check result
            "document": bool         # Document check result
        },
        "backend_uptime": float,     # Seconds since backend started
        "timestamp": float           # Unix timestamp
    }
    """
    manager = get_manager()
    status = manager.get_status()
    
    # Return 200 if AutoCAD is running (drawing optional for initial connection)
    http_code = 200 if status['autocad_running'] else 503
    
    return jsonify(status), http_code


@app.route('/api/layers', methods=['GET'])
def api_layers():
    """
    List available layers in the active AutoCAD drawing
    
    Response:
    {
        "success": bool,
        "layers": [str],  # Array of layer names
        "count": int,
        "error": str|null
    }
    """
    manager = get_manager()
    success, layers, error = manager.get_layers()
    
    response = {
        'success': success,
        'layers': layers,
        'count': len(layers),
        'error': error
    }
    
    return jsonify(response), 200 if success else 503


@app.route('/api/selection-count', methods=['GET'])
def api_selection_count():
    """Get count of currently selected objects in AutoCAD (fresh COM)."""
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({'success': False, 'count': 0, 'error': 'No drawing open'}), 503
    
    try:
        pythoncom.CoInitialize()
        acad = connect_autocad()
        if acad is None:
            return jsonify({'success': False, 'count': 0, 'error': 'Cannot connect to AutoCAD'}), 503
        
        doc = dyn(acad.ActiveDocument)
        
        # Try to delete an old temp selection set first
        try:
            old_ss = doc.SelectionSets.Item("TEMP_COUNT")
            old_ss.Delete()
        except Exception:
            pass
        
        ss = doc.SelectionSets.Add("TEMP_COUNT")
        ss.SelectOnScreen()
        count = ss.Count
        ss.Delete()
        
        return jsonify({'success': True, 'count': count, 'error': None})
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'count': 0, 'error': f'COM error: {str(e)}'}), 500
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


@app.route('/api/execute', methods=['POST'])
def api_execute():
    """
    Execute coordinate extraction based on provided configuration.
    Uses late-bound COM via the manager's execute_layer_search method.
    """
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({
            'success': False,
            'message': 'No drawing open in AutoCAD',
            'points_created': 0,
            'error_details': 'Please open a drawing before executing'
        }), 400
    
    try:
        config = request.get_json()
        if not config:
            raise ValueError('No configuration provided')
        
        start_time = time.time()
        
        result = manager.execute_layer_search(config)
        
        duration = time.time() - start_time
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': f'Extracted {result["count"]} coordinate points from layer "{result["layer"]}"',
                'points_created': result['count'],
                'duration_seconds': round(duration, 2),
                'points': result['points'],
                'error_details': None
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result.get('error', 'No entities found'),
                'points_created': 0,
                'duration_seconds': round(duration, 2),
                'points': [],
                'error_details': result.get('error')
            }), 400
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'Execution failed: {str(e)}',
            'points_created': 0,
            'error_details': str(e)
        }), 500


@app.route('/api/trigger-selection', methods=['POST'])
def api_trigger_selection():
    """Bring AutoCAD to foreground (fresh COM)."""
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({'success': False, 'message': 'No drawing open'}), 503
    
    try:
        pythoncom.CoInitialize()
        acad = connect_autocad()
        if acad is None:
            return jsonify({'success': False, 'message': 'Cannot connect to AutoCAD'}), 503
        
        acad.Visible = True
        acad.WindowState = 1  # Restore if minimized
        
        return jsonify({'success': True, 'message': 'AutoCAD activated'})
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


@app.route('/health', methods=['GET'])
def health():
    """Simple health check for backend server"""
    return jsonify({
        'status': 'running',
        'server': 'Coordinates Grabber API',
        'version': '1.0.0',
        'timestamp': time.time()
    })


# ========== MAIN ==========

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Coordinates Grabber API Server")
    print("=" * 60)
    print(f"Server starting on: http://localhost:5000")
    print(f"Health check: http://localhost:5000/health")
    print(f"Status endpoint: http://localhost:5000/api/status")
    print("")
    print("📋 Prerequisites:")
    print("  - AutoCAD must be running")
    print("  - A drawing must be open in AutoCAD")
    print("  - React frontend should connect to localhost:5000")
    print("")
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    
    # Initialize manager to show initial status
    manager = get_manager()
    initial_status = manager.get_status()
    
    if initial_status['autocad_running']:
        print(f"✅ AutoCAD detected: {initial_status['autocad_path']}")
        if initial_status['drawing_open']:
            print(f"✅ Drawing open: {initial_status['drawing_name']}")
        else:
            print("⚠️  No drawing is currently open")
    else:
        print("❌ AutoCAD not detected - waiting for it to start...")
    
    print("=" * 60)
    print("")
    
    # Run Flask server
    app.run(
        host='0.0.0.0',  # Listen on all interfaces
        port=5000,
        debug=False,  # Set to True for development
        threaded=True
    )

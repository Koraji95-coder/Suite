#!/usr/bin/env python3
"""
Coordinates Grabber API Server
Flask-based HTTP/WebSocket bridge between React frontend and AutoCAD COM interface

This server runs on localhost:5000 and provides:
- AutoCAD process detection (checks for acad.exe)
- COM connection management
- Layer and selection information
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
import threading
import time
import json
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Allow requests from React frontend (localhost:5173)

# Global AutoCAD manager instance
_manager = None


class AutoCADManager:
    """
    Thread-safe AutoCAD connection manager
    Handles process detection, COM connection, and state caching
    """
    
    def __init__(self):
        self.acad = None
        self.doc = None
        self.last_check_time = 0
        self.check_interval = 1.0  # seconds (throttle connection attempts)
        self.start_time = time.time()
        self._lock = threading.Lock()
        self._cached_status = None
        self._cache_ttl = 2.0  # Cache status for 2 seconds
        
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
    
    def try_com_connection(self) -> Tuple[bool, bool, Optional[str], Optional[str]]:
        """
        Try to connect to AutoCAD via COM
        Returns: (com_connected, drawing_open, drawing_name, error_message)
        """
        try:
            pythoncom.CoInitialize()
            
            # Try to get existing AutoCAD instance
            try:
                acad = win32com.client.GetActiveObject("AutoCAD.Application")
            except:
                # No active instance, try to start one (will fail if AutoCAD not running)
                try:
                    acad = win32com.client.Dispatch("AutoCAD.Application")
                except Exception as e:
                    return (False, False, None, f"Cannot connect to AutoCAD: {str(e)}")
            
            if acad is None:
                return (False, False, None, "AutoCAD COM object is None")
            
            # COM connected! Now check if a drawing is open
            try:
                doc = acad.ActiveDocument
                if doc is None:
                    return (True, False, None, "No drawing is open")
                
                # Get drawing name
                try:
                    drawing_name = doc.Name
                except:
                    drawing_name = "Unknown"
                
                # Update our references
                self.acad = acad
                self.doc = doc
                
                return (True, True, drawing_name, None)
                
            except Exception as e:
                return (True, False, None, f"Cannot access ActiveDocument: {str(e)}")
                
        except Exception as e:
            return (False, False, None, f"COM initialization error: {str(e)}")
        finally:
            try:
                pythoncom.CoUninitialize()
            except:
                pass
    
    def get_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get comprehensive AutoCAD status
        Uses caching to avoid excessive COM calls
        """
        with self._lock:
            current_time = time.time()
            
            # Return cached status if still valid
            if not force_refresh and self._cached_status is not None:
                if current_time - self._cached_status['timestamp'] < self._cache_ttl:
                    return self._cached_status
            
            # Perform fresh status check
            process_running, acad_path = self.is_autocad_process_running()
            
            if not process_running:
                # AutoCAD not running - no need to try COM
                status = {
                    'connected': False,
                    'autocad_running': False,
                    'drawing_open': False,
                    'drawing_name': None,
                    'autocad_path': None,
                    'error': 'AutoCAD process (acad.exe) not detected',
                    'checks': {
                        'process': False,
                        'com': False,
                        'document': False
                    },
                    'backend_uptime': current_time - self.start_time,
                    'timestamp': current_time
                }
            else:
                # AutoCAD is running - try COM connection
                com_ok, drawing_ok, drawing_name, error = self.try_com_connection()
                
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
        Get list of layer names from active drawing
        Returns: (success, layer_list, error_message)
        """
        status = self.get_status()
        
        if not status['drawing_open']:
            return (False, [], status.get('error', 'No drawing open'))
        
        try:
            pythoncom.CoInitialize()
            
            if self.doc is None:
                return (False, [], 'Document reference lost')
            
            layers = []
            try:
                layer_collection = self.doc.Layers
                for i in range(layer_collection.Count):
                    layer = layer_collection.Item(i)
                    layers.append(layer.Name)
            except Exception as e:
                return (False, [], f'Error reading layers: {str(e)}')
            
            return (True, sorted(layers), None)
            
        except Exception as e:
            return (False, [], f'COM error: {str(e)}')
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
    
    # Return 200 if connected, 503 if not
    http_code = 200 if status['connected'] and status['drawing_open'] else 503
    
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
    """
    Get count of currently selected objects in AutoCAD
    
    Response:
    {
        "success": bool,
        "count": int,
        "error": str|null
    }
    """
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({
            'success': False,
            'count': 0,
            'error': 'No drawing open'
        }), 503
    
    try:
        pythoncom.CoInitialize()
        
        if manager.doc is None:
            return jsonify({'success': False, 'count': 0, 'error': 'Document reference lost'}), 503
        
        # Get selection set
        try:
            selection = manager.doc.SelectionSets.Add("TEMP_COUNT")
            selection.SelectOnScreen()
            count = selection.Count
            selection.Delete()
            
            return jsonify({
                'success': True,
                'count': count,
                'error': None
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'count': 0,
                'error': f'Selection error: {str(e)}'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'count': 0,
            'error': f'COM error: {str(e)}'
        }), 500
    finally:
        try:
            pythoncom.CoUninitialize()
        except:
            pass


@app.route('/api/execute', methods=['POST'])
def api_execute():
    """
    Execute coordinate extraction based on provided configuration
    
    Request body: CoordinatesConfig JSON
    
    Response:
    {
        "success": bool,
        "message": str,
        "excel_path": str|null,
        "points_extracted": int,
        "error": str|null
    }
    """
    # TODO: Implement coordinate extraction logic
    # This will require integrating the existing coordinatesgrabber.py logic
    
    return jsonify({
        'success': False,
        'message': 'Execution not yet implemented',
        'excel_path': None,
        'points_extracted': 0,
        'error': 'Feature under development'
    }), 501


@app.route('/api/trigger-selection', methods=['POST'])
def api_trigger_selection():
    """
    Bring AutoCAD to foreground and prompt for selection
    
    Response:
    {
        "success": bool,
        "message": str
    }
    """
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({
            'success': False,
            'message': 'No drawing open'
        }), 503
    
    try:
        pythoncom.CoInitialize()
        
        if manager.acad is None:
            return jsonify({'success': False, 'message': 'AutoCAD reference lost'}), 503
        
        # Bring AutoCAD to front
        manager.acad.Visible = True
        manager.acad.WindowState = 1  # Restore if minimized
        
        return jsonify({
            'success': True,
            'message': 'AutoCAD activated'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error: {str(e)}'
        }), 500
    finally:
        try:
            pythoncom.CoUninitialize()
        except:
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

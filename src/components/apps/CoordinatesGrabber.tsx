import React, { useState, useCallback, useEffect } from 'react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { coordinatesGrabberService } from '@/services/coordinatesGrabberService';

interface CoordinatesGrabberState {
  mode: 'polylines' | 'blocks' | 'layer_search';
  layerName: string;
  extractionStyle: 'center' | 'corners';
  pointPrefix: string;
  startNumber: number;
  decimalPlaces: number;
  scanSelection: boolean;
  includeModelspace: boolean;
  activeTab: 'config' | 'log' | 'export';
  logs: string[];
  excelPath: string;
  isRunning: boolean;
  backendConnected: boolean;
  availableLayers: string[];
  selectionCount: number;
}

interface ToolTip {
  id: string;
  text: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOOLTIPS: Record<string, string> = {
  mode_polylines: 'Extract coordinates from every polyline vertex',
  mode_blocks: 'Extract center point from selected block references',
  mode_layer_search: 'Find geometry on specified layer inside block definitions',
  style_center: 'Place one reference block at the center of found geometry',
  style_corners: 'Place four reference blocks at corners (NW, NE, SW, SE) of geometry bounds',
  scan_selection: 'Only scan selected entities instead of all blocks in drawing',
  include_modelspace: 'Also include geometry found directly in ModelSpace (outside blocks)',
  point_prefix: 'Prefix for generated point IDs (e.g., "P" → P1, P2, P3...)',
  start_number: 'Starting number for point ID numbering',
  decimal_places: 'Decimal precision for exported coordinates (0-12)',
};

const DEFAULT_STATE: CoordinatesGrabberState = {
  mode: 'layer_search',
  layerName: '',
  extractionStyle: 'center',
  pointPrefix: 'P',
  startNumber: 1,
  decimalPlaces: 3,
  scanSelection: false,
  includeModelspace: true,
  activeTab: 'config',
  logs: [
    '[INFO] Coordinates Grabber initialized',
    '[INFO] Connecting to AutoCAD backend...',
  ],
  excelPath: '',
  isRunning: false,
  backendConnected: false,
  availableLayers: [],
  selectionCount: 0,
};

// Error Boundary Component
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode; palette: any }, ErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('CoordinatesGrabber Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            flexDirection: 'column',
            padding: '20px',
            color: this.props.palette.text,
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px 0' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 12px 0', color: this.props.palette.textMuted, fontSize: '12px', textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              background: this.props.palette.primary,
              color: this.props.palette.background,
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function CoordinatesGrabber() {
  const { palette } = useTheme();
  const [state, setState] = useState<CoordinatesGrabberState>(DEFAULT_STATE);
  const [configHistory, setConfigHistory] = useState<CoordinatesGrabberState[]>([DEFAULT_STATE]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Simple log function (doesn't trigger history)
  const addLog = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
    }));
  }, []);

  // History-aware state update
  const updateState = useCallback((updates: Partial<CoordinatesGrabberState>) => {
    setState(prev => {
      const newState = { ...prev, ...updates };
      // Update history (trim future if we're not at the end)
      const newHistory = configHistory.slice(0, historyIndex + 1);
      newHistory.push(newState);
      setConfigHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      return newState;
    });
  }, [configHistory, historyIndex]);

  // Initialize backend connection on mount
  useEffect(() => {
    const initBackend = async () => {
      try {
        // Check if backend is available
        const status = await coordinatesGrabberService.checkStatus();
        if (status.connected) {
          addLog('[SUCCESS] Connected to AutoCAD backend');
          setState(prev => ({ ...prev, backendConnected: true }));
          
          // Load available layers
          const layers = await coordinatesGrabberService.listLayers();
          setState(prev => ({ ...prev, availableLayers: layers }));
          if (layers.length > 0) {
            addLog(`[INFO] Retrieved ${layers.length} layers from drawing`);
          }
          
          // Try to connect WebSocket for real-time updates
          try {
            await coordinatesGrabberService.connectWebSocket();
            addLog('[INFO] WebSocket connection established for real-time updates');
          } catch (err) {
            addLog('[INFO] WebSocket unavailable, using HTTP polling');
          }
        } else {
          addLog('[WARNING] Could not connect to AutoCAD backend');
          addLog('[INFO] AutoCAD may not be running - some features will be unavailable');
        }
      } catch (err) {
        addLog('[WARNING] Backend connection check failed');
      }
    };

    initBackend();

    return () => {
      coordinatesGrabberService.disconnect();
    };
  }, [addLog]);

  // Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setState(configHistory[newIndex]);
      setHistoryIndex(newIndex);
      addLog('[INFO] Configuration reverted');
    }
  }, [configHistory, historyIndex, addLog]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (historyIndex < configHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setState(configHistory[newIndex]);
      setHistoryIndex(newIndex);
      addLog('[INFO] Configuration restored');
    }
  }, [configHistory, historyIndex, addLog]);

  // Helper to render tooltip
  const TooltipWrapper = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const tooltipText = TOOLTIPS[id];
    if (!tooltipText) return <>{children}</>;
    
    return (
      <div
        style={{ position: 'relative', display: 'inline-block' }}
        onMouseEnter={() => setHoveredTooltip(id)}
        onMouseLeave={() => setHoveredTooltip(null)}
      >
        {children}
        {hoveredTooltip === id && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '8px',
              padding: '6px 10px',
              borderRadius: '4px',
              background: hexToRgba(palette.text, 0.9),
              color: palette.background,
              fontSize: '11px',
              whiteSpace: 'nowrap',
              zIndex: 1000,
              pointerEvents: 'none',
            }}
          >
            {tooltipText}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: `4px solid ${hexToRgba(palette.text, 0.9)}`,
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const handleModeChange = (newMode: CoordinatesGrabberState['mode']) => {
    updateState({ mode: newMode });
    addLog(`Mode changed to: ${newMode}`);
  };

  const handleStyleChange = (style: 'center' | 'corners') => {
    updateState({ extractionStyle: style });
    addLog(`Extraction style changed to: ${style}`);
  };

  const handleLayerSearch = async () => {
    if (!state.layerName.trim()) {
      addLog('[ERROR] Please enter a layer name');
      return;
    }

    if (!state.backendConnected) {
      addLog('[ERROR] Not connected to AutoCAD backend');
      return;
    }

    setState(prev => ({ ...prev, isRunning: true }));
    
    addLog(`[PROCESSING] Starting layer search on layer: "${state.layerName}"`);
    addLog(`[PROCESSING] Style: ${state.extractionStyle === 'corners' ? '4 corners' : 'center point'}`);
    addLog(`[INFO] Point naming: ${state.pointPrefix}${state.startNumber}`);
    
    try {
      // Simulate progress updates
      setProgress(10);
      
      const result = await coordinatesGrabberService.execute({
        mode: state.mode,
        precision: state.decimalPlaces,
        prefix: state.pointPrefix,
        initial_number: state.startNumber,
        block_name_filter: '',
        layer_search_name: state.layerName,
        layer_search_use_selection: state.scanSelection,
        layer_search_include_modelspace: state.includeModelspace,
        layer_search_use_corners: state.extractionStyle === 'corners',
        ref_dwg_path: '',
        ref_layer_name: 'Coordinate Reference Point',
        ref_scale: 1.0,
        ref_rotation_deg: 0,
        excel_path: '',
        replace_previous: true,
        auto_increment: false,
        show_segment: false,
        show_elevation: true,
        show_distance: false,
        show_distance_3d: false,
        show_bearing: false,
        show_azimuth: false,
      });

      setProgress(90);

      if (result.success) {
        setState(prev => ({ ...prev, excelPath: result.excel_path || '' }));
        addLog(`[SUCCESS] Export complete: ${result.excel_path}`);
        addLog(`[INFO] Points created: ${result.points_created}`);
        if (result.duration_seconds) {
          addLog(`[INFO] Duration: ${result.duration_seconds.toFixed(2)}s`);
        }
      } else {
        addLog(`[ERROR] ${result.message}`);
        if (result.error_details) {
          addLog(`[ERROR] Details: ${result.error_details}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addLog(`[ERROR] Execution failed: ${message}`);
    } finally {
      setState(prev => ({ ...prev, isRunning: false }));
      setProgress(0);
    }
  };

  const handleClearLogs = () => {
    setState(prev => ({ ...prev, logs: [] }));
  };

  const handleSelectionRefresh = async () => {
    try {
      const count = await coordinatesGrabberService.getSelectionCount();
      setState(prev => ({ ...prev, selectionCount: count }));
      addLog(`[INFO] Selection: ${count} entities selected`);
    } catch (err) {
      addLog('[WARNING] Could not get selection count');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '12px',
        overflow: 'auto',
        background: palette.background,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '12px',
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 4px 0',
              fontSize: '20px',
              fontWeight: '600',
              color: palette.text,
            }}
          >
            Coordinates Grabber
          </h1>
          <p
            style={{
              margin: '0',
              fontSize: '12px',
              color: palette.textMuted,
            }}
          >
            Extract coordinate points from CAD drawings
          </p>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Undo/Redo buttons */}
          <button
            onClick={handleUndo}
            disabled={historyIndex === 0}
            title="Undo (Ctrl+Z)"
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              border: 'none',
              background: historyIndex === 0 ? 'transparent' : hexToRgba(palette.primary, 0.1),
              color: historyIndex === 0 ? palette.textMuted : palette.primary,
              fontSize: '13px',
              cursor: historyIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: historyIndex === 0 ? 0.5 : 1,
            }}
          >
            ↶
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex === configHistory.length - 1}
            title="Redo (Ctrl+Y)"
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              border: 'none',
              background: historyIndex === configHistory.length - 1 ? 'transparent' : hexToRgba(palette.primary, 0.1),
              color: historyIndex === configHistory.length - 1 ? palette.textMuted : palette.primary,
              fontSize: '13px',
              cursor: historyIndex === configHistory.length - 1 ? 'not-allowed' : 'pointer',
              opacity: historyIndex === configHistory.length - 1 ? 0.5 : 1,
            }}
          >
            ↷
          </button>
          {/* Preset button */}
          <div
            title="Coming soon: Presets"
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px dashed ' + hexToRgba(palette.primary, 0.3),
              background: hexToRgba(palette.primary, 0.05),
              color: palette.textMuted,
              fontSize: '11px',
              cursor: 'not-allowed',
              opacity: 0.5,
            }}
          >
            Presets (coming soon)
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: '700',
              color: palette.primary,
              opacity: 0.7,
              marginLeft: '8px',
            }}
          >
            📍
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
        }}
      >
        {(['config', 'log', 'export'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setState(prev => ({ ...prev, activeTab: tab }))}
            style={{
              padding: '8px 12px',
              border: 'none',
              background: 'none',
              color: state.activeTab === tab ? palette.primary : palette.textMuted,
              fontSize: '13px',
              fontWeight: state.activeTab === tab ? '600' : '400',
              cursor: 'pointer',
              borderBottom: state.activeTab === tab ? `2px solid ${palette.primary}` : 'none',
              transition: 'all 0.2s',
            }}
          >
            {tab === 'config' && 'Configuration'}
            {tab === 'log' && 'Activity Log'}
            {tab === 'export' && 'Export'}
          </button>
        ))}
      </div>

      {/* Configuration Tab */}
      {state.activeTab === 'config' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Mode Selection */}
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: hexToRgba(palette.surface, 0.5),
                border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: palette.text,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Extraction Mode
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['polylines', 'blocks', 'layer_search'].map(mode => (
                  <label
                    key={mode}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={mode}
                      checked={state.mode === mode}
                      onChange={() => handleModeChange(mode as typeof state.mode)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span
                      style={{
                        color: state.mode === mode ? palette.primary : palette.text,
                      }}
                    >
                      {mode === 'polylines' && 'Polyline Vertices'}
                      {mode === 'blocks' && 'Block Centers'}
                      {mode === 'layer_search' && 'Layer Search'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Layer Search Options (when layer_search mode) */}
            {state.mode === 'layer_search' && (
              <>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: hexToRgba(palette.surface, 0.5),
                    border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: palette.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Layer Configuration
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: palette.textMuted }}>
                        Layer Name:
                      </label>
                      <input
                        type="text"
                        placeholder="Enter layer name..."
                        value={state.layerName}
                        onChange={e => setState(prev => ({ ...prev, layerName: e.target.value }))}
                        style={{
                          marginTop: '4px',
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                          background: hexToRgba(palette.background, 0.8),
                          color: palette.text,
                          fontSize: '12px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: hexToRgba(palette.surface, 0.5),
                    border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: palette.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Reference Point Style
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="style"
                        value="center"
                        checked={state.extractionStyle === 'center'}
                        onChange={() => handleStyleChange('center')}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: state.extractionStyle === 'center' ? palette.primary : palette.text }}>
                        Single block at geometry center
                      </span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="style"
                        value="corners"
                        checked={state.extractionStyle === 'corners'}
                        onChange={() => handleStyleChange('corners')}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: state.extractionStyle === 'corners' ? palette.primary : palette.text }}>
                        Four blocks at geometry corners (NW, NE, SW, SE)
                      </span>
                    </label>
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: hexToRgba(palette.surface, 0.5),
                    border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: palette.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Scan Options
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={state.scanSelection}
                        onChange={e => setState(prev => ({ ...prev, scanSelection: e.target.checked }))}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: palette.text }}>
                        Scan selected entities only
                      </span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={state.includeModelspace}
                        onChange={e => setState(prev => ({ ...prev, includeModelspace: e.target.checked }))}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: palette.text }}>
                        Include ModelSpace geometry (outside blocks)
                      </span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* Point Naming Options */}
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: hexToRgba(palette.surface, 0.5),
                border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: palette.text,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Point Naming
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: palette.textMuted }}>
                    Prefix:
                  </label>
                  <input
                    type="text"
                    value={state.pointPrefix}
                    onChange={e => setState(prev => ({ ...prev, pointPrefix: e.target.value }))}
                    style={{
                      marginTop: '4px',
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                      background: hexToRgba(palette.background, 0.8),
                      color: palette.text,
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: palette.textMuted }}>
                    Start #:
                  </label>
                  <input
                    type="number"
                    value={state.startNumber}
                    onChange={e => setState(prev => ({ ...prev, startNumber: parseInt(e.target.value) || 1 }))}
                    min="1"
                    style={{
                      marginTop: '4px',
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                      background: hexToRgba(palette.background, 0.8),
                      color: palette.text,
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: palette.textMuted }}>
                    Decimals:
                  </label>
                  <input
                    type="number"
                    value={state.decimalPlaces}
                    onChange={e => setState(prev => ({ ...prev, decimalPlaces: parseInt(e.target.value) || 3 }))}
                    min="0"
                    max="12"
                    style={{
                      marginTop: '4px',
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                      background: hexToRgba(palette.background, 0.8),
                      color: palette.text,
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {state.isRunning && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: `2px solid ${hexToRgba(palette.primary, 0.3)}`,
                      borderTopColor: palette.primary,
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: palette.textMuted }}>Processing...</span>
                </div>
                <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: hexToRgba(palette.primary, 0.2), overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: palette.primary,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={handleLayerSearch}
                disabled={state.isRunning || !state.backendConnected}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: state.backendConnected ? palette.primary : palette.textMuted,
                  color: state.backendConnected ? palette.background : 'rgba(255,255,255,0.5)',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: state.backendConnected && !state.isRunning ? 'pointer' : 'not-allowed',
                  opacity: state.isRunning ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => {
                  if (!state.isRunning && state.backendConnected) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
                  }
                }}
                onMouseLeave={e => {
                  if (!state.isRunning && state.backendConnected) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                  }
                }}
              >
                {state.isRunning ? '⏳ Running...' : '▶ Run Layer Search'}
              </button>
              {state.mode === 'blocks' && (
                <button
                  onClick={handleSelectionRefresh}
                  disabled={!state.backendConnected}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '6px',
                    border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
                    background: 'transparent',
                    color: state.backendConnected ? palette.primary : palette.textMuted,
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: state.backendConnected ? 'pointer' : 'not-allowed',
                  }}
                >
                  🔄 Refresh
                </button>
              )}
            </div>

            {/* Backend Status */}
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: state.backendConnected
                  ? hexToRgba('#51cf66', 0.1)
                  : hexToRgba('#ff6b6b', 0.1),
                border: `1px solid ${state.backendConnected
                  ? hexToRgba('#51cf66', 0.3)
                  : hexToRgba('#ff6b6b', 0.3)}`,
                color: state.backendConnected ? '#51cf66' : '#ff6b6b',
                fontSize: '11px',
              }}
            >
              {state.backendConnected
                ? '● Connected to AutoCAD'
                : '● Connection offline (AutoCAD or backend not available)'}
            </div>
          </div>
        </div>
      )}

      {/* Log Tab */}
      {state.activeTab === 'log' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '6px',
              background: hexToRgba(palette.background, 0.5),
              border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
              fontFamily: 'monospace',
              fontSize: '11px',
              overflow: 'auto',
              color: palette.textMuted,
            }}
          >
            {state.logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  padding: '2px 0',
                  color: log.includes('[ERROR]')
                    ? '#ff6b6b'
                    : log.includes('[SUCCESS]')
                    ? '#51cf66'
                    : log.includes('[PROCESSING]')
                    ? palette.primary
                    : palette.textMuted,
                }}
              >
                {log}
              </div>
            ))}
          </div>
          <button
            onClick={handleClearLogs}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              borderRadius: '4px',
              border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
              background: 'transparent',
              color: palette.textMuted,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Clear Logs
          </button>
        </div>
      )}

      {/* Export Tab */}
      {state.activeTab === 'export' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: hexToRgba(palette.surface, 0.5),
                border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: palette.text,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Excel Export
              </h3>
              {state.excelPath ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: hexToRgba('#51cf66', 0.1),
                      border: `1px solid ${hexToRgba('#51cf66', 0.3)}`,
                      color: '#51cf66',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}
                  >
                    ✓ {state.excelPath}
                  </div>
                  <button
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
                      background: hexToRgba(palette.primary, 0.1),
                      color: palette.primary,
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    📂 Open Export Location
                  </button>
                </div>
              ) : (
                <p style={{ margin: '0', color: palette.textMuted, fontSize: '12px' }}>
                  No export yet. Run layer search to generate Excel file.
                </p>
              )}
            </div>

            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: hexToRgba(palette.surface, 0.5),
                border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: palette.text,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Output Format
              </h3>
              <p style={{ margin: '0 0 8px 0', color: palette.textMuted, fontSize: '12px' }}>
                Excel spreadsheet with the following columns:
              </p>
              <ul
                style={{
                  margin: '0',
                  paddingLeft: '20px',
                  color: palette.text,
                  fontSize: '12px',
                }}
              >
                <li>Point ID</li>
                {state.extractionStyle === 'corners' && <li>Corner (NW, NE, SW, SE)</li>}
                <li>East (X)</li>
                <li>North (Y)</li>
                <li>Elevation (Z)</li>
                <li>Source Type</li>
                <li>Source Handle</li>
                <li>Source Name</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { coordinatesGrabberService } from '@/services/coordinatesGrabberService';

interface CoordinatesGrabberState {
  mode: 'polylines' | 'blocks' | 'layer_search';
  layerName: string;
  selectedLayers: string[];
  extractionStyle: 'center' | 'corners';
  refScale: number;
  pointPrefix: string;
  startNumber: number;
  decimalPlaces: number;
  scanSelection: boolean;
  includeModelspace: boolean;
  activeTab: 'config' | 'log' | 'export' | 'history';
  logs: string[];
  excelPath: string;
  isRunning: boolean;
  backendConnected: boolean;
  availableLayers: string[];
  selectionCount: number;
  executionHistory: ExecutionHistoryEntry[];
  validationErrors: string[];
  performanceMetrics?: PerformanceMetrics;
}

interface ExecutionHistoryEntry {
  timestamp: number;
  config: Partial<CoordinatesGrabberState>;
  success: boolean;
  pointsCreated?: number;
  duration: number;
  fileSize?: number;
  filePath?: string;
  message?: string;
}

interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration: number;
  pointsCreated: number;
  geometriesProcessed: number;
  fileSize: number;
  pointsPerSecond: number;
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
  selectedLayers: [],
  extractionStyle: 'center',
  refScale: 1,
  pointPrefix: 'P',
  startNumber: 1,
  decimalPlaces: 3,
  scanSelection: false,
  includeModelspace: true,
  activeTab: 'config',
  logs: [], // Logs added dynamically to prevent duplicates
  excelPath: '',
  isRunning: false,
  backendConnected: false,
  availableLayers: [],
  selectionCount: 0,
  executionHistory: [],
  validationErrors: [],
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
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Simple log function (doesn't trigger history)
  const addLog = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
    }));
  }, []);

  // Setup WebSocket event listeners for real-time progress
  const setupWebSocketListeners = useCallback(() => {
    coordinatesGrabberService.on('progress', (data: any) => {
      setProgress(data.percentage || 0);
      if (data.message) {
        addLog(`[PROGRESS] ${data.message}`);
      }
    });

    coordinatesGrabberService.on('complete', (data: any) => {
      addLog(`[SUCCESS] Operation completed`);
      if (data.message) {
        addLog(`[INFO] ${data.message}`);
      }
    });

    coordinatesGrabberService.on('error', (data: any) => {
      addLog(`[ERROR] Backend error: ${data.message || 'Unknown error'}`);
    });
  }, [addLog]);

  // Track whether user has attempted to run (don't show validation errors until then)
  const hasAttemptedRunRef = useRef(false);

  // Initialize backend connection on mount with real-time polling
  const hasInitializedRef = useRef(false);
  
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    let pollInterval: NodeJS.Timeout | null = null;
    let isFirstCheck = true;

    // Add initialization log once
    addLog('[INFO] Coordinates Grabber initialized');
    addLog('[INFO] Checking for AutoCAD backend...');

    const checkBackendStatus = async () => {
      try {
        const status = await coordinatesGrabberService.checkStatus();
        const isNowConnected = status.connected && status.autocad_running;
        
        // Read previous state for comparison, then update
        let wasConnected = false;
        setState(prev => {
          wasConnected = prev.backendConnected;
          return { ...prev, backendConnected: isNowConnected };
        });
        
        // Log OUTSIDE setState to avoid React StrictMode double-firing
        if (isFirstCheck && isNowConnected) {
          addLog('[SUCCESS] ✓ Connected to AutoCAD backend');
        } else if (!isFirstCheck && wasConnected !== isNowConnected) {
          if (isNowConnected) {
            addLog('[SUCCESS] ✓ AutoCAD connection established');
          } else {
            addLog('[INFO] AutoCAD connection lost - waiting for reconnection...');
          }
        }
        
        // On first successful connection or reconnection, load layers
        if (status.connected && status.autocad_running) {
          try {
            const layers = await coordinatesGrabberService.listLayers();
            setState(prev => ({ ...prev, availableLayers: layers }));
            if (layers.length > 0 && isFirstCheck) {
              addLog(`[INFO] Retrieved ${layers.length} layers from active drawing`);
            }
            
            // Try to connect WebSocket for real-time updates (only on first connection)
            if (isFirstCheck) {
              try {
                await coordinatesGrabberService.connectWebSocket();
                addLog('[INFO] Real-time updates enabled');
                setupWebSocketListeners();
              } catch (err) {
                // Silent fallback to polling
              }
            }
          } catch (err) {
            // Silent layer loading failure
          }
        } else if (isFirstCheck) {
          // Only show info message on first check if AutoCAD isn't available
          addLog('[INFO] Waiting for AutoCAD connection...');
          addLog('[INFO] Start AutoCAD and open a drawing to enable features');
        }
        
        isFirstCheck = false;
      } catch (err) {
        // Silent error on polling - don't spam logs
        if (isFirstCheck) {
          addLog('[INFO] AutoCAD backend not detected - features will activate when available');
          isFirstCheck = false;
        }
      }
    };

    // Initial check
    checkBackendStatus();
    
    // Poll every 5 seconds for AutoCAD availability
    pollInterval = setInterval(checkBackendStatus, 5000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      coordinatesGrabberService.disconnect();
    };
  }, [addLog, setupWebSocketListeners]);

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
    setState(prev => ({ ...prev, mode: newMode }));
    addLog(`Mode changed to: ${newMode}`);
  };

  const handleStyleChange = (style: 'center' | 'corners') => {
    setState(prev => ({ ...prev, extractionStyle: style }));
    addLog(`Extraction style changed to: ${style}`);
  };

  const handleAddLayer = useCallback(() => {
    const layerToAdd = state.layerName.trim();
    if (!layerToAdd) {
      addLog('[WARNING] Select or enter a layer before adding');
      return;
    }
    setState(prev => {
      if (prev.selectedLayers.includes(layerToAdd)) {
        return prev;
      }
      return { ...prev, selectedLayers: [...prev.selectedLayers, layerToAdd] };
    });
    addLog(`[INFO] Added layer: ${layerToAdd}`);
  }, [state.layerName, addLog]);

  const handleRemoveLayer = useCallback((layerToRemove: string) => {
    setState(prev => ({
      ...prev,
      selectedLayers: prev.selectedLayers.filter(layer => layer !== layerToRemove),
    }));
    addLog(`[INFO] Removed layer: ${layerToRemove}`);
  }, [addLog]);

  const handleClearLayers = useCallback(() => {
    setState(prev => ({ ...prev, selectedLayers: [] }));
    addLog('[INFO] Cleared selected layers');
  }, [addLog]);

  const handleLayerSearch = async () => {
    if (!state.backendConnected) {
      addLog('[ERROR] Not connected to AutoCAD backend');
      return;
    }

    // Mark that user has attempted a run
    hasAttemptedRunRef.current = true;

    // Check for validation errors
    const errors = validateConfiguration();
    if (errors.length > 0) {
      setState(prev => ({ ...prev, validationErrors: errors }));
      errors.forEach(err => addLog(`[VALIDATION] ${err}`));
      addLog('[ERROR] Configuration validation failed');
      return;
    }

    setState(prev => ({ ...prev, isRunning: true, validationErrors: [] }));
    const executionStartTime = Date.now();
    
    const layersToRun = state.selectedLayers.length > 0
      ? state.selectedLayers
      : (state.layerName.trim() ? [state.layerName.trim()] : []);

    addLog(`[PROCESSING] Starting layer search on ${layersToRun.length} layer(s): ${layersToRun.join(', ')}`);
    addLog(`[PROCESSING] Style: ${state.extractionStyle === 'corners' ? '4 corners' : 'center point'}`);
    addLog(`[INFO] Reference block scale: ${state.refScale}`);
    addLog(`[INFO] Point naming: ${state.pointPrefix}${state.startNumber}`);
    addLog(`[INFO] Precision: ${state.decimalPlaces} decimal places`);
    
    try {
      // Progress updates
      setProgress(10);
      addLog('[PROCESSING] Preparing request...');
      
      setProgress(20);
      const result = await coordinatesGrabberService.execute({
        mode: state.mode,
        precision: state.decimalPlaces,
        prefix: state.pointPrefix,
        initial_number: state.startNumber,
        block_name_filter: '',
        layer_search_name: state.layerName,
        layer_search_names: layersToRun,
        layer_search_use_selection: state.scanSelection,
        layer_search_include_modelspace: state.includeModelspace,
        layer_search_use_corners: state.extractionStyle === 'corners',
        ref_dwg_path: '',
        ref_layer_name: 'Coordinate Reference Point',
        ref_scale: state.refScale,
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
        const pointsCreated = result.points_created || 0;
        const blocksInserted = result.blocks_inserted || 0;
        const filePath = result.excel_path || '';
        const duration = (Date.now() - executionStartTime) / 1000;
        const blockErrors = result.block_errors as string[] | null;

        const metrics = calculateMetrics(executionStartTime, pointsCreated, 0);

        const historyEntry: ExecutionHistoryEntry = {
          timestamp: Date.now(),
          config: {
            mode: state.mode,
            layerName: layersToRun.join(', '),
            extractionStyle: state.extractionStyle,
            pointPrefix: state.pointPrefix,
            decimalPlaces: state.decimalPlaces,
          },
          success: true,
          pointsCreated,
          duration,
          filePath,
        };

        saveExecutionResult(historyEntry);

        setState(prev => ({
          ...prev,
          excelPath: filePath,
          performanceMetrics: metrics,
        }));

        addLog(`[SUCCESS] ${result.message || `Extracted ${pointsCreated} points`}`);
        if (blocksInserted > 0) {
          addLog(`[SUCCESS] Reference blocks inserted: ${blocksInserted}`);
        }
        if (filePath) {
          addLog(`[SUCCESS] Excel exported: ${filePath}`);
        }
        addLog(`[INFO] Duration: ${duration.toFixed(2)}s`);
        if (blockErrors && blockErrors.length > 0) {
          blockErrors.forEach(err => addLog(`[WARNING] ${err}`));
        }
      } else {
        // Log failed execution
        const historyEntry: ExecutionHistoryEntry = {
          timestamp: Date.now(),
          config: {
            mode: state.mode,
            layerName: layersToRun.join(', '),
          },
          success: false,
          duration: (Date.now() - executionStartTime) / 1000,
          message: result.message,
        };
        
        saveExecutionResult(historyEntry);
        
        addLog(`[ERROR] ${result.message}`);
        if (result.error_details) {
          addLog(`[ERROR] Details: ${result.error_details}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addLog(`[ERROR] Execution failed: ${message}`);
      
      // Save failed execution
      const historyEntry: ExecutionHistoryEntry = {
        timestamp: Date.now(),
        config: { mode: state.mode },
        success: false,
        duration: (Date.now() - executionStartTime) / 1000,
        message,
      };
      
      saveExecutionResult(historyEntry);
    } finally {
      setState(prev => ({ ...prev, isRunning: false }));
      setProgress(0);
    }
  };

  const handleClearLogs = () => {
    setState(prev => ({ ...prev, logs: [] }));
  };

  // Validate configuration (returns errors without setting state)
  const validateConfiguration = useCallback((): string[] => {
    const errors: string[] = [];
    
    if (state.mode === 'layer_search') {
      const hasLayerSelection = state.selectedLayers.length > 0 || !!state.layerName.trim();
      if (!hasLayerSelection) {
        errors.push('Add at least one layer for layer search mode');
      }
    }
    
    if (!state.pointPrefix.trim()) {
      errors.push('Point prefix cannot be empty');
    }
    
    if (state.startNumber < 1) {
      errors.push('Start number must be at least 1');
    }
    
    if (state.decimalPlaces < 0 || state.decimalPlaces > 12) {
      errors.push('Decimal places must be between 0 and 12');
    }
    
    if (state.pointPrefix.length > 10) {
      errors.push('Point prefix must be 10 characters or less');
    }

    if (!Number.isFinite(state.refScale) || state.refScale <= 0) {
      errors.push('Scale must be greater than 0');
    }
    
    return errors;
  }, [state.mode, state.selectedLayers, state.layerName, state.pointPrefix, state.startNumber, state.decimalPlaces, state.refScale]);

  // Update validation errors reactively, but only show in UI after first run attempt
  useEffect(() => {
    const errors = validateConfiguration();
    // Always update for button disable logic, but only surface in UI after user has tried to run
    if (hasAttemptedRunRef.current) {
      setState(prev => ({ ...prev, validationErrors: errors }));
    } else {
      // Keep internal tracking for button disable, but don't show error box
      setState(prev => ({ ...prev, validationErrors: [] }));
    }
  }, [validateConfiguration]);

  // Save execution result to history
  const saveExecutionResult = useCallback((entry: ExecutionHistoryEntry) => {
    setState(prev => ({
      ...prev,
      executionHistory: [entry, ...prev.executionHistory].slice(0, 50), // Keep last 50
    }));
  }, []);

  // Calculate performance metrics
  const calculateMetrics = useCallback((startTime: number, pointsCreated: number, fileSize: number): PerformanceMetrics => {
    const duration = (Date.now() - startTime) / 1000;
    return {
      startTime,
      duration,
      pointsCreated,
      geometriesProcessed: 0, // Would be populated by backend
      fileSize,
      pointsPerSecond: Math.round((pointsCreated / duration) * 100) / 100,
    };
  }, []);

  // Download result file
  const downloadResult = useCallback(async () => {
    if (!state.excelPath) {
      addLog('[ERROR] No export file available to download');
      return;
    }
    try {
      addLog('[INFO] Initiating download...');
      const response = await fetch(`/api/download-result?path=${encodeURIComponent(state.excelPath)}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `coordinates_${Date.now()}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
        addLog('[SUCCESS] File downloaded successfully');
      } else {
        addLog('[ERROR] Failed to download file');
      }
    } catch (err) {
      addLog(`[ERROR] Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [state.excelPath, addLog]);

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
        {(['config', 'log', 'export', 'history'] as const).map(tab => (
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
            {tab === 'history' && `History (${state.executionHistory.length})`}
          </button>
        ))}
      </div>

      {/* Configuration Tab */}
      {state.activeTab === 'config' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Validation Errors */}
            {state.validationErrors.length > 0 && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: hexToRgba('#ff6b6b', 0.1),
                  border: `1px solid ${hexToRgba('#ff6b6b', 0.3)}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#ff6b6b' }}>⚠️</span>
                  <span style={{ color: '#ff6b6b', fontSize: '12px', fontWeight: '600' }}>Validation Errors</span>
                </div>
                <ul style={{ margin: '0', paddingLeft: '20px', color: '#ff6b6b', fontSize: '11px' }}>
                  {state.validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

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
                      <label style={{ fontSize: '12px', color: palette.textMuted, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Layer Name:</span>
                        <button
                          onClick={async () => {
                            addLog('[INFO] Refreshing layer list from AutoCAD...');
                            try {
                              const layers = await coordinatesGrabberService.listLayers();
                              setState(prev => ({ ...prev, availableLayers: layers }));
                              addLog(`[SUCCESS] Found ${layers.length} layers`);
                            } catch (err) {
                              addLog('[ERROR] Failed to refresh layers');
                            }
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '3px',
                            border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
                            background: hexToRgba(palette.primary, 0.1),
                            color: palette.primary,
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontWeight: '500',
                          }}
                        >
                          🔄 Refresh
                        </button>
                      </label>
                      {state.availableLayers.length > 0 ? (
                        <select
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
                        >
                          <option value="">-- Select a layer --</option>
                          {state.availableLayers.map(layer => (
                            <option key={layer} value={layer}>
                              {layer}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="No layers found. Type layer name or click Refresh..."
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
                      )}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={handleAddLayer}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
                            background: hexToRgba(palette.primary, 0.1),
                            color: palette.primary,
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                          }}
                        >
                          + Add Layer
                        </button>
                        <button
                          type="button"
                          onClick={handleClearLayers}
                          disabled={state.selectedLayers.length === 0}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                            background: 'transparent',
                            color: state.selectedLayers.length === 0 ? palette.textMuted : palette.text,
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: state.selectedLayers.length === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Clear Layers
                        </button>
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {state.selectedLayers.length === 0 ? (
                          <div style={{ fontSize: '11px', color: palette.textMuted }}>
                            No layers added yet. Add one or more layers to run together.
                          </div>
                        ) : (
                          state.selectedLayers.map(layer => (
                            <div
                              key={layer}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                background: hexToRgba(palette.primary, 0.08),
                                border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
                                fontSize: '11px',
                              }}
                            >
                              <span style={{ color: palette.text }}>{layer}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveLayer(layer)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: palette.textMuted,
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
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
                    Reference Block
                  </h3>
                  <label style={{ fontSize: '12px', color: palette.textMuted }}>
                    Scale:
                  </label>
                  <input
                    type="number"
                    value={state.refScale}
                    onChange={e => setState(prev => ({ ...prev, refScale: Number(e.target.value) || 1 }))}
                    min="0.0001"
                    step="0.1"
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
                  : hexToRgba('#ffa94d', 0.1),
                border: `1px solid ${state.backendConnected
                  ? hexToRgba('#51cf66', 0.3)
                  : hexToRgba('#ffa94d', 0.3)}`,
                color: state.backendConnected ? '#51cf66' : '#ffa94d',
                fontSize: '11px',
              }}
            >
              {state.backendConnected
                ? '● Connected to AutoCAD'
                : '○ Monitoring for AutoCAD... (checking every 5s)'}
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
                  <button
                    onClick={downloadResult}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: `1px solid ${hexToRgba('#4dabf7', 0.3)}`,
                      background: hexToRgba('#4dabf7', 0.1),
                      color: '#4dabf7',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    ⬇️ Download Excel
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

      {/* History Tab */}
      {state.activeTab === 'history' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
            {state.performanceMetrics && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: hexToRgba(palette.primary, 0.1),
                  border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                }}
              >
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: palette.text,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Latest Metrics
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: palette.textMuted }}>
                  <div>Points: <strong>{state.performanceMetrics.pointsCreated}</strong></div>
                  <div>Duration: <strong>{state.performanceMetrics.duration.toFixed(2)}s</strong></div>
                  <div>Rate: <strong>{state.performanceMetrics.pointsPerSecond}</strong>/s</div>
                  <div>Time: <strong>{new Date(state.performanceMetrics.startTime).toLocaleTimeString()}</strong></div>
                </div>
              </div>
            )}

            {state.executionHistory.length === 0 ? (
              <p style={{ color: palette.textMuted, fontSize: '12px', textAlign: 'center', margin: '20px 0' }}>
                No execution history yet. Run a search to see results here.
              </p>
            ) : (
              state.executionHistory.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: entry.success
                      ? hexToRgba('#51cf66', 0.05)
                      : hexToRgba('#ff6b6b', 0.05),
                    border: `1px solid ${entry.success
                      ? hexToRgba('#51cf66', 0.2)
                      : hexToRgba('#ff6b6b', 0.2)}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '14px',
                      color: entry.success ? '#51cf66' : '#ff6b6b',
                    }}>
                      {entry.success ? '✓' : '✗'}
                    </span>
                    <span style={{ color: palette.text, fontSize: '12px', fontWeight: '600' }}>
                      {entry.config.layerName || entry.config.mode}
                    </span>
                    <span style={{ color: palette.textMuted, fontSize: '11px', marginLeft: 'auto' }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: palette.textMuted }}>
                    <div>Extracted: {entry.pointsCreated || '-'}</div>
                    <div>Duration: {entry.duration.toFixed(2)}s</div>
                  </div>
                  {entry.message && !entry.success && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#ff6b6b', fontStyle: 'italic' }}>
                      {entry.message}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

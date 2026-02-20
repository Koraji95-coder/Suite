/**
 * Coordinates Grabber Service
 * 
 * Handles communication with the Python AutoCAD backend application.
 * Supports configuration management, execution, and progress tracking.
 */

import { logger } from '@/lib/logger';

export interface CoordinatesConfig {
  mode: 'polylines' | 'blocks' | 'layer_search';
  precision: number;
  prefix: string;
  initial_number: number;
  block_name_filter: string;
  layer_search_name: string;
  layer_search_names?: string[];
  layer_search_use_selection: boolean;
  layer_search_include_modelspace: boolean;
  layer_search_use_corners: boolean;
  ref_dwg_path: string;
  ref_layer_name: string;
  ref_scale: number;
  ref_rotation_deg: number;
  excel_path: string;
  replace_previous: boolean;
  auto_increment: boolean;
  // Table options
  show_segment: boolean;
  show_elevation: boolean;
  show_distance: boolean;
  show_distance_3d: boolean;
  show_bearing: boolean;
  show_azimuth: boolean;
}

export interface ExecutionResultPoint {
  id: string;
  east: number;
  north: number;
  elevation: number;
  layer: string;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  excel_path?: string;
  points_created?: number;
  blocks_inserted?: number;
  block_errors?: string[] | null;
  duration_seconds?: number;
  error_details?: string;
  points?: ExecutionResultPoint[];
}

export interface ProgressUpdate {
  stage: string;
  progress: number; // 0-100
  current_item?: string;
  message?: string;
}

export interface BackendStatus {
  connected: boolean;
  autocad_running: boolean;
  last_config?: CoordinatesConfig;
  last_execution_time?: string;
}

/**
 * Singleton service for coordinating with the Python AutoCAD backend.
 * 
 * Can operate in three modes:
 * 1. WebSocket (real-time, bidirectional)
 * 2. HTTP (REST API calls)
 * 3. Local IPC (if running on same machine via localhost)
 */
class CoordinatesGrabberService {
  private baseUrl: string = 'http://localhost:5000'; // Python backend URL
  private websocket: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000; // ms
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private apiKey: string;

  constructor() {
    // Initialize with localhost for development
    // In production, this would be configured via environment variables
    this.baseUrl = import.meta.env.VITE_COORDINATES_BACKEND_URL || 'http://localhost:5000';
    this.apiKey = import.meta.env.VITE_API_KEY || 'dev-only-insecure-key-change-in-production';
  }

  /**
   * Get default headers with API key authentication
   */
  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  /**
   * Connect to the Python backend via WebSocket for real-time updates
   */
  public connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          logger.debug('WebSocket connected', 'CoordinatesGrabber');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.emit(data.type, data);
          } catch (err) {
            logger.error('Failed to parse WebSocket message', 'CoordinatesGrabber', err);
          }
        };

        this.websocket.onerror = (error) => {
          logger.error('WebSocket connection error', 'CoordinatesGrabber', error);
          reject(error);
        };

        this.websocket.onclose = () => {
          logger.debug('WebSocket disconnected', 'CoordinatesGrabber');
          this.websocket = null;
          this.attemptReconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Attempt to reconnect to WebSocket after disconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      logger.debug(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'CoordinatesGrabber');
      setTimeout(() => this.connectWebSocket().catch(err => {
        logger.error('Reconnection failed', 'CoordinatesGrabber', err);
      }), delay);
    } else {
      const errorMsg = 'Max WebSocket reconnection attempts reached. Service is offline. Please restart the server.';
      logger.error(errorMsg, 'CoordinatesGrabber');
      // Notify UI that service is permanently disconnected
      this.emit('service-disconnected', {
        type: 'service-disconnected',
        message: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Check if backend is accessible and is the correct Coordinates Grabber API
   */
  public async checkStatus(): Promise<BackendStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/api/status`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();

      if (data.backend_id !== 'coordinates-grabber-api') {
        logger.warn('Response from unknown service', 'CoordinatesGrabber', { url: this.baseUrl });
        return { connected: false, autocad_running: false };
      }

      return data;
    } catch (err) {
      logger.error('Status check failed', 'CoordinatesGrabber', err);
      return {
        connected: false,
        autocad_running: false,
      };
    }
  }

  /**
   * Execute coordinates grabber with the provided config
   */
  public async execute(config: CoordinatesConfig): Promise<ExecutionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/execute`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        if (response.status === 501) {
          return {
            success: false,
            message: 'The Python backend does not support /api/execute. Ensure api_server.py is running on ' + this.baseUrl,
            error_details: `Another service may be running on ${this.baseUrl} instead of the Coordinates Grabber API`,
          };
        }
        const body = await response.json().catch(() => null);
        if (body && typeof body.message === 'string') {
          return { success: false, message: body.message, error_details: body.error_details };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Execution failed', 'CoordinatesGrabber', err);
      if (message === 'Failed to fetch' || message.includes('NetworkError')) {
        return {
          success: false,
          message: `Cannot reach backend at ${this.baseUrl}. Is api_server.py running?`,
          error_details: 'Start the Python API server: python api_server.py',
        };
      }
      return {
        success: false,
        message: `Backend error: ${message}`,
        error_details: message,
      };
    }
  }

  /**
   * List available layers in the active AutoCAD drawing
   */
  public async listLayers(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/layers`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      return data.layers || [];
    } catch (err) {
      logger.error('Failed to list layers', 'CoordinatesGrabber', err);
      return [];
    }
  }

  /**
   * Get the current selection count from AutoCAD
   */
  public async getSelectionCount(): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/api/selection-count`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      return data.count || 0;
    } catch (err) {
      logger.error('Failed to get selection count', 'CoordinatesGrabber', err);
      return 0;
    }
  }

  /**
   * Trigger selection in AutoCAD (minimize Suite UI and focus AutoCAD)
   */
  public async triggerSelection(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/trigger-selection`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);
    } catch (err) {
      logger.error('Failed to trigger selection', 'CoordinatesGrabber', err);
    }
  }

  /**
   * Subscribe to a specific event type
   */
  public on(eventType: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  /**
   * Emit an event (for testing / internal use)
   */
  private emit(eventType: string, data: any): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          logger.error(`Error in event listener for ${eventType}`, 'CoordinatesGrabber', err);
        }
      });
    }
  }

  /**
   * Close WebSocket connection
   */
  public disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  /**
   * Get the current connection URL (for debugging)
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if WebSocket is connected
   */
  public isConnected(): boolean {
    return this.websocket !== null && this.websocket.readyState === WebSocket.OPEN;
  }
}

export const coordinatesGrabberService = new CoordinatesGrabberService();

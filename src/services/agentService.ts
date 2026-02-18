/**
 * Suite Agent Bridge Service
 * Connects Suite frontend to ZeroClaw agent (Koro) for automation tasks
 * 
 * IMPLEMENTATION GUIDE FOR BOLT:
 * ==============================
 * Agent: ZeroClaw/Koro running at http://127.0.0.1:3000/gateway
 * 
 * All methods must:
 * 1. Make HTTP POST requests to the agent gateway
 * 2. Include Authorization bearer token after pairing
 * 3. Handle timeouts (default 30s, max 5min for long tasks)
 * 4. Return Promise<AgentResponse> with success/data/error fields
 * 
 * Methods to implement:
 * - pair(pairingCode): Get token from agent
 * - sendMessage(message): Direct message to agent
 * - executePythonScript(path, args): Run Python via agent
 * - generateFloorPlan(projectId): Create floor plan
 * - analyzeDrawingList(filePath): Validate drawings
 * - generateTransmittal(drawingIds): Create transmittal
 * - analyzeProject(projectId): Full project analysis
 * 
 * See: /workspaces/Suite/BOLT_AGENT_INTEGRATION_PROMPT.md for full spec
 * See: /workspaces/Suite/src/types/agent.ts for TypeScript interfaces
 */

import type {
  AgentResponse,
  PairingResponse,
  MessageResponse,
  DrawingListAnalysisResult,
  TransmittalResult,
  ProjectAnalysisResult,
  FloorPlanResult,
  GATEWAY_CONFIG,
} from '../types/agent';

export interface AgentTask {
  task: string;
  params?: Record<string, any>;
  timeout?: number;
}

export interface PythonToolRequest {
  script: string;
  args: Record<string, any>;
  cwd?: string;
}

class AgentService {
  private baseUrl: string;
  private bearerToken: string | null = null;
  private isPaired: boolean = false;

  constructor() {
    // Default to localhost for development
    // Override with environment variable for production
    this.baseUrl = import.meta.env.VITE_AGENT_URL || 'http://localhost:8080';
  }

  /**
   * Pair with the agent using the 6-digit code
   * This must be done once when the agent starts
   */
  async pair(pairingCode: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: pairingCode }),
      });

      if (!response.ok) {
        throw new Error('Pairing failed');
      }

      const data = await response.json();
      this.bearerToken = data.token;
      this.isPaired = true;
      
      // Store token in localStorage for persistence
      localStorage.setItem('agent_bearer_token', data.token);
      
      return true;
    } catch (error) {
      console.error('Agent pairing error:', error);
      return false;
    }
  }

  /**
   * Check if we're already paired (token exists)
   */
  checkPairing(): boolean {
    if (this.isPaired) return true;
    
    const stored = localStorage.getItem('agent_bearer_token');
    if (stored) {
      this.bearerToken = stored;
      this.isPaired = true;
      return true;
    }
    
    return false;
  }

  /**
   * Send a message to the agent for AI processing
   */
  async sendMessage(message: string): Promise<AgentResponse> {
    return this.makeRequest({
      task: 'chat',
      params: { message },
    });
  }

  /**
   * Execute a Python script via the agent
   */
  async executePythonScript(request: PythonToolRequest): Promise<AgentResponse> {
    return this.makeRequest({
      task: 'python_execute',
      params: request,
    });
  }

  /**
   * AutoCAD automation tasks
   */
  async generateFloorPlan(specs: {
    width: number;
    height: number;
    rooms: number;
    output_path?: string;
  }): Promise<AgentResponse> {
    return this.executePythonScript({
      script: 'suite_autocad_generator.py',
      args: {
        task: 'floor_plan',
        params: specs,
      },
    });
  }

  async calculateElectricalGrid(specs: {
    conductor_size?: string;
    grid_spacing?: number;
    soil_resistivity?: number;
    fault_current?: number;
  }): Promise<AgentResponse> {
    return this.executePythonScript({
      script: 'suite_autocad_generator.py',
      args: {
        task: 'electrical_grid',
        params: specs,
      },
    });
  }

  async calculateVoltageDrop(specs: {
    length: number;
    current: number;
    voltage?: number;
    conductor?: 'Copper' | 'Aluminum';
  }): Promise<AgentResponse> {
    return this.executePythonScript({
      script: 'suite_autocad_generator.py',
      args: {
        task: 'voltage_drop',
        params: specs,
      },
    });
  }

  /**
   * Project management AI tasks
   */
  async analyzeProject(projectData: any): Promise<AgentResponse> {
    return this.sendMessage(
      `Analyze this electrical engineering project and provide recommendations: ${JSON.stringify(projectData)}`
    );
  }

  async forecastTimeline(projectData: {
    type: string;
    complexity: 'low' | 'medium' | 'high';
    team_size?: number;
  }): Promise<AgentResponse> {
    return this.sendMessage(
      `Based on similar projects in memory, forecast the timeline for: ${JSON.stringify(projectData)}`
    );
  }

  async generateTransmittal(data: {
    project_id: string;
    files: string[];
    recipient: string;
    notes?: string;
  }): Promise<AgentResponse> {
    return this.makeRequest({
      task: 'generate_transmittal',
      params: data,
    });
  }

  /**
   * Memory management
   */
  async rememberProjectPattern(pattern: string): Promise<AgentResponse> {
    return this.makeRequest({
      task: 'memory_store',
      params: {
        content: pattern,
        tags: ['project_pattern', 'suite'],
      },
    });
  }

  async recallSimilarProjects(query: string): Promise<AgentResponse> {
    return this.makeRequest({
      task: 'memory_recall',
      params: { query },
    });
  }

  /**
   * Research and documentation
   */
  async researchStandard(standard: string): Promise<AgentResponse> {
    return this.sendMessage(
      `Research and summarize key requirements from ${standard} standard for electrical engineering`
    );
  }

  async generateDocumentation(specs: {
    type: 'design_report' | 'calculation_sheet' | 'test_report';
    data: any;
  }): Promise<AgentResponse> {
    return this.sendMessage(
      `Generate a ${specs.type} document based on: ${JSON.stringify(specs.data)}`
    );
  }

  /**
   * Core request method
   */
  private async makeRequest(task: AgentTask): Promise<AgentResponse> {
    if (!this.checkPairing()) {
      return {
        success: false,
        error: 'Not paired with agent. Please pair first.',
      };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify({
          message: JSON.stringify(task),
        }),
        signal: task.timeout ? AbortSignal.timeout(task.timeout) : undefined,
      });

      if (!response.ok) {
        throw new Error(`Agent request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: data,
        executionTime: executionTime,
      };
    } catch (error) {
      console.error('Agent request error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if agent is running and healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();

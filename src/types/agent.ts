/**
 * Agent Service Types
 * Defines all request/response structures for ZeroClaw agent communication
 */

export interface AgentResponse {
  success: boolean;
  data?: any;
  error?: string;
  taskId?: string;
  status?: 'pending' | 'running' | 'complete' | 'failed';
  executionTime?: number;
}

export interface PairingRequest {
  pairingCode: string;
}

export interface PairingResponse {
  token: string;
  agentId: string;
  expiresIn?: number;
}

export interface MessageRequest {
  message: string;
}

export interface MessageResponse {
  id: string;
  response: string;
  status: 'complete' | 'running';
  tokens?: {
    input: number;
    output: number;
  };
}

export interface ExecuteToolRequest {
  toolName: string;
  arguments: Record<string, any>;
}

export interface ExecuteToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
}

export interface DrawingListAnalysisResult {
  valid: boolean;
  totalDrawings: number;
  validDrawings: number;
  invalidDrawings: Array<{
    drawing: string;
    errors: string[];
  }>;
  suggestions: string[];
}

export interface TransmittalResult {
  success: boolean;
  documentPath?: string;
  documentType: 'pdf' | 'word' | 'json';
  drawingsIncluded: number;
  timestamp: string;
}

export interface ProjectAnalysisResult {
  projectId: string;
  summary: string;
  insights: string[];
  recommendations: string[];
  riskFactors?: string[];
  timeline?: {
    estimated: string;
    criticalPath: string[];
  };
}

export interface FloorPlanResult {
  success: boolean;
  svgData?: string;
  imagePath?: string;
  dimensions: {
    width: number;
    height: number;
  };
  elements: Array<{
    id: string;
    type: string;
    coordinates: [number, number];
  }>;
}

export interface ResearchResult {
  success: boolean;
  topic: string;
  summary: string;
  sources?: string[];
  keyFindings: string[];
  relevantStandards?: string[];
  complianceNotes?: string[];
}

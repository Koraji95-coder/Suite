export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ConversationContext {
  panelContext: string;
  projectId?: string;
  activeData?: any;
  [key: string]: any;
}

export interface SavedConversation {
  id: string;
  panel_context: string;
  updated_at: string;
  // other fields from DB
}

export interface Memory {
  id: string;
  memory_type: 'preference' | 'knowledge' | 'pattern' | 'relationship';
  content: {
    title?: string;
    description?: string;
    [key: string]: any;
  };
  connections: string[];
  strength: number;
  created_at: string;
  last_accessed: string;
}

export interface ComplianceCheck {
  id: string;
  title: string;
  description: string;
  standard: string;
  result: 'pass' | 'fail' | 'warning';
  details: string;
}

export interface CircuitDesign {
  id: string;
  description: string;
  components: string[];
  schematic: string;
  notes: string;
}

export interface ComponentSpec {
  id: string;
  name: string;
  manufacturer: string;
  partNumber: string;
  specs: Record<string, string>;
  datasheetUrl?: string;
}

export interface Calculation {
  id: string;
  query: string;
  result: string;
  steps: string[];
  formula: string;
  notes: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  size: string;
  pages: number;
  uploadedAt: string;
  status: 'processed' | 'processing' | 'failed';
  summary?: string;
}
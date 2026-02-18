export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export interface Memory {
  id: string;
  memory_type: 'preference' | 'knowledge' | 'pattern' | 'relationship';
  content: string;
  connections: string[];
  strength: number;
  created_at: string;
}

export type AIProvider = 'ollama' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  ollamaUrl: string;
  ollamaModel: string;
  openaiModel: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  openaiModel: 'gpt-4o',
};

import { supabase } from '@/lib/supabase';
import type { Message, Conversation, Memory, AIConfig } from './types';
import { DEFAULT_AI_CONFIG } from './types';
import { createProvider } from './providers';

const CONFIG_KEY = 'ai-config';

export function getConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_AI_CONFIG, ...JSON.parse(stored) };
    }
  } catch {
    // corrupted storage, fall through to default
  }
  return { ...DEFAULT_AI_CONFIG };
}

export function saveConfig(config: AIConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function sendMessage(
  messages: Message[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const config = getConfig();
  const provider = createProvider(config);
  return provider.chat(messages, onChunk);
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const { data, error } = await (supabase.from('ai_conversations') as any)
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title ?? row.panel_context ?? 'Untitled',
      messages: row.messages ?? [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (err) {
    console.error('Failed to load conversations:', err);
    return [];
  }
}

export async function saveConversation(conversation: Conversation): Promise<Conversation> {
  try {
    const { data, error } = await (supabase.from('ai_conversations') as any)
      .upsert({
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages,
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return {
        id: data.id,
        title: data.title ?? 'Untitled',
        messages: data.messages ?? [],
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }

    return conversation;
  } catch (err) {
    console.error('Failed to save conversation:', err);
    return conversation;
  }
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    const { error } = await (supabase.from('ai_conversations') as any)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed to delete conversation:', err);
    return false;
  }
}

export async function loadMemories(
  memoryType?: Memory['memory_type']
): Promise<Memory[]> {
  try {
    let query = (supabase.from('ai_memory') as any)
      .select('*')
      .order('strength', { ascending: false });

    if (memoryType) {
      query = query.eq('memory_type', memoryType);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      memory_type: row.memory_type,
      content: row.content,
      connections: row.connections ?? [],
      strength: row.strength ?? 50,
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error('Failed to load memories:', err);
    return [];
  }
}

export async function saveMemory(memory: Omit<Memory, 'id' | 'created_at'>): Promise<Memory | null> {
  try {
    const { data, error } = await (supabase.from('ai_memory') as any)
      .insert({
        memory_type: memory.memory_type,
        content: memory.content,
        connections: memory.connections,
        strength: memory.strength,
      })
      .select()
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return {
        id: data.id,
        memory_type: data.memory_type,
        content: data.content,
        connections: data.connections ?? [],
        strength: data.strength ?? 50,
        created_at: data.created_at,
      };
    }

    return null;
  } catch (err) {
    console.error('Failed to save memory:', err);
    return null;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    const { error } = await (supabase.from('ai_memory') as any)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed to delete memory:', err);
    return false;
  }
}

export function buildSystemPrompt(memories: Memory[]): string {
  let prompt = `You are an expert AI assistant specialized in electrical engineering, helping with:
- Power system analysis and calculations
- Three-phase system analysis
- Circuit design and analysis
- Electrical standards (NEC, IEEE)
- Equipment specifications and selection
- AutoCAD and CAD file management
- Engineering calculations and formulas
- Project management for electrical projects

You provide clear, accurate, and practical advice while maintaining technical accuracy.`;

  const preferences = memories.filter(m => m.memory_type === 'preference');
  const knowledge = memories.filter(m => m.memory_type === 'knowledge');
  const patterns = memories.filter(m => m.memory_type === 'pattern');
  const relationships = memories.filter(m => m.memory_type === 'relationship');

  if (preferences.length > 0) {
    prompt += '\n\nUser preferences:\n';
    prompt += preferences.map(m => `- ${m.content}`).join('\n');
  }

  if (knowledge.length > 0) {
    prompt += '\n\nRelevant knowledge:\n';
    prompt += knowledge.map(m => `- ${m.content}`).join('\n');
  }

  if (patterns.length > 0) {
    prompt += '\n\nObserved patterns:\n';
    prompt += patterns.map(m => `- ${m.content}`).join('\n');
  }

  if (relationships.length > 0) {
    prompt += '\n\nKnown relationships:\n';
    prompt += relationships.map(m => `- ${m.content}`).join('\n');
  }

  return prompt;
}

import { supabase } from '../../lib/supabase';
import type { Message, ConversationContext } from './aitypes';

export class AIService {
  private ollamaUrl: string;
  private model: string;
  private conversationId: string | null = null;

  constructor(
    ollamaUrl: string = 'http://localhost:11434',
    model: string = 'llama3.2'
  ) {
    this.ollamaUrl = ollamaUrl;
    this.model = model;
  }

  async checkOllamaConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      console.error('Ollama connection error:', error);
      return false;
    }
  }

  async listAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }

  setModel(model: string) {
    this.model = model;
  }

  async chat(
    messages: Message[],
    context?: ConversationContext,
    onStream?: (chunk: string) => void
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(context);

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: fullMessages,
          stream: !!onStream,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      if (onStream && response.body) {
        return await this.handleStreamResponse(response.body, onStream);
      } else {
        const data = await response.json();
        return data.message?.content || '';
      }
    } catch (error) {
      console.error('AI chat error:', error);
      throw error;
    }
  }

  private async handleStreamResponse(
    body: ReadableStream<Uint8Array>,
    onStream: (chunk: string) => void
  ): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              fullResponse += json.message.content;
              onStream(json.message.content);
            }
          } catch (e) {
            console.error('Error parsing stream chunk:', e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  }

  private buildSystemPrompt(context?: ConversationContext): string {
    let prompt = `You are an expert AI assistant specialized in electrical engineering, specifically designed to help with:

- Power system analysis and calculations
- Three-phase system analysis
- Circuit design and analysis
- Electrical standards (NEC, IEEE)
- Equipment specifications and selection
- AutoCAD and CAD file management
- Engineering calculations and formulas
- Project management for electrical projects

You provide clear, accurate, and practical advice. You explain complex concepts in an understandable way while maintaining technical accuracy.`;

    if (context?.panelContext) {
      prompt += `\n\nCurrent Context: The user is currently working in the ${context.panelContext} section of the application.`;

      switch (context.panelContext) {
        case 'Dashboard':
          prompt += ' They may need help with project overview, deadlines, or navigation.';
          break;
        case 'Projects':
          prompt += ' They may need help with project management, tasks, or file organization.';
          break;
        case 'Knowledge Base':
          prompt += ' They may need help with electrical engineering concepts, formulas, or calculations.';
          break;
        case 'Standards & Codes':
          prompt += ' They may need help with NEC codes, IEEE standards, or compliance checking.';
          break;
        case 'Equipment Library':
          prompt += ' They may need help with equipment specifications, ratings, or selection.';
          break;
        case 'Applications':
          prompt += ' They may need help with Block Library, automation, or CAD file management.';
          break;
      }
    }

    if (context?.projectId) {
      prompt += `\n\nThe user is working on a specific project (ID: ${context.projectId}).`;
    }

    return prompt;
  }

  async saveConversation(
    messages: Message[],
    context?: ConversationContext
  ): Promise<string> {
    if (this.conversationId) {
      const { error } = await supabase
        .from('ai_conversations')
        .update({
          messages: messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.conversationId);

      if (error) {
        console.error('Error updating conversation:', error);
      }
      return this.conversationId;
    } else {
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          panel_context: context?.panelContext || 'Unknown',
          messages: messages,
          context_data: context || {},
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving conversation:', error);
        throw error;
      }

      this.conversationId = data.id;
      return data.id;
    }
  }

  async loadConversation(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('messages')
      .eq('id', conversationId)
      .single();

    if (error) {
      console.error('Error loading conversation:', error);
      return [];
    }

    this.conversationId = conversationId;
    return data.messages || [];
  }

  async listConversations(limit: number = 20): Promise<any[]> {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error listing conversations:', error);
      return [];
    }

    return data || [];
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', conversationId);

    if (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }

    if (this.conversationId === conversationId) {
      this.conversationId = null;
    }

    return true;
  }

  async saveMemory(
    memoryType: 'preference' | 'knowledge' | 'pattern' | 'relationship',
    content: any,
    connections: any[] = [],
    strength: number = 50
  ): Promise<boolean> {
    const { error } = await supabase
      .from('ai_memory')
      .insert({
        memory_type: memoryType,
        content: content,
        connections: connections,
        strength: strength,
      });

    if (error) {
      console.error('Error saving memory:', error);
      return false;
    }

    return true;
  }

  async getMemories(
    memoryType?: 'preference' | 'knowledge' | 'pattern' | 'relationship'
  ): Promise<any[]> {
    let query = supabase
      .from('ai_memory')
      .select('*')
      .order('strength', { ascending: false });

    if (memoryType) {
      query = query.eq('memory_type', memoryType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching memories:', error);
      return [];
    }

    return data || [];
  }

  newConversation() {
    this.conversationId = null;
  }
}

export const aiService = new AIService();

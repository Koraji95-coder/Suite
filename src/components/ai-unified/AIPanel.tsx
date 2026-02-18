import React, { useState, useEffect, useCallback } from 'react';
import { Brain } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { Conversation, Message, Memory } from '@/lib/ai/types';
import {
  loadConversations,
  saveConversation,
  deleteConversation,
  loadMemories,
  saveMemory,
  deleteMemory,
  sendMessage,
  buildSystemPrompt,
} from '@/lib/ai/service';
import { ConversationSidebar } from './ConversationSidebar';
import { ChatArea } from './ChatArea';
import { WelcomeScreen } from './WelcomeScreen';
import { MemoryPanel } from './MemoryPanel';

function generateId(): string {
  return crypto.randomUUID();
}

export function AIPanel() {
  const { palette } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    loadConversations().then(setConversations);
    loadMemories().then(setMemories);
  }, []);

  const createNewConversation = useCallback((): Conversation => {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      created_at: now,
      updated_at: now,
    };
    setConversations((prev) => [conv, ...prev]);
    setSelectedId(conv.id);
    return conv;
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      let conv = selectedConversation;
      if (!conv) {
        conv = createNewConversation();
      }

      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      const updatedMessages = [...conv.messages, userMsg];
      const title = conv.messages.length === 0
        ? text.slice(0, 50) + (text.length > 50 ? '...' : '')
        : conv.title;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv!.id
            ? { ...c, messages: [...updatedMessages, assistantMsg], title, updated_at: new Date().toISOString() }
            : c
        )
      );
      if (!selectedId) setSelectedId(conv.id);

      setIsStreaming(true);

      const systemMsg: Message = {
        id: 'system',
        role: 'system',
        content: buildSystemPrompt(memories),
        timestamp: new Date(),
      };

      try {
        const fullResponse = await sendMessage(
          [systemMsg, ...updatedMessages],
          (chunk) => {
            assistantMsg.content += chunk;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conv!.id
                  ? {
                      ...c,
                      messages: [...updatedMessages, { ...assistantMsg }],
                      title,
                      updated_at: new Date().toISOString(),
                    }
                  : c
              )
            );
          }
        );

        assistantMsg.content = fullResponse;
        const finalConv: Conversation = {
          ...conv,
          title,
          messages: [...updatedMessages, { ...assistantMsg }],
          updated_at: new Date().toISOString(),
        };

        setConversations((prev) =>
          prev.map((c) => (c.id === conv!.id ? finalConv : c))
        );

        await saveConversation(finalConv);
      } catch (err) {
        assistantMsg.content = 'Sorry, something went wrong. Please try again.';
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conv!.id
              ? { ...c, messages: [...updatedMessages, { ...assistantMsg }] }
              : c
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [selectedConversation, selectedId, createNewConversation, memories]
  );

  const handleDeleteConversation = useCallback(async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    await deleteConversation(id);
  }, [selectedId]);

  const handleAddMemory = useCallback(async () => {
    const content = window.prompt('Enter memory content:');
    if (!content?.trim()) return;
    const mem = await saveMemory({
      memory_type: 'knowledge',
      content: content.trim(),
      connections: [],
      strength: 50,
    });
    if (mem) setMemories((prev) => [mem, ...prev]);
  }, []);

  const handleDeleteMemory = useCallback(async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await deleteMemory(id);
  }, []);

  const handleSuggestionClick = useCallback(
    async (text: string) => {
      const conv = createNewConversation();
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      const title = text.slice(0, 50) + (text.length > 50 ? '...' : '');

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id
            ? { ...c, messages: [userMsg, assistantMsg], title, updated_at: new Date().toISOString() }
            : c
        )
      );

      setIsStreaming(true);
      const systemMsg: Message = {
        id: 'system',
        role: 'system',
        content: buildSystemPrompt(memories),
        timestamp: new Date(),
      };

      try {
        const fullResponse = await sendMessage(
          [systemMsg, userMsg],
          (chunk) => {
            assistantMsg.content += chunk;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conv.id
                  ? { ...c, messages: [userMsg, { ...assistantMsg }], title, updated_at: new Date().toISOString() }
                  : c
              )
            );
          }
        );
        assistantMsg.content = fullResponse;
        const finalConv: Conversation = {
          ...conv,
          title,
          messages: [userMsg, { ...assistantMsg }],
          updated_at: new Date().toISOString(),
        };
        setConversations((prev) =>
          prev.map((c) => (c.id === conv.id ? finalConv : c))
        );
        await saveConversation(finalConv);
      } catch {
        assistantMsg.content = 'Sorry, something went wrong. Please try again.';
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conv.id
              ? { ...c, messages: [userMsg, { ...assistantMsg }] }
              : c
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [createNewConversation, memories]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: palette.background,
        color: palette.text,
      }}
    >
      <div
        style={{
          height: 48,
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
          background: palette.surface,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {selectedConversation ? selectedConversation.title : 'AI Assistant'}
        </span>
        <button
          onClick={() => setMemoryPanelOpen((v) => !v)}
          style={{
            background: memoryPanelOpen
              ? hexToRgba(palette.primary, 0.15)
              : 'transparent',
            border: memoryPanelOpen
              ? `1px solid ${hexToRgba(palette.primary, 0.25)}`
              : '1px solid transparent',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: memoryPanelOpen ? palette.primary : palette.textMuted,
            fontSize: 12,
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
        >
          <Brain size={15} />
          Memory
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <ConversationSidebar
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={createNewConversation}
          onDelete={handleDeleteConversation}
        />

        {selectedConversation ? (
          <ChatArea
            messages={selectedConversation.messages}
            onSend={handleSend}
            isStreaming={isStreaming}
          />
        ) : (
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
        )}

        {memoryPanelOpen && (
          <MemoryPanel
            memories={memories}
            onAdd={handleAddMemory}
            onDelete={handleDeleteMemory}
          />
        )}
      </div>
    </div>
  );
}

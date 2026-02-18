import React, { useRef, useEffect, useState } from 'react';
import { Send, Bot } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { Message } from '@/lib/ai/types';

interface ChatAreaProps {
  messages: Message[];
  onSend: (text: string) => void;
  isStreaming: boolean;
}

function StreamingDots({ color }: { color: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}

export function ChatArea({ messages, onSend, isStreaming }: ChatAreaProps) {
  const { palette } = useTheme();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
      }}
    >
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              {!isUser && (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: hexToRgba(palette.primary, 0.15),
                    border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Bot size={14} style={{ color: palette.primary }} />
                </div>
              )}
              <div
                style={{
                  maxWidth: '70%',
                  padding: '10px 14px',
                  borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: isUser
                    ? hexToRgba(palette.primary, 0.18)
                    : palette.surface,
                  border: `1px solid ${hexToRgba(
                    isUser ? palette.primary : palette.surfaceLight,
                    isUser ? 0.25 : 0.6
                  )}`,
                  color: palette.text,
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: hexToRgba(palette.primary, 0.15),
                border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Bot size={14} style={{ color: palette.primary }} />
            </div>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '14px 14px 14px 4px',
                background: palette.surface,
                border: `1px solid ${hexToRgba(palette.surfaceLight, 0.6)}`,
              }}
            >
              <StreamingDots color={palette.primary} />
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: palette.surface,
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isStreaming}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
            background: hexToRgba(palette.surfaceLight, 0.5),
            color: palette.text,
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = hexToRgba(palette.primary, 0.4);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = hexToRgba(palette.primary, 0.15);
          }}
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: 'none',
            background: input.trim() && !isStreaming
              ? palette.primary
              : hexToRgba(palette.primary, 0.15),
            color: input.trim() && !isStreaming
              ? palette.background
              : palette.textMuted,
            cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

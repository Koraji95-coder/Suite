import React, { useRef, useEffect, useState, useCallback } from 'react';
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

/**
 * Renders assistant message content with basic inline formatting:
 * - `code` becomes <code> elements
 * - **bold** becomes <strong> elements
 * - Whitespace is preserved via pre-wrap on the container
 */
function renderFormattedContent(content: string, palette: { primary: string; surfaceLight: string }) {
  if (!content) return null;

  // Split by backtick-wrapped code segments first, then handle bold within non-code segments
  const parts: React.ReactNode[] = [];
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(content)) !== null) {
    // Process text before this code match for bold markers
    if (match.index > lastIndex) {
      parts.push(...renderBoldSegments(content.slice(lastIndex, match.index), parts.length, palette));
    }
    // Render the inline code
    parts.push(
      <code
        key={`code-${match.index}`}
        style={{
          background: hexToRgba(palette.surfaceLight, 0.8),
          border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.9em',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        }}
      >
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }

  // Process remaining text after last code match
  if (lastIndex < content.length) {
    parts.push(...renderBoldSegments(content.slice(lastIndex), parts.length, palette));
  }

  return parts;
}

function renderBoldSegments(
  text: string,
  keyOffset: number,
  _palette: { primary: string; surfaceLight: string }
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`bold-${keyOffset}-${match.index}`}>
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

const TEXTAREA_MAX_HEIGHT = 160;
const SCROLL_NEAR_BOTTOM_THRESHOLD = 80;

export function ChatArea({ messages, onSend, isStreaming }: ChatAreaProps) {
  const { palette } = useTheme();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);

  // Track whether the user is near the bottom of the scroll container
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= SCROLL_NEAR_BOTTOM_THRESHOLD;
  }, []);

  // Auto-scroll only when already near the bottom
  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-grow the textarea as the user types
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Reset to auto so shrinking works when lines are deleted
    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    el.style.height = `${Math.min(scrollH, TEXTAREA_MAX_HEIGHT)}px`;
    el.style.overflowY = scrollH > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput('');
    // After sending, force scroll to bottom
    isNearBottomRef.current = true;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Determine whether the streaming dots indicator should appear.
  // Only show the standalone dots block when streaming AND the last
  // assistant message has no content yet (i.e. we haven't started
  // receiving text from the model).
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const showStreamingDots =
    isStreaming &&
    (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.content);

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
        onScroll={handleScroll}
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
          const isAssistant = msg.role === 'assistant';
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
                {isAssistant
                  ? renderFormattedContent(msg.content, palette)
                  : msg.content}
                {/* Show dots inline for the currently-streaming assistant message when content has started */}
                {isAssistant &&
                  isStreaming &&
                  msg === lastMsg &&
                  msg.content && (
                    <span style={{ marginLeft: 4 }}>
                      <StreamingDots color={palette.primary} />
                    </span>
                  )}
              </div>
            </div>
          );
        })}

        {showStreamingDots && (
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
          alignItems: 'flex-end',
          background: palette.surface,
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isStreaming}
          rows={1}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
            background: hexToRgba(palette.surfaceLight, 0.5),
            color: palette.text,
            fontSize: 13,
            lineHeight: 1.55,
            outline: 'none',
            transition: 'border-color 0.2s ease',
            resize: 'none',
            fontFamily: 'inherit',
            maxHeight: TEXTAREA_MAX_HEIGHT,
            overflowY: 'hidden',
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

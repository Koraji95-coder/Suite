import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Search, MessageSquare } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { Conversation } from '@/lib/ai/types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}: ConversationSidebarProps) {
  const { palette } = useTheme();
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.messages.some((m) =>
            m.content.toLowerCase().includes(search.toLowerCase())
          )
      ),
    [conversations, search]
  );

  return (
    <div
      style={{
        width: 260,
        minWidth: 260,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: palette.surface,
        borderRight: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
      }}
    >
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={onNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
            background: hexToRgba(palette.primary, 0.1),
            color: palette.primary,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Plus size={16} />
          New Chat
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 8,
            background: hexToRgba(palette.surfaceLight, 0.6),
            border: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
          }}
        >
          <Search size={14} style={{ color: palette.textMuted, flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: palette.text,
              fontSize: 12,
              width: '100%',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {filtered.map((conv) => {
          const isSelected = conv.id === selectedId;
          const isHovered = conv.id === hoveredId;
          const lastMsg = conv.messages[conv.messages.length - 1];
          const preview = lastMsg
            ? lastMsg.content.slice(0, 60) + (lastMsg.content.length > 60 ? '...' : '')
            : 'No messages yet';

          return (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                padding: '10px 10px',
                borderRadius: 8,
                marginBottom: 2,
                cursor: 'pointer',
                background: isSelected
                  ? hexToRgba(palette.primary, 0.15)
                  : isHovered
                    ? hexToRgba(palette.primary, 0.06)
                    : 'transparent',
                border: isSelected
                  ? `1px solid ${hexToRgba(palette.primary, 0.25)}`
                  : '1px solid transparent',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={13} style={{ color: palette.textMuted, flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: isSelected ? palette.primary : palette.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {conv.title}
                </span>
                <span style={{ fontSize: 10, color: palette.textMuted, flexShrink: 0 }}>
                  {relativeTime(conv.updated_at)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: palette.textMuted,
                  marginTop: 3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: isHovered ? 24 : 0,
                }}
              >
                {preview}
              </div>
              {isHovered && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: palette.textMuted,
                    padding: 2,
                    display: 'flex',
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

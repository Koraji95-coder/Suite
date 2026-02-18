import React, { useState } from 'react';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { Memory } from '@/lib/ai/types';

interface MemoryPanelProps {
  memories: Memory[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}

const TYPE_COLORS: Record<Memory['memory_type'], string> = {
  knowledge: '#14b8a6',
  preference: '#f59e0b',
  pattern: '#3b82f6',
  relationship: '#f43f5e',
};

const TYPE_LABELS: Record<Memory['memory_type'], string> = {
  knowledge: 'Knowledge',
  preference: 'Preference',
  pattern: 'Pattern',
  relationship: 'Relationship',
};

export function MemoryPanel({ memories, onAdd, onDelete }: MemoryPanelProps) {
  const { palette } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      style={{
        width: 260,
        minWidth: 260,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: palette.surface,
        borderLeft: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={16} style={{ color: palette.primary }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: palette.text }}>
            Memories
          </span>
          <span
            style={{
              fontSize: 11,
              color: palette.textMuted,
              background: hexToRgba(palette.primary, 0.1),
              padding: '1px 7px',
              borderRadius: 10,
            }}
          >
            {memories.length}
          </span>
        </div>
        <button
          onClick={onAdd}
          style={{
            background: hexToRgba(palette.primary, 0.1),
            border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
            borderRadius: 6,
            color: palette.primary,
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {memories.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: palette.textMuted,
              fontSize: 12,
              padding: '24px 12px',
            }}
          >
            No memories stored yet.
          </div>
        )}

        {memories.map((mem) => {
          const typeColor = TYPE_COLORS[mem.memory_type];
          const isHovered = hoveredId === mem.id;

          return (
            <div
              key={mem.id}
              onMouseEnter={() => setHoveredId(mem.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                padding: '10px 10px',
                borderRadius: 8,
                marginBottom: 4,
                background: isHovered
                  ? hexToRgba(palette.surfaceLight, 0.5)
                  : 'transparent',
                transition: 'background 0.15s ease',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: typeColor,
                    background: hexToRgba(typeColor, 0.12),
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  {TYPE_LABELS[mem.memory_type]}
                </span>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: palette.text,
                  lineHeight: 1.45,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  paddingRight: isHovered ? 20 : 0,
                }}
              >
                {mem.content}
              </div>

              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: hexToRgba(palette.surfaceLight, 0.8),
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${mem.strength}%`,
                      height: '100%',
                      borderRadius: 2,
                      background: typeColor,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: 10, color: palette.textMuted, minWidth: 24 }}>
                  {mem.strength}%
                </span>
              </div>

              {isHovered && (
                <button
                  onClick={() => onDelete(mem.id)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: 10,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: palette.textMuted,
                    padding: 2,
                    display: 'flex',
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

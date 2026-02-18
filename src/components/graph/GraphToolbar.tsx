import React from 'react';
import { Box, Layers, Search, Plus } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { ViewMode, SourceFilter } from './types';

interface GraphToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sourceFilter: SourceFilter;
  onSourceFilterChange: (filter: SourceFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddMemory: () => void;
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'memory', label: 'Memory' },
  { value: 'both', label: 'Both' },
];

export function GraphToolbar({
  viewMode,
  onViewModeChange,
  sourceFilter,
  onSourceFilterChange,
  searchQuery,
  onSearchChange,
  onAddMemory,
}: GraphToolbarProps) {
  const { palette } = useTheme();

  const btnBase: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 6,
    border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
    background: hexToRgba(palette.surface, 0.6),
    color: palette.textMuted,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.2s',
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: hexToRgba(palette.primary, 0.2),
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: hexToRgba(palette.surface, 0.85),
        borderBottom: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        {SOURCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onSourceFilterChange(opt.value)}
            style={sourceFilter === opt.value ? btnActive : btnBase}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 24, background: hexToRgba(palette.textMuted, 0.2), margin: '0 4px' }} />

      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onViewModeChange('3d')} style={viewMode === '3d' ? btnActive : btnBase}>
          <Box size={14} style={{ marginRight: 4, verticalAlign: -2 }} />3D
        </button>
        <button onClick={() => onViewModeChange('2d')} style={viewMode === '2d' ? btnActive : btnBase}>
          <Layers size={14} style={{ marginRight: 4, verticalAlign: -2 }} />2D
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 120, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: palette.textMuted }} />
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px 6px 30px',
            borderRadius: 6,
            border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
            background: hexToRgba(palette.background, 0.8),
            color: palette.text,
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      <button onClick={onAddMemory} style={btnBase} title="Add Memory">
        <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />Memory
      </button>
    </div>
  );
}

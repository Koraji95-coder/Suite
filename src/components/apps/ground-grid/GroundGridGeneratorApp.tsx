import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { CoordinatesGrabber } from '../CoordinatesGrabber';
import { GridGeneratorPanel } from './GridGeneratorPanel';

type TabId = 'grabber' | 'generator';

const TABS: { id: TabId; label: string }[] = [
  { id: 'grabber', label: 'Coordinate Grabber' },
  { id: 'generator', label: 'Grid Generator' },
];

export function GroundGridGeneratorApp() {
  const { palette } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>('generator');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '16px 24px 0',
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          background: palette.surface,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${hexToRgba('#f59e0b', 0.2)}, ${hexToRgba('#ea580c', 0.2)})`,
            }}
          >
            <MapPin size={24} color="#f59e0b" />
          </div>
          <div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                background: `linear-gradient(90deg, #f59e0b, #ea580c)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Ground Grid Generator
            </h2>
            <p style={{ fontSize: 12, color: palette.textMuted, margin: 0, marginTop: 2 }}>
              Extract coordinates and generate ground grid designs
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(tab => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s',
                  background: active ? hexToRgba(palette.surfaceLight, 0.8) : 'transparent',
                  color: active ? palette.text : palette.textMuted,
                  borderBottom: active ? `2px solid #f59e0b` : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'grabber' && <CoordinatesGrabber />}
        {activeTab === 'generator' && <GridGeneratorPanel />}
      </div>
    </div>
  );
}

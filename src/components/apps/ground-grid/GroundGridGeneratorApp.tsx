import { useState, useRef } from 'react';
import { MapPin, ScrollText } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { CoordinatesGrabber } from '../CoordinatesGrabber';
import { GridGeneratorPanel } from './GridGeneratorPanel';
import { UnifiedLog } from './UnifiedLog';
import { GroundGridProvider, useGroundGrid } from './GroundGridContext';
import { GroundGridSplash } from './GroundGridSplash';

const SESSION_KEY = 'gg-splash-shown';

type TabId = 'grabber' | 'generator' | 'log';

const TABS: { id: TabId; label: string }[] = [
  { id: 'grabber', label: 'Coordinate Grabber' },
  { id: 'generator', label: 'Grid Generator' },
  { id: 'log', label: 'Log' },
];

function GroundGridGeneratorInner() {
  const { palette } = useTheme();
  const { backendConnected, logs } = useGroundGrid();
  const [activeTab, setActiveTab] = useState<TabId>('generator');
  const alreadyShown = useRef(sessionStorage.getItem(SESSION_KEY) === '1');
  const [showSplash, setShowSplash] = useState(!alreadyShown.current);

  const handleSplashComplete = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setShowSplash(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {showSplash && <GroundGridSplash onComplete={handleSplashComplete} />}

      <div
        style={{
          padding: '16px 24px 0',
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          background: hexToRgba(palette.surface, 0.85),
          backdropFilter: 'blur(8px)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
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
          <div style={{ flex: 1 }}>
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
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 6,
              background: backendConnected
                ? hexToRgba('#22c55e', 0.1)
                : hexToRgba('#f59e0b', 0.08),
              border: `1px solid ${backendConnected
                ? hexToRgba('#22c55e', 0.3)
                : hexToRgba('#f59e0b', 0.2)}`,
              fontSize: 11, fontWeight: 500,
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: backendConnected ? '#22c55e' : '#f59e0b',
            }} />
            <span style={{ color: backendConnected ? '#22c55e' : '#f59e0b' }}>
              {backendConnected ? 'AutoCAD Connected' : 'AutoCAD Offline'}
            </span>
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {tab.id === 'log' && <ScrollText size={13} />}
                {tab.label}
                {tab.id === 'log' && logs.length > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    padding: '1px 5px', borderRadius: 8,
                    background: hexToRgba(palette.primary, 0.15),
                    color: palette.textMuted,
                  }}>
                    {logs.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <div style={{ height: '100%', overflow: 'auto', display: activeTab === 'grabber' ? 'block' : 'none' }}>
          <CoordinatesGrabber />
        </div>
        <div style={{ height: '100%', overflow: 'auto', display: activeTab === 'generator' ? 'block' : 'none' }}>
          <GridGeneratorPanel />
        </div>
        <div style={{ height: '100%', display: activeTab === 'log' ? 'flex' : 'none', flexDirection: 'column' }}>
          <UnifiedLog />
        </div>
      </div>
    </div>
  );
}

export function GroundGridGeneratorApp() {
  return (
    <GroundGridProvider>
      <GroundGridGeneratorInner />
    </GroundGridProvider>
  );
}

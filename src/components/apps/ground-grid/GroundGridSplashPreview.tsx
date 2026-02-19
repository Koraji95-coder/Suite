import { useState } from 'react';
import { Play, MapPin } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { GroundGridSplash } from './GroundGridSplash';

export function GroundGridSplashPreview() {
  const { palette } = useTheme();
  const [showSplash, setShowSplash] = useState(false);

  return (
    <>
      {showSplash && <GroundGridSplash onComplete={() => setShowSplash(false)} />}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 24,
          padding: 32,
        }}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${hexToRgba('#f59e0b', 0.12)}, ${hexToRgba('#ea580c', 0.08)})`,
            border: `1px solid ${hexToRgba('#f59e0b', 0.2)}`,
          }}
        >
          <MapPin size={48} color="#f59e0b" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              margin: 0,
              background: 'linear-gradient(90deg, #f59e0b, #ea580c)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Ground Grid Splash Preview
          </h2>
          <p style={{ fontSize: 13, color: palette.textMuted, marginTop: 8, maxWidth: 400 }}>
            Preview the animated splash screen for the Ground Grid Generator app.
            Click the button below to see the full-screen animation.
          </p>
        </div>

        <button
          onClick={() => setShowSplash(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 32px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 700,
            color: palette.background,
            background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
            boxShadow: `0 8px 24px ${hexToRgba('#f59e0b', 0.3)}`,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <Play size={18} />
          Preview Splash
        </button>
      </div>
    </>
  );
}

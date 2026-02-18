import React from 'react';
import { Zap, Calculator, BookOpen, BarChart3 } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { Surface } from '@/components/ui/Surface';

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  { text: 'Explain a circuit concept', icon: Zap },
  { text: 'Help with calculations', icon: Calculator },
  { text: 'Review design standards', icon: BookOpen },
  { text: 'Analyze project data', icon: BarChart3 },
];

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  const { palette } = useTheme();

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        gap: 32,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: palette.text,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          How can I help?
        </h2>
        <p
          style={{
            fontSize: 14,
            color: palette.textMuted,
            marginTop: 8,
          }}
        >
          Select a topic below or start typing a message.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          maxWidth: 420,
          width: '100%',
        }}
      >
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Surface
              key={s.text}
              hover
              onClick={() => onSuggestionClick(s.text)}
              style={{
                padding: '16px 14px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: hexToRgba(palette.primary, 0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={16} style={{ color: palette.primary }} />
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: palette.text,
                }}
              >
                {s.text}
              </span>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}

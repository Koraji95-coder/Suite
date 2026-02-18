import { useState } from 'react';
import { COLOR_SCHEMES, type ColorScheme, hexToRgba, setActiveScheme, EMBER_PALETTE } from '../../lib/three/emberPalette';

function SchemeCard({ scheme, isActive, onSelect }: {
  scheme: ColorScheme;
  isActive: boolean;
  onSelect: () => void;
}) {
  const swatches = [
    { color: scheme.background, label: 'BG' },
    { color: scheme.surface, label: 'Surf' },
    { color: scheme.primary, label: 'Pri' },
    { color: scheme.secondary, label: 'Sec' },
    { color: scheme.tertiary, label: 'Ter' },
    { color: scheme.accent, label: 'Acc' },
  ];

  return (
    <button
      onClick={onSelect}
      className="text-left rounded-xl p-4 transition-all duration-300 hover:scale-[1.02]"
      style={{
        background: scheme.background,
        border: isActive
          ? `2px solid ${scheme.primary}`
          : `1px solid ${hexToRgba(scheme.primary, 0.25)}`,
        boxShadow: isActive
          ? `0 0 20px ${hexToRgba(scheme.primary, 0.3)}`
          : `0 4px 16px ${hexToRgba('#000000', 0.3)}`,
      }}
    >
      {/* Title */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold" style={{ color: scheme.text }}>
          {scheme.name}
        </h3>
        {isActive && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: scheme.primary, color: scheme.background }}
          >
            ACTIVE
          </span>
        )}
      </div>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: scheme.textMuted }}>
        {scheme.description}
      </p>

      {/* Color swatches */}
      <div className="flex gap-1.5 mb-3">
        {swatches.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5">
            <div
              className="w-6 h-6 rounded-md"
              style={{
                background: s.color,
                border: `1px solid ${hexToRgba('#ffffff', 0.15)}`,
              }}
            />
            <span className="text-[8px]" style={{ color: scheme.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Mini glass preview */}
      <div
        className="rounded-lg p-3"
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(scheme.primary, 0.12)} 0%, ${hexToRgba(scheme.surface, 0.50)} 50%, ${hexToRgba(scheme.primary, 0.06)} 100%)`,
          border: `1px solid ${hexToRgba(scheme.primary, 0.18)}`,
          boxShadow: `0 4px 12px ${hexToRgba(scheme.primary, 0.10)}, inset 1px 1px 0 ${hexToRgba('#ffffff', 0.06)}`,
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: scheme.primary }} />
          <span className="text-xs font-semibold" style={{ color: scheme.text }}>
            Sample Card
          </span>
        </div>
        <div className="flex gap-1">
          <div className="h-1 flex-1 rounded-full" style={{ background: scheme.primary, opacity: 0.6 }} />
          <div className="h-1 flex-1 rounded-full" style={{ background: scheme.secondary, opacity: 0.4 }} />
          <div className="h-1 w-6 rounded-full" style={{ background: scheme.tertiary, opacity: 0.3 }} />
        </div>
      </div>

      {/* Text preview */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] font-medium" style={{ color: scheme.text }}>Text</span>
        <span className="text-[10px]" style={{ color: scheme.textMuted }}>Muted</span>
        <span className="text-[10px] font-bold" style={{ color: scheme.primary }}>Primary</span>
        <span className="text-[10px] font-bold" style={{ color: scheme.accent }}>Accent</span>
      </div>
    </button>
  );
}

export function TestPreview() {
  const [activeKey, setActiveKey] = useState(() => {
    const entries = Object.entries(COLOR_SCHEMES);
    const match = entries.find(([, s]) => s.background === EMBER_PALETTE.background && s.primary === EMBER_PALETTE.primary);
    return match ? match[0] : entries[0][0];
  });

  const handleSelect = (key: string) => {
    setActiveKey(key);
    setActiveScheme(key);
  };

  return (
    <div className="relative w-full h-full min-h-screen overflow-hidden p-8">
      <h2 className="text-2xl font-bold mb-1" style={{ color: EMBER_PALETTE.text }}>
        🧪 Test Preview
      </h2>
      <p className="text-sm mb-6" style={{ color: EMBER_PALETTE.textMuted }}>
        Color scheme previews. Click a scheme to try it out.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {Object.entries(COLOR_SCHEMES).map(([key, scheme]) => (
          <SchemeCard
            key={key}
            scheme={scheme}
            isActive={activeKey === key}
            onSelect={() => handleSelect(key)}
          />
        ))}
      </div>
    </div>
  );
}
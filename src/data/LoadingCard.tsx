import { CheckCircle, Loader } from 'lucide-react';
import type { ReactNode } from 'react';
import { EMBER_PALETTE, hexToRgba } from '../lib/three/emberPalette';

interface LoadingCardProps {
  label: string;
  icon: ReactNode;
  isActive: boolean;
  isComplete: boolean;
  index: number;
  blockCount?: number;
}

export function LoadingCard({ label, icon, isActive, isComplete, index, blockCount }: LoadingCardProps) {
  const cardStyle: React.CSSProperties = {
    transitionDelay: `${index * 30}ms`,
    transform: isActive ? 'scale(1.02)' : 'scale(1)',
    ...(isActive
      ? {
          background: `linear-gradient(to right, ${hexToRgba(EMBER_PALETTE.primary, 0.25)}, ${hexToRgba(EMBER_PALETTE.secondary, 0.20)})`,
          borderColor: hexToRgba(EMBER_PALETTE.primary, 0.50),
          boxShadow: `0 10px 15px -3px ${hexToRgba(EMBER_PALETTE.primary, 0.20)}`,
        }
      : isComplete
      ? {
          background: `linear-gradient(to right, ${hexToRgba(EMBER_PALETTE.secondary, 0.20)}, ${hexToRgba(EMBER_PALETTE.primary, 0.15)})`,
          borderColor: hexToRgba(EMBER_PALETTE.secondary, 0.40),
        }
      : {
          background: hexToRgba(EMBER_PALETTE.background, 0.60),
          borderColor: hexToRgba(EMBER_PALETTE.primary, 0.20),
          opacity: 0.7,
        }),
  };

  const iconBgStyle: React.CSSProperties = isActive
    ? { background: hexToRgba(EMBER_PALETTE.primary, 0.20), boxShadow: `inset 0 2px 4px ${hexToRgba(EMBER_PALETTE.primary, 0.18)}` }
    : isComplete
    ? { background: hexToRgba(EMBER_PALETTE.secondary, 0.20) }
    : { background: hexToRgba(EMBER_PALETTE.background, 0.35) };

  return (
    <div
      className="group relative flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all duration-300 overflow-hidden"
      style={cardStyle}
    >
      {isActive && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: `linear-gradient(to right, ${hexToRgba(EMBER_PALETTE.primary, 0.06)}, transparent, ${hexToRgba(EMBER_PALETTE.secondary, 0.06)})`,
          }}
        />
      )}

      {isActive && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5"
          style={{
            background: `linear-gradient(to bottom, ${EMBER_PALETTE.primary}, ${EMBER_PALETTE.tertiary}, ${EMBER_PALETTE.secondary})`,
          }}
        />
      )}

      <div className="relative flex items-center space-x-3">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-300"
          style={{ ...iconBgStyle, color: isActive || isComplete ? EMBER_PALETTE.text : hexToRgba(EMBER_PALETTE.text, 0.40) }}
        >
          {isComplete ? <CheckCircle className="w-4 h-4" /> : icon}
        </div>
        <span
          className="text-xs font-medium tracking-wide transition-colors duration-300"
          style={{
            color: isActive || isComplete ? EMBER_PALETTE.text : hexToRgba(EMBER_PALETTE.text, 0.50),
            filter: isActive || isComplete ? `drop-shadow(0 0 6px ${hexToRgba(EMBER_PALETTE.primary, 0.5)})` : undefined,
          }}
        >
          {label}
        </span>
      </div>

      <div className="relative flex items-center space-x-2">
        {blockCount !== undefined && isActive && (
          <div
            className="flex items-center space-x-1 px-2 py-0.5 rounded"
            style={{
              background: hexToRgba(EMBER_PALETTE.primary, 0.10),
              border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.20)}`,
            }}
          >
            <span className="text-[10px] font-bold tabular-nums" style={{ color: EMBER_PALETTE.text }}>
              {blockCount.toLocaleString()}
            </span>
          </div>
        )}
        {isActive && (
          <div className="relative">
            <Loader className="w-4 h-4 animate-spin" style={{ color: EMBER_PALETTE.text }} />
            <div className="absolute inset-0 blur-sm">
              <Loader className="w-4 h-4 animate-spin" style={{ color: EMBER_PALETTE.text }} />
            </div>
          </div>
        )}
        {isComplete && (
          <div className="relative">
            <CheckCircle className="w-4 h-4" style={{ color: EMBER_PALETTE.text }} />
            <div className="absolute inset-0 blur-sm opacity-50">
              <CheckCircle className="w-4 h-4" style={{ color: EMBER_PALETTE.text }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
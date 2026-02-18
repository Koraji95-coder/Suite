import { forwardRef, useCallback, useMemo, useRef } from 'react';
import { useTheme, hexToRgba } from '@/lib/palette';

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: 'low' | 'medium' | 'high';
  liquid?: boolean;
  hoverEffect?: boolean;
  tint?: string;
  specular?: boolean;
  bevel?: boolean;
  pulse?: boolean;
  float?: boolean;
  tilt?: boolean;
  grain?: boolean;
  shimmer?: boolean;
  edgeLight?: boolean;

  /** Optional: more “app chrome” look */
  variant?: 'panel' | 'card' | 'toolbar';
  /** Optional: add internal padding for most layouts */
  padded?: boolean;
}

const BLUR: Record<string, number> = { low: 12, medium: 22, high: 34 };
const BG_OPACITY: Record<string, number> = { low: 0.10, medium: 0.13, high: 0.17 };

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  (
    {
      children,
      intensity = 'medium',
      liquid = false,
      hoverEffect = true,
      tint: tintProp,
      specular = true,
      bevel = true,
      pulse = false,
      float: floatProp = false,
      tilt = false,
      grain = false,
      shimmer = false,
      edgeLight = false,
      variant = 'panel',
      padded = false,
      className = '',
      style,
      onPointerMove,
      onPointerLeave,
      ...props
    },
    ref,
  ) => {
    const { palette } = useTheme();
    const tint = tintProp ?? palette.primary;
    const blur = BLUR[intensity] ?? 22;
    const bgAlpha = BG_OPACITY[intensity] ?? 0.13;

    // Use CSS vars for tilt (no state updates per mouse move)
    const hostRef = useRef<HTMLDivElement | null>(null);

    const setHostRef = useCallback(
      (node: HTMLDivElement | null) => {
        hostRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as any).current = node;
      },
      [ref],
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (tilt && hostRef.current) {
          const el = hostRef.current;
          const rect = el.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          // Subtle tilt (advanced look, not “toy”)
          el.style.setProperty('--gp-rx', `${(y * 8).toFixed(2)}deg`);
          el.style.setProperty('--gp-ry', `${(-x * 10).toFixed(2)}deg`);
        }
        onPointerMove?.(e);
      },
      [tilt, onPointerMove],
    );

    const handlePointerLeave = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (tilt && hostRef.current) {
          const el = hostRef.current;
          el.style.setProperty('--gp-rx', `0deg`);
          el.style.setProperty('--gp-ry', `0deg`);
        }
        onPointerLeave?.(e);
      },
      [tilt, onPointerLeave],
    );

    const baseClasses = useMemo(() => {
      const pad =
        padded ? (variant === 'toolbar' ? 'p-3' : 'p-4') : '';

      const rounding =
        liquid ? 'animate-liquid' : variant === 'toolbar' ? 'rounded-2xl' : 'rounded-2xl';

      return [
        'relative overflow-clip transition-all duration-300 will-change-transform',
        hoverEffect ? 'hover:scale-[1.01]' : '',
        rounding,
        pulse ? 'animate-pulse-glow' : '',
        floatProp ? 'animate-glass-float' : '',
        pad,
        className,
      ]
        .filter(Boolean)
        .join(' ');
    }, [padded, variant, liquid, hoverEffect, pulse, floatProp, className]);

    const tintGlow = hexToRgba(tint, 0.22);

    const panelStyle: React.CSSProperties = {
      '--gp-tint-glow': tintGlow,
      '--gp-rx': '0deg',
      '--gp-ry': '0deg',

      background:
        variant === 'toolbar'
          ? `linear-gradient(180deg, ${hexToRgba(palette.surface, 0.72)} 0%, ${hexToRgba(
              palette.surface,
              0.58,
            )} 100%)`
          : `linear-gradient(135deg,
              ${hexToRgba(tint, bgAlpha)} 0%,
              ${hexToRgba(palette.surface, 0.50)} 48%,
              ${hexToRgba(tint, bgAlpha * 0.45)} 100%)`,

      backdropFilter: `blur(${blur}px) saturate(1.35)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(1.35)`,

      border: `1px solid ${hexToRgba(tint, variant === 'toolbar' ? 0.14 : 0.16)}`,

      boxShadow: [
        `0 14px 40px ${hexToRgba('#000000', 0.22)}`,
        `0 8px 28px ${hexToRgba(tint, 0.10)}`,
        ...(bevel
          ? [
              `inset 1px 1px 0 ${hexToRgba('#ffffff', 0.06)}`,
              `inset -1px -1px 0 ${hexToRgba('#000000', 0.14)}`,
            ]
          : []),
      ].join(', '),

      transform: tilt ? `perspective(800px) rotateX(var(--gp-rx)) rotateY(var(--gp-ry))` : undefined,

      ...style,
    } as React.CSSProperties;

    return (
      <div
        ref={setHostRef}
        className={baseClasses}
        style={panelStyle}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        {...props}
      >
        {specular && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba('#ffffff', 0.10)} 0%, transparent 55%)`,
              borderRadius: 'inherit',
            }}
          />
        )}

        {shimmer && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: 'inherit' }}>
            <div
              className="glass-shimmer-overlay absolute inset-0"
              style={{
                background: `linear-gradient(105deg, transparent 40%, ${hexToRgba('#ffffff', 0.12)} 50%, transparent 60%)`,
              }}
            />
          </div>
        )}

        {edgeLight && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-edge-light"
            style={{
              borderRadius: 'inherit',
              background: `conic-gradient(from var(--edge-angle, 0deg), transparent 0%, ${hexToRgba(tint, 0.35)} 10%, transparent 20%)`,
              mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              maskComposite: 'exclude',
              WebkitMaskComposite: 'xor',
              padding: '2px',
            }}
          />
        )}

        {grain && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 glass-grain-overlay"
            style={{
              borderRadius: 'inherit',
              opacity: 0.055,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
              backgroundSize: '128px 128px',
            }}
          />
        )}

        {children}
      </div>
    );
  },
);

GlassPanel.displayName = 'GlassPanel';

import { forwardRef, HTMLAttributes } from 'react';
import { EMBER_PALETTE, hexToRgba } from '../../lib/three/emberPalette';

interface LiquidContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: { width: number; height: number };
  tint?: string;
  padded?: boolean;
}

export const LiquidContainer = forwardRef<HTMLDivElement, LiquidContainerProps>(
  ({ children, size = { width: 320, height: 220 }, tint = EMBER_PALETTE.primary, padded = true, className = '', style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'relative overflow-clip rounded-[28px]',
          padded ? 'p-4' : '',
          className,
        ].join(' ')}
        style={{
          width: size.width,
          height: size.height,
          background: `linear-gradient(135deg, ${hexToRgba(tint, 0.10)} 0%, ${hexToRgba(
            EMBER_PALETTE.surface,
            0.42,
          )} 55%, ${hexToRgba(tint, 0.06)} 100%)`,
          border: `1px solid ${hexToRgba(tint, 0.16)}`,
          boxShadow: [
            `0 14px 40px ${hexToRgba('#000000', 0.22)}`,
            `0 0 28px ${hexToRgba(tint, 0.12)}`,
            `inset 1px 1px 0 ${hexToRgba('#ffffff', 0.06)}`,
            `inset -1px -1px 0 ${hexToRgba('#000000', 0.16)}`,
          ].join(', '),
          backdropFilter: 'blur(22px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
          ...style,
        }}
        {...props}
      >
        {/* specular */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba('#ffffff', 0.08)} 0%, transparent 60%)`,
          }}
        />
        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    );
  },
);

LiquidContainer.displayName = 'LiquidContainer';

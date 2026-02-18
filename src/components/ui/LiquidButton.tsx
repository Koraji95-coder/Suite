import { forwardRef, ButtonHTMLAttributes } from 'react';
import { useTheme, hexToRgba } from '@/lib/palette';

interface LiquidButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: number;
  tint?: string;
  active?: boolean;
}

export const LiquidButton = forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ children, size = 44, tint: tintProp, active = false, className = '', style, ...props }, ref) => {
    const { palette } = useTheme();
    const tint = tintProp ?? palette.primary;
    return (
      <button
        ref={ref}
        className={[
          'relative grid place-items-center rounded-full outline-none transition-all duration-200',
          'focus:outline-none focus-visible:ring-2',
          className,
        ].join(' ')}
        style={{
          width: size,
          height: size,
          background: active
            ? `linear-gradient(135deg, ${hexToRgba(tint, 0.22)} 0%, ${hexToRgba(tint, 0.10)} 100%)`
            : `linear-gradient(135deg, ${hexToRgba(palette.surface, 0.35)} 0%, ${hexToRgba(
                palette.surface,
                0.22,
              )} 100%)`,
          border: `1px solid ${hexToRgba(tint, active ? 0.28 : 0.14)}`,
          boxShadow: [
            `0 10px 26px ${hexToRgba('#000000', 0.24)}`,
            `0 0 20px ${hexToRgba(tint, active ? 0.18 : 0.10)}`,
            `inset 1px 1px 0 ${hexToRgba('#ffffff', 0.06)}`,
            `inset -1px -1px 0 ${hexToRgba('#000000', 0.16)}`,
          ].join(', '),
          backdropFilter: 'blur(18px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
          ...style,
        }}
        {...props}
      >
        {/* specular */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba('#ffffff', 0.10)} 0%, transparent 55%)`,
          }}
        />
        <span className="relative z-10">{children}</span>
      </button>
    );
  },
);

LiquidButton.displayName = 'LiquidButton';

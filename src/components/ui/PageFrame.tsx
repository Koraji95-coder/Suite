import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { GlassPanel } from './GlassPanel';

export type Breadcrumb = { label: string; onClick?: () => void };

type PageFrameProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  onBack?: () => void;

  /** Theme tint for the header glass */
  tint?: string;

  /** Layout */
  maxWidthClassName?: string; // default: max-w-[1480px]
  rightRail?: ReactNode;      // optional right column
  children: ReactNode;
};

export function PageFrame({
  title,
  subtitle,
  icon,
  breadcrumbs,
  actions,
  onBack,
  tint: tintProp,
  maxWidthClassName = 'max-w-[1480px]',
  rightRail,
  children,
}: PageFrameProps) {
  const { palette } = useTheme();
  const tint = tintProp ?? palette.primary;
  const hasRight = Boolean(rightRail);

  return (
    <div className={`mx-auto w-full ${maxWidthClassName} space-y-4`}>
      {/* Page header */}
      <GlassPanel
        variant="toolbar"
        padded
        hoverEffect={false}
        bevel
        specular
        tint={tint}
        style={{
          border: `1px solid ${hexToRgba(tint, 0.14)}`,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* breadcrumbs */}
            {breadcrumbs?.length ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                {breadcrumbs.map((b, idx) => (
                  <div key={`${b.label}-${idx}`} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={b.onClick}
                      className={`hover:underline ${b.onClick ? '' : 'cursor-default'}`}
                      style={{ color: hexToRgba(palette.text, 0.55) }}
                      disabled={!b.onClick}
                    >
                      {b.label}
                    </button>
                    {idx < breadcrumbs.length - 1 && (
                      <span style={{ color: hexToRgba(palette.text, 0.35) }}>•</span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-3 min-w-0">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="shrink-0 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06]"
                  style={{
                    border: `1px solid ${hexToRgba(tint, 0.14)}`,
                    color: hexToRgba(palette.text, 0.8),
                  }}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : null}

              {icon ? <div className="shrink-0">{icon}</div> : null}

              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold" style={{ color: hexToRgba(palette.text, 0.92) }}>
                  {title}
                </h2>
                {subtitle ? (
                  <p className="mt-0.5 text-sm truncate" style={{ color: hexToRgba(palette.text, 0.55) }}>
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
        </div>
      </GlassPanel>

      {/* Page body layout */}
      <div className={hasRight ? 'grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4' : ''}>
        <div className="space-y-4">{children}</div>
        {hasRight ? <div className="space-y-4">{rightRail}</div> : null}
      </div>
    </div>
  );
}

/** Consistent section card to use inside PageFrame */
export function FrameSection({
  title,
  subtitle,
  actions,
  children,
  tint: tintProp,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  tint?: string;
}) {
  const { palette } = useTheme();
  const tint = tintProp ?? palette.primary;
  return (
    <GlassPanel tint={tint} intensity="medium" bevel specular hoverEffect={false} className="rounded-2xl" padded>
      {(title || actions) ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <div className="text-sm font-semibold" style={{ color: hexToRgba(palette.text, 0.9) }}>
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div className="text-xs mt-0.5" style={{ color: hexToRgba(palette.text, 0.55) }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}

      <div>{children}</div>
    </GlassPanel>
  );
}

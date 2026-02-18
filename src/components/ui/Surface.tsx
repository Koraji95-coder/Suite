/**
 * Surface.tsx -- Mid-tier material component
 *
 * Used for dashboard widgets, sidebar items, stat cards, and other non-floating
 * elements. Provides a subtle tinted background with a thin border but NO
 * backdrop-filter (that's reserved for the Overlay tier / GlassPanel).
 */
import React from "react";
import { useTheme, hexToRgba } from "@/lib/palette";
import { cn } from "@/lib/utils";

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tint?: string;
  hover?: boolean;
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, tint, hover = false, style, children, ...props }, ref) => {
    const { palette } = useTheme();
    const color = tint || palette.primary;

    const surfaceStyle: React.CSSProperties = {
      background: `linear-gradient(135deg, ${hexToRgba(color, 0.06)} 0%, ${hexToRgba(palette.surface, 0.4)} 100%)`,
      border: `1px solid ${hexToRgba(color, 0.1)}`,
      borderRadius: "0.75rem",
      boxShadow: `inset 1px 1px 0 ${hexToRgba("#ffffff", 0.03)}`,
      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      ...style,
    };

    return (
      <div
        ref={ref}
        className={cn(
          hover && "hover:border-[var(--surface-hover-border)] hover:shadow-md",
          className
        )}
        style={{
          ...surfaceStyle,
          "--surface-hover-border": hexToRgba(color, 0.2),
        } as React.CSSProperties}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Surface.displayName = "Surface";

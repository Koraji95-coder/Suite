import { useEffect, useRef, useState } from 'react';
import { useTheme, hexToRgba } from '@/lib/palette';

interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const { palette } = useTheme();
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  const [displayP, setDisplayP] = useState(p);
  const displayRef = useRef(displayP);
  const targetRef = useRef(p);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastTRef = useRef(0);

  useEffect(() => {
    displayRef.current = displayP;
  }, [displayP]);

  useEffect(() => {
    targetRef.current = p;

    if (runningRef.current) return;
    if (Math.abs(targetRef.current - displayRef.current) <= 0.05) return;

    runningRef.current = true;
    lastTRef.current = 0;

    const speed = 20; // faster animation
    const epsilon = 0.01; // tighter epsilon for better 100% reach
    const minRenderDelta = 0.005;

    const tick = (t: number) => {
      const lastT = lastTRef.current || t;
      const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
      lastTRef.current = t;

      const cur = displayRef.current;
      const target = targetRef.current;
      // Linear interpolation instead of exponential easing to ensure 100% is reached
      const diff = target - cur;
      const moveDist = speed * dt;
      const next = Math.abs(diff) <= moveDist ? target : cur + Math.sign(diff) * moveDist;

      displayRef.current = next;
      if (Math.abs(next - cur) > minRenderDelta) setDisplayP(next);

      if (Math.abs(target - next) > epsilon) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      displayRef.current = target;
      setDisplayP(target);
      runningRef.current = false;
      rafRef.current = null;
      lastTRef.current = 0;
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [p]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      rafRef.current = null;
      lastTRef.current = 0;
    };
  }, []);

  const pct = Number.isFinite(displayP) ? Math.max(0, Math.min(100, displayP)) : 0;
  const scaleX = pct / 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium tracking-wide uppercase" style={{ color: hexToRgba(palette.text, 0.50) }}>
          Loading
        </span>
        <span className="font-bold tabular-nums" style={{ color: palette.text }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className="relative w-full h-1.5 rounded-full overflow-hidden backdrop-blur-sm"
        style={{
          background: hexToRgba(palette.background, 0.50),
          border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
          boxShadow: `inset 0 1px 2px ${hexToRgba(palette.background, 0.8)}`,
        }}
      >
        <div
          className="absolute inset-0 transition-all duration-300"
          style={{
            background: `linear-gradient(90deg, ${palette.primary}, ${palette.tertiary}, ${palette.secondary})`,
            transform: `scaleX(${scaleX})`,
            transformOrigin: '0% 50%',
            willChange: 'transform',
            boxShadow: `0 0 12px ${hexToRgba(palette.primary, 0.4)}`,
          }}
        >
          {/* Subtle shimmer that stays within the progress bar */}
          <div 
            className="absolute inset-0 opacity-40"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba('#ffffff', 0.25)} 50%, transparent 100%)`,
              backgroundSize: '200% 100%',
              animation: 'wave-shimmer 2.5s ease-in-out infinite',
            }}
          />
          
          {/* Glossy highlight on top */}
          <div
            className="absolute top-0 left-0 right-0 h-1/2"
            style={{
              background: `linear-gradient(to bottom, ${hexToRgba('#ffffff', 0.2)}, transparent)`,
            }}
          />
          
          {/* Trailing glow effect */}
          <div
            className="absolute top-0 right-0 h-full w-12 opacity-60"
            style={{
              background: `linear-gradient(to right, transparent, ${hexToRgba(palette.secondary, 0.6)})`,
              filter: `blur(4px)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
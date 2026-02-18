import { useEffect, useRef, useState } from 'react';
import { EMBER_PALETTE, hexToRgba } from '../lib/three/emberPalette';

interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
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

    const speed = 14;
    const epsilon = 0.05;
    const minRenderDelta = 0.005;

    const tick = (t: number) => {
      const lastT = lastTRef.current || t;
      const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
      lastTRef.current = t;

      const cur = displayRef.current;
      const target = targetRef.current;
      const alpha = 1 - Math.exp(-speed * dt);
      const next = cur + (target - cur) * alpha;

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
        <span className="font-medium tracking-wide uppercase" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.50) }}>
          Loading
        </span>
        <span className="font-bold tabular-nums" style={{ color: EMBER_PALETTE.text }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className="relative w-full h-1.5 rounded-full overflow-hidden backdrop-blur-sm"
        style={{
          background: hexToRgba(EMBER_PALETTE.background, 0.50),
          border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.18)}`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, ${EMBER_PALETTE.primary}, ${EMBER_PALETTE.tertiary}, ${EMBER_PALETTE.secondary})`,
            transform: `scaleX(${scaleX})`,
            transformOrigin: '0% 50%',
            willChange: 'transform',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(EMBER_PALETTE.primary, 0.3)} 50%, transparent 100%)`,
              backgroundSize: '200% 100%',
              animation: 'wave-shimmer 3s linear infinite',
            }}
          />
        </div>
        <div
          className="absolute top-0 h-full w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ left: `${Math.max(0, pct - 8)}%` }}
        />
      </div>
      <div
        className="h-px"
        style={{
          background: `linear-gradient(to right, transparent, ${hexToRgba(EMBER_PALETTE.primary, 0.30)}, transparent)`,
        }}
      />
    </div>
  );
}
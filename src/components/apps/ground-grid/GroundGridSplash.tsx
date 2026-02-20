import { useEffect, useMemo, useState, useRef } from 'react';
import { LoadingCard } from '@/data/LoadingCard';
import { ProgressBar } from '@/data/ProgressBar';
import { useTheme, hexToRgba } from '@/lib/palette';
import { GridBackground } from './GridBackground';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export interface GroundGridSplashProps {
  onComplete: () => void;
}

export function GroundGridSplash({ onComplete }: GroundGridSplashProps) {
  const { palette } = useTheme();
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const steps = useMemo(() => [
    { id: 'coords', label: 'Parsing coordinates', duration: 1600 },
    { id: 'topology', label: 'Building topology', duration: 2000 },
    { id: 'rods', label: 'Placing ground rods', duration: 1800 },
    { id: 'preview', label: 'Generating grid preview', duration: 1400 },
  ], []);

  const total = useMemo(() => steps.reduce((s, x) => s + x.duration, 0), [steps]);
  const exitDurationMs = 1800;
  const isComplete = step >= steps.length;

  useEffect(() => {
    if (isExiting || step >= steps.length) return;
    const t = setTimeout(() => setStep(v => v + 1), steps[step].duration);
    return () => clearTimeout(t);
  }, [isExiting, step, steps]);

  const isExitingRef = useRef(false);
  useEffect(() => {
    if (!isComplete || isExitingRef.current) return;
    isExitingRef.current = true;
    setProgress(100);
    setIsExiting(true);
    const t = setTimeout(() => onCompleteRef.current(), exitDurationMs);
    return () => clearTimeout(t);
  }, [isComplete]);

  useEffect(() => {
    if (step >= steps.length) return;
    if (!Number.isFinite(total) || total <= 0) return;
    const elapsed = steps.slice(0, step).reduce((s, x) => s + x.duration, 0);
    const cur = steps[step]?.duration ?? 1;
    const startP = clamp((elapsed / total) * 100, 0, 100);
    const endP = clamp(((elapsed + cur) / total) * 100, 0, 100);
    setProgress(startP);
    const t0 = performance.now();
    let rafId = 0;
    const animate = () => {
      const a = clamp((performance.now() - t0) / cur, 0, 1);
      setProgress(startP + (endP - startP) * a);
      if (a < 1) rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [step, steps, total]);

  return (
    <div
      className={`fixed inset-0 z-[100] transition-all duration-1000 ${
        isExiting ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'
      }`}
      style={{
        backgroundColor: palette.background,
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <GridBackground opacity={0.6} />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${hexToRgba('#f59e0b', 0.12)}, ${hexToRgba('#ea580c', 0.05)} 38%, ${palette.background} 70%)`,
        }}
      />
      <div
        className={`relative z-10 flex flex-col items-center justify-start min-h-screen px-6 text-center transition-opacity duration-1000 pt-28 ${
          isExiting ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="mb-2">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="8" width="48" height="48" rx="6" stroke="#f59e0b" strokeWidth="2" opacity="0.3" />
            <line x1="8" y1="24" x2="56" y2="24" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4" />
            <line x1="8" y1="40" x2="56" y2="40" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4" />
            <line x1="24" y1="8" x2="24" y2="56" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4" />
            <line x1="40" y1="8" x2="40" y2="56" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4" />
            <circle cx="24" cy="24" r="3" fill="#22c55e" opacity="0.8" />
            <circle cx="40" cy="24" r="3" fill="#22c55e" opacity="0.8" />
            <circle cx="24" cy="40" r="3" fill="#22c55e" opacity="0.8" />
            <circle cx="40" cy="40" r="3" fill="#22c55e" opacity="0.8" />
            <circle cx="32" cy="32" r="2.5" fill="#3b82f6" opacity="0.8" />
          </svg>
        </div>

        <h1
          className="text-5xl sm:text-6xl font-black tracking-tight"
          style={{
            background: 'linear-gradient(90deg, #f59e0b, #ea580c, #f59e0b)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Ground Grid
        </h1>
        <p className="mt-1 text-base font-semibold" style={{ color: hexToRgba(palette.text, 0.7) }}>
          Coordinate Extraction + Grid Design
        </p>

        <div className="w-full max-w-[360px] mt-8 space-y-2">
          {steps.map((s, i) => (
            <LoadingCard
              key={s.id}
              label={s.label}
              icon={<span className="text-[10px] font-bold" style={{ color: palette.text }}>*</span>}
              isActive={i === step}
              isComplete={i < step}
              index={i}
            />
          ))}
          {step < steps.length && (
            <ProgressBar progress={Number.isFinite(progress) ? clamp(progress, 0, 100) : 0} />
          )}
        </div>
      </div>

      <div className="absolute bottom-6 right-6 text-right text-[10px] leading-tight z-20 select-none">
        <div className="font-medium" style={{ color: palette.textMuted }}>Ground Grid Generator</div>
        <div style={{ color: palette.textMuted, opacity: 0.6 }}>Root3Power Suite</div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, useRef } from 'react';
import * as THREE from 'three';
import { LoadingCard } from '@/data/LoadingCard';
import { ProgressBar } from '@/data/ProgressBar';
import { useTheme, hexToRgba } from '@/lib/palette';

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);
  return reducedMotion;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

const AMBER = '#f59e0b';
const COPPER = '#ea580c';

export interface GroundGridSplashProps {
  onComplete: () => void;
}

export function GroundGridSplash({ onComplete }: GroundGridSplashProps) {
  const { palette } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const steps = useMemo(() => [
    { id: 'coords', label: 'Parsing coordinates', duration: reducedMotion ? 400 : 1600 },
    { id: 'topology', label: 'Building topology', duration: reducedMotion ? 500 : 2000 },
    { id: 'rods', label: 'Placing ground rods', duration: reducedMotion ? 450 : 1800 },
    { id: 'preview', label: 'Generating grid preview', duration: reducedMotion ? 350 : 1400 },
  ], [reducedMotion]);

  const total = useMemo(() => steps.reduce((s, x) => s + x.duration, 0), [steps]);
  const exitDurationMs = reducedMotion ? 450 : 1800;
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
  }, [exitDurationMs, isComplete]);

  useEffect(() => {
    if (step >= steps.length) return;
    if (!Number.isFinite(total) || total <= 0) return;
    const elapsed = steps.slice(0, step).reduce((s, x) => s + x.duration, 0);
    const curRaw = steps[Math.min(step, steps.length - 1)]?.duration ?? 1;
    const cur = Number.isFinite(curRaw) && curRaw > 0 ? curRaw : 1;
    const startP = clamp((elapsed / total) * 100, 0, 100);
    const endP = clamp(((elapsed + cur) / total) * 100, 0, 100);
    setProgress(startP);
    const t0 = performance.now();
    let rafId = 0;
    const animate = () => {
      const now = performance.now();
      const a = clamp((now - t0) / cur, 0, 1);
      const next = startP + (endP - startP) * a;
      setProgress(Number.isFinite(next) ? next : startP);
      if (a < 1) rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [step, steps, total]);

  const plane1Ref = useRef<THREE.Mesh | null>(null);
  const plane2Ref = useRef<THREE.Mesh | null>(null);
  const frontLightRef = useRef<THREE.PointLight | null>(null);
  const backLightRef = useRef<THREE.PointLight | null>(null);
  const progressRef = useRef(progress);
  const isExitingAnimRef = useRef(isExiting);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { isExitingAnimRef.current = isExiting; }, [isExiting]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.position.z = 4.5;

    const geo1 = new THREE.PlaneGeometry(14, 14, 128, 128);
    const mat1 = new THREE.MeshStandardMaterial({
      color: AMBER,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
      emissive: new THREE.Color(AMBER).multiplyScalar(0.3),
    });
    const plane1 = new THREE.Mesh(geo1, mat1);
    plane1.rotation.x = -Math.PI / 3.2;
    plane1.rotation.z = 0.15;
    scene.add(plane1);
    plane1Ref.current = plane1;

    const geo2 = new THREE.PlaneGeometry(18, 18, 128, 128);
    const mat2 = new THREE.MeshStandardMaterial({
      color: COPPER,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
      emissive: new THREE.Color(COPPER).multiplyScalar(0.2),
    });
    const plane2 = new THREE.Mesh(geo2, mat2);
    plane2.rotation.x = -Math.PI / 4;
    plane2.rotation.z = -0.1;
    scene.add(plane2);
    plane2Ref.current = plane2;

    const ambientLight = new THREE.AmbientLight(AMBER, 0.15);
    scene.add(ambientLight);

    const frontLight = new THREE.PointLight(AMBER, 0.5);
    frontLight.position.set(2, 3, 4);
    scene.add(frontLight);
    frontLightRef.current = frontLight;

    const backLight = new THREE.PointLight(COPPER, 0.3);
    backLight.position.set(-4, 2, -3);
    scene.add(backLight);
    backLightRef.current = backLight;

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let rafId = 0;
    let disposed = false;

    const baseOpacity1 = 0.3;
    const baseOpacity2 = 0.15;
    const baseFrontIntensity = 0.5;
    const baseBackIntensity = 0.3;

    let lastTime = performance.now() / 1000;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);

      const currentTime = performance.now() / 1000;
      const deltaSec = Math.min(0.1, currentTime - lastTime);
      lastTime = currentTime;

      const elapsedTime = clock.getElapsedTime();

      const progressFactor = clamp(progressRef.current / 100, 0, 1);
      const frontIntensity = baseFrontIntensity + progressFactor * 1.0;

      let exitFactor = 1.0;
      if (isExitingAnimRef.current && !reducedMotion) {
        const exitSpeed = 1.0 / (exitDurationMs / 1000);
        if (plane1Ref.current) {
          exitFactor = Math.max(0, (plane1Ref.current.material as THREE.Material).opacity / baseOpacity1 - deltaSec * exitSpeed);
        }
      }

      if (plane1Ref.current) {
        const m = plane1Ref.current.material as THREE.Material;
        m.opacity = baseOpacity1 * exitFactor;
        plane1Ref.current.scale.setScalar(exitFactor);
      }
      if (plane2Ref.current) {
        const m = plane2Ref.current.material as THREE.Material;
        m.opacity = baseOpacity2 * exitFactor;
        plane2Ref.current.scale.setScalar(exitFactor);
      }
      if (frontLightRef.current) {
        frontLightRef.current.intensity = frontIntensity * exitFactor;
      }
      if (backLightRef.current) {
        backLightRef.current.intensity = baseBackIntensity * exitFactor;
      }

      camera.position.x = Math.sin(elapsedTime * 0.15) * 0.4;
      camera.position.y = Math.cos(elapsedTime * 0.1) * 0.2;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geo1.dispose();
      geo2.dispose();
      mat1.dispose();
      mat2.dispose();
    };
  }, [exitDurationMs, reducedMotion]);

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
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="absolute inset-0 opacity-50" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${hexToRgba(AMBER, 0.12)}, ${hexToRgba(COPPER, 0.05)} 38%, ${palette.background} 70%)`,
        }}
      />
      <div
        className={`relative z-10 flex flex-col items-center justify-start min-h-screen px-6 text-center transition-opacity duration-1000 pt-28 ${
          isExiting ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <div className="mb-2">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="8" width="48" height="48" rx="6" stroke={AMBER} strokeWidth="2" opacity="0.3" />
            <line x1="8" y1="24" x2="56" y2="24" stroke={AMBER} strokeWidth="1.5" opacity="0.4" />
            <line x1="8" y1="40" x2="56" y2="40" stroke={AMBER} strokeWidth="1.5" opacity="0.4" />
            <line x1="24" y1="8" x2="24" y2="56" stroke={AMBER} strokeWidth="1.5" opacity="0.4" />
            <line x1="40" y1="8" x2="40" y2="56" stroke={AMBER} strokeWidth="1.5" opacity="0.4" />
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
            background: `linear-gradient(90deg, ${AMBER}, ${COPPER}, ${AMBER})`,
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

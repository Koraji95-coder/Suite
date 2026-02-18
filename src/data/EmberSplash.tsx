import { useEffect, useMemo, useState, useRef } from 'react';
import * as THREE from 'three';

import { LoadingCard } from './LoadingCard';
import { ProgressBar } from './ProgressBar';
import { useTheme } from '@/lib/palette';
import { APP_VERSION } from '@/constants/version';

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

export interface EmberSplashProps {
  onComplete: () => void;
}

export function EmberSplash({ onComplete }: EmberSplashProps) {
  const { palette } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const reducedMotion = prefersReducedMotion;
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const steps = useMemo(() => [
    { id: 'dashboard', label: 'Loading Dashboard', duration: reducedMotion ? 550 : 1800 },
    { id: 'projects', label: 'Initializing Projects', duration: reducedMotion ? 650 : 2200 },
    { id: 'storage', label: 'Connecting Storage', duration: reducedMotion ? 650 : 2200 },
    { id: 'ai', label: 'Preparing AI Assistant', duration: reducedMotion ? 500 : 1800 },
    { id: 'workspace', label: 'Building Workspace', duration: reducedMotion ? 450 : 1400 },
  ], [reducedMotion]);

  const total = useMemo(() => steps.reduce((s, x) => s + x.duration, 0), [steps]);
  const exitDurationMs = reducedMotion ? 450 : 2000;

  const displayProgress = progress;
  const displayStep = step;
  const isComplete = step >= steps.length;

  // Step timers
  useEffect(() => {
    if (isExiting) return;
    if (step >= steps.length) return;
    const t = setTimeout(() => setStep((v) => v + 1), steps[step].duration);
    return () => clearTimeout(t);
  }, [isExiting, step, steps]);

  // Trigger exit when complete
  const isExitingRef = useRef(false);
  useEffect(() => {
    if (!isComplete) return;
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    setProgress(100);
    setIsExiting(true);
    const t = setTimeout(() => {
      onCompleteRef.current();
    }, exitDurationMs);
    return () => clearTimeout(t);
  }, [exitDurationMs, isComplete]);

  // Progress interpolation
  useEffect(() => {
    if (step >= steps.length) return;
    if (!Number.isFinite(total) || total <= 0) {
      setProgress(0);
      return;
    }
    const elapsed = steps.slice(0, step).reduce((s, x) => s + x.duration, 0);
    const curRaw = steps[Math.min(step, steps.length - 1)]?.duration ?? 1;
    const cur = Number.isFinite(curRaw) && curRaw > 0 ? curRaw : 1;
    const startPRaw = (elapsed / total) * 100;
    const endPRaw = ((elapsed + cur) / total) * 100;
    const startP = Number.isFinite(startPRaw) ? clamp(startPRaw, 0, 100) : 0;
    const endP = Number.isFinite(endPRaw) ? clamp(endPRaw, 0, 100) : startP;
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

  // Refs for Three.js objects and exit state
  const plane1Ref = useRef<THREE.Mesh | null>(null);
  const plane2Ref = useRef<THREE.Mesh | null>(null);
  const frontLightRef = useRef<THREE.PointLight | null>(null);
  const backLightRef = useRef<THREE.PointLight | null>(null);
  const progressRef = useRef(displayProgress);
  const isExitingAnimationRef = useRef(isExiting);
  useEffect(() => {
    progressRef.current = displayProgress;
  }, [displayProgress]);
  useEffect(() => {
    isExitingAnimationRef.current = isExiting;
  }, [isExiting]);

  // Three.js animation – runs once on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.position.z = 4.5;

    // Primary plane – emerald green (hero accent for Frost & Steel)
    const geo1 = new THREE.PlaneGeometry(14, 14, 128, 128);
    const mat1 = new THREE.MeshStandardMaterial({
      color: palette.secondary,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
      emissive: new THREE.Color(palette.secondary).multiplyScalar(0.3),
    });
    const plane1 = new THREE.Mesh(geo1, mat1);
    plane1.rotation.x = -Math.PI / 3.2;
    plane1.rotation.z = 0.15;
    scene.add(plane1);
    plane1Ref.current = plane1;

    // Secondary plane – azure blue (primary), larger, behind
    const geo2 = new THREE.PlaneGeometry(18, 18, 128, 128);
    const mat2 = new THREE.MeshStandardMaterial({
      color: palette.primary,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
      emissive: new THREE.Color(palette.primary).multiplyScalar(0.2),
    });
    const plane2 = new THREE.Mesh(geo2, mat2);
    plane2.rotation.x = -Math.PI / 4;
    plane2.rotation.z = -0.1;
    scene.add(plane2);
    plane2Ref.current = plane2;

    // Ambient light – faint emerald to unify the green tone
    const ambientLight = new THREE.AmbientLight(palette.secondary, 0.15);
    scene.add(ambientLight);

    // Front point light – emerald green, intensity tied to progress
    const frontLight = new THREE.PointLight(palette.secondary, 0.5);
    frontLight.position.set(2, 3, 4);
    scene.add(frontLight);
    frontLightRef.current = frontLight;

    // Back point light – azure blue for subtle rim light
    const backLight = new THREE.PointLight(palette.primary, 0.3);
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

    // Store base values for exit animation
    const baseOpacity1 = 0.3;
    const baseOpacity2 = 0.15;
    const baseFrontIntensity = 0.5;
    const baseBackIntensity = 0.3;

    // For delta time calculation
    let lastTime = performance.now() / 1000;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);

      const currentTime = performance.now() / 1000;
      const deltaSec = Math.min(0.1, currentTime - lastTime);
      lastTime = currentTime;

      const elapsedTime = clock.getElapsedTime();

      // Progress factor (0..1) for light intensity
      const progressFactor = clamp(progressRef.current / 100, 0, 1);
      let frontIntensity = baseFrontIntensity + progressFactor * 1.0; // scales from 0.5 to 1.5

      // Exit factor: 1 = normal, 0 = fully exited
      let exitFactor = 1.0;
      if (isExitingAnimationRef.current && !reducedMotion) {
        // Reduce exitFactor over time
        const exitSpeed = 1.0 / (exitDurationMs / 1000); // per second
        exitFactor = Math.max(0, (plane1.material as THREE.Material).opacity / baseOpacity1 - deltaSec * exitSpeed);
        if (exitFactor <= 0) exitFactor = 0;
      }

      // Update plane opacities and scales
      if (plane1Ref.current) {
        const mat = plane1Ref.current.material as THREE.Material;
        mat.opacity = baseOpacity1 * exitFactor;
        plane1Ref.current.scale.setScalar(exitFactor);
      }
      if (plane2Ref.current) {
        const mat = plane2Ref.current.material as THREE.Material;
        mat.opacity = baseOpacity2 * exitFactor;
        plane2Ref.current.scale.setScalar(exitFactor);
      }
      if (frontLightRef.current) {
        frontLightRef.current.intensity = frontIntensity * exitFactor;
      }
      if (backLightRef.current) {
        // Keep backlight subtle, maybe also reduce with exitFactor
        backLightRef.current.intensity = baseBackIntensity * exitFactor;
      }

      // Animate primary plane waves
      const pos1 = geo1.attributes.position.array;
      for (let i = 0; i < pos1.length; i += 3) {
        const x = pos1[i];
        const y = pos1[i + 1];
        const w1 = Math.sin(x * 1.2 + elapsedTime * 0.4) * 0.25;
        const w2 = Math.cos(y * 1.2 + elapsedTime * 0.25) * 0.25;
        const w3 = Math.sin((x + y) * 0.8 + elapsedTime * 0.3) * 0.15;
        pos1[i + 2] = w1 + w2 + w3;
      }
      geo1.attributes.position.needsUpdate = true;
      geo1.computeVertexNormals();

      // Animate secondary plane waves
      const pos2 = geo2.attributes.position.array;
      for (let i = 0; i < pos2.length; i += 3) {
        const x = pos2[i];
        const y = pos2[i + 1];
        const w1 = Math.sin(x * 0.8 + elapsedTime * 0.2) * 0.2;
        const w2 = Math.cos(y * 0.8 + elapsedTime * 0.15) * 0.2;
        const w3 = Math.sin((x + y) * 0.5 + elapsedTime * 0.2) * 0.1;
        pos2[i + 2] = w1 + w2 + w3;
      }
      geo2.attributes.position.needsUpdate = true;
      geo2.computeVertexNormals();

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
  }, [exitDurationMs, reducedMotion, palette]);

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
          background: `radial-gradient(circle at 50% 45%, ${palette.secondary}20, ${palette.primary}0D 38%, ${palette.background} 70%)`,
        }}
      />
      <div
        className={`relative z-10 flex flex-col items-center justify-start min-h-screen px-6 text-center transition-opacity duration-1000 pt-24 ${
          isExiting ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <h1 className="text-6xl sm:text-8xl font-black tracking-tight">
          <span className="relative inline-block">
            <svg
              className="absolute pointer-events-none"
              style={{
                top: '-0.08em',
                left: 0,
                width: '100%',
                height: 'calc(100% + 0.15em)',
              }}
              viewBox="0 0 100 100"
              fill="none"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="sqrt-grad" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={palette.secondary} />
                  <stop offset="50%" stopColor={palette.primary} />
                  <stop offset="100%" stopColor={palette.tertiary} />
                </linearGradient>
              </defs>
              <polyline
                points="8,75 18,85 28,15 95,15"
                stroke="url(#sqrt-grad)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span
              className="relative bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(90deg, ${palette.secondary}, ${palette.primary}, ${palette.tertiary})`,
                paddingLeft: '1.1em',
              }}
            >
              3 Suite
            </span>
          </span>
        </h1>
        <p className="mt-2 text-sm sm:text-base font-semibold" style={{ color: palette.text }}>
          Ember Flux – Engineering Intelligence
        </p>
        <div className="w-full max-w-[360px] mt-6 space-y-2">
          {steps.map((s, i) => (
            <LoadingCard
              key={s.id}
              label={s.label}
              icon={<span className="text-[10px] font-bold" style={{ color: palette.text }}>*</span>}
              isActive={i === displayStep}
              isComplete={i < displayStep}
              index={i}
            />
          ))}
          {displayStep < steps.length && (
            <ProgressBar progress={Number.isFinite(displayProgress) ? clamp(displayProgress, 0, 100) : 0} />
          )}
        </div>
      </div>
      <div className="absolute bottom-6 right-6 text-right text-[10px] sm:text-[11px] leading-tight z-20 select-none">
        <div className="font-medium" style={{ color: palette.textMuted }}>Root3Power Suite</div>
        <div style={{ color: palette.textMuted, opacity: 0.6 }}>By Dustin</div>
        <div className="text-[9px] sm:text-[10px]" style={{ color: palette.textMuted, opacity: 0.45 }}>
          V{APP_VERSION}
        </div>
        <div className="text-[9px] sm:text-[10px] mt-0.5" style={{ color: palette.textMuted, opacity: 0.3 }}>
          © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
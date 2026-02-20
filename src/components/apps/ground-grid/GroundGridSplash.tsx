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
const AMBER_HEX = 0xf59e0b;
const GREEN_HEX = 0x22c55e;
const COPPER_HEX = 0xea580c;
const GROUND_HEX = 0x2a1f0e;

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

  const progressRef = useRef(progress);
  const isExitingAnimRef = useRef(isExiting);
  const stepRef = useRef(step);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { isExitingAnimRef.current = isExiting; }, [isExiting]);
  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const gridGroup = new THREE.Group();
    scene.add(gridGroup);

    const groundGeo = new THREE.PlaneGeometry(8, 8);
    const groundMat = new THREE.MeshStandardMaterial({
      color: GROUND_HEX,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    gridGroup.add(ground);

    const conductorMat = new THREE.MeshStandardMaterial({
      color: AMBER_HEX,
      emissive: new THREE.Color(AMBER_HEX).multiplyScalar(0.2),
      metalness: 0.7,
      roughness: 0.3,
      transparent: true,
      opacity: 0,
    });

    const gridLines: THREE.Mesh[] = [];
    const gridSize = 3;
    const spacing = 1.2;
    for (let i = 0; i <= gridSize; i++) {
      const x = -gridSize * spacing / 2 + i * spacing;
      const geo = new THREE.CylinderGeometry(0.015, 0.015, gridSize * spacing, 6);
      const meshH = new THREE.Mesh(geo, conductorMat.clone());
      meshH.position.set(x, 0.02, 0);
      meshH.rotation.z = Math.PI / 2;
      meshH.rotation.y = Math.PI / 2;
      gridGroup.add(meshH);
      gridLines.push(meshH);

      const meshV = new THREE.Mesh(geo.clone(), conductorMat.clone());
      meshV.position.set(0, 0.02, x);
      meshV.rotation.z = Math.PI / 2;
      gridGroup.add(meshV);
      gridLines.push(meshV);
    }

    const rodMat = new THREE.MeshStandardMaterial({
      color: GREEN_HEX,
      emissive: new THREE.Color(GREEN_HEX).multiplyScalar(0.25),
      metalness: 0.5,
      roughness: 0.4,
      transparent: true,
      opacity: 0,
    });

    const rodMeshes: THREE.Group[] = [];
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        if ((i === 0 || i === gridSize) && (j === 0 || j === gridSize) || (i + j) % 2 === 0) {
          const x = -gridSize * spacing / 2 + i * spacing;
          const z = -gridSize * spacing / 2 + j * spacing;
          const rodGroup = new THREE.Group();

          const rodGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8);
          const rod = new THREE.Mesh(rodGeo, rodMat.clone());
          rod.position.set(0, -0.15, 0);
          rodGroup.add(rod);

          const capGeo = new THREE.SphereGeometry(0.035, 8, 6);
          const cap = new THREE.Mesh(capGeo, rodMat.clone());
          cap.position.set(0, 0.03, 0);
          rodGroup.add(cap);

          rodGroup.position.set(x, 0, z);
          gridGroup.add(rodGroup);
          rodMeshes.push(rodGroup);
        }
      }
    }

    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    const frontLight = new THREE.PointLight(AMBER_HEX, 0.8, 15);
    frontLight.position.set(3, 5, 4);
    scene.add(frontLight);

    const backLight = new THREE.PointLight(COPPER_HEX, 0.4, 15);
    backLight.position.set(-4, 3, -3);
    scene.add(backLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 5, -5);
    scene.add(rimLight);

    camera.position.set(3.5, 3, 3.5);
    camera.lookAt(0, 0, 0);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    let rafId = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    let gridOpacity = 0;
    let rodOpacity = 0;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);

      const elapsed = clock.getElapsedTime();
      const prog = clamp(progressRef.current / 100, 0, 1);
      const currentStep = stepRef.current;

      const targetGridOpacity = currentStep >= 1 ? 0.9 : prog * 0.4;
      gridOpacity += (targetGridOpacity - gridOpacity) * 0.05;
      for (const m of gridLines) {
        (m.material as THREE.MeshStandardMaterial).opacity = gridOpacity;
      }

      const targetRodOpacity = currentStep >= 2 ? 0.9 : 0;
      rodOpacity += (targetRodOpacity - rodOpacity) * 0.05;
      for (const rg of rodMeshes) {
        rg.children.forEach(c => {
          if (c instanceof THREE.Mesh) {
            (c.material as THREE.MeshStandardMaterial).opacity = rodOpacity;
          }
        });
      }

      let exitFactor = 1.0;
      if (isExitingAnimRef.current) {
        exitFactor = Math.max(0, 1.0 - elapsed * 0.3);
        gridGroup.scale.setScalar(exitFactor);
        gridGroup.rotation.y += 0.01;
      }

      const orbitSpeed = 0.15;
      const radius = 4.5 - prog * 0.8;
      const angle = elapsed * orbitSpeed;
      camera.position.x = Math.cos(angle) * radius * 0.85;
      camera.position.y = 2.5 + Math.sin(elapsed * 0.2) * 0.3;
      camera.position.z = Math.sin(angle) * radius * 0.85;
      camera.lookAt(0, -0.2, 0);

      frontLight.intensity = 0.6 + prog * 0.8;

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
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
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="absolute inset-0 opacity-70" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${hexToRgba(AMBER, 0.1)}, ${hexToRgba(COPPER, 0.04)} 38%, ${palette.background} 70%)`,
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

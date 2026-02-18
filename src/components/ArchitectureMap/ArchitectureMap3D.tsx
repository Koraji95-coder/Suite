import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { ChevronLeft, ChevronRight, Network, RotateCcw } from 'lucide-react';

import type { ArchLink, ArchNode } from './types';
import { useGraphData } from './hooks/useGraphData';
import { createRenderState, type RenderState } from './hooks/useCanvasRenderer';
import { useSimulationWorker } from './hooks/useSimulationWorker';
import { MajorInspector, MinorInspector } from './Inspectors';
import { useTheme, type ColorScheme } from '@/lib/palette';
import { createHyphaeRenderer } from '../../lib/three/hyphaeRenderer';
import { createHyphaeCoreNodeMaterial } from '../../lib/three/hyphaeMaterials';
import { LivingBackground } from './LivingBackground';

type FrozenGraph = { nodes: ArchNode[]; links: ArchLink[] };
type LinkCurve = { key: string; curve: THREE.CatmullRomCurve3; radius: number; emissive: string; opacity: number };
type Bounds = { box: THREE.Box3; center: THREE.Vector3; radius: number };
const Z_MAJOR = 50;

function buildFallbackLayout(nodesIn: ArchNode[], linksIn: ArchLink[]): FrozenGraph {
  const nodes = nodesIn.map((n) => ({ ...n }));
  const links = linksIn.map((l) => ({ ...l }));
  const majors = nodes.filter((n) => n.type === 'major');
  const minorsByGroup = new Map<string, ArchNode[]>();

  for (const n of nodes) {
    if (n.type !== 'minor') continue;
    const arr = minorsByGroup.get(n.group) ?? [];
    arr.push(n);
    minorsByGroup.set(n.group, arr);
  }

  const majorCount = Math.max(1, majors.length);
  const majorRingRadius = Math.max(180, majorCount * 30);

  for (let i = 0; i < majors.length; i++) {
    const major = majors[i];
    const a = (i / majorCount) * Math.PI * 2 - Math.PI / 2;
    major.x = Math.cos(a) * majorRingRadius;
    major.y = Math.sin(a) * majorRingRadius;

    const minors = minorsByGroup.get(major.group) ?? [];
    const minorCount = Math.max(1, minors.length);
    const minorRingRadius = Math.max(58, major.r * 0.75 + 36);

    for (let j = 0; j < minors.length; j++) {
      const minor = minors[j];
      const aa = (j / minorCount) * Math.PI * 2 + a * 0.35;
      minor.x = (major.x ?? 0) + Math.cos(aa) * minorRingRadius;
      minor.y = (major.y ?? 0) + Math.sin(aa) * minorRingRadius;
    }
  }

  return { nodes, links };
}

function computeBounds(nodes: ArchNode[]): Bounds {
  const box = new THREE.Box3();
  if (nodes.length === 0) return { box, center: new THREE.Vector3(0, 0, 0), radius: 200 };
  for (const n of nodes) box.expandByPoint(pos3(n));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(60, size.length() * 0.6);
  return { box, center, radius };
}

function idOf(x: unknown): string {
  return x && typeof x === 'object' && 'id' in (x as any) ? String((x as any).id) : String(x);
}
function pos3(n: ArchNode) {
  return new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.type === 'major' ? Z_MAJOR : 0);
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCurves(nodes: ArchNode[], links: ArchLink[], palette: ColorScheme): LinkCurve[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const out: LinkCurve[] = [];
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    const s = byId.get(idOf(l.source));
    const t = byId.get(idOf(l.target));
    if (!s || !t) continue;
    const a = pos3(s);
    const b = pos3(t);
    const mid = a.clone().lerp(b, 0.5);
    // Cap lift so very long links don't arc wildly through other nodes.
    mid.z += Math.min(40, 14 + a.distanceTo(b) * 0.05);
    const curve = new THREE.CatmullRomCurve3([a, mid, b], false, 'catmullrom', 0.6);
    const radius = l.type === 'orchestrator' ? 0.75 : l.type === 'overlap' ? 0.58 : 0.46;
    const emissive = l.type === 'overlap' ? palette.secondary : palette.primary;
    const opacity = l.type === 'overlap' ? 0.72 : 0.9;
    out.push({ key: `${l.type}-${i}-${s.id}->${t.id}`, curve, radius, emissive, opacity });
  }
  return out;
}

function BackgroundStars({ bounds }: { bounds: Bounds }) {
  const { palette } = useTheme();
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const r = mulberry32(4242);
    const count = 1400;
    const arr = new Float32Array(count * 3);
    const spread = bounds.radius * 6;
    for (let i = 0; i < count; i++) {
      const u = r();
      const v = r();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const rr = spread * (0.35 + 0.65 * Math.pow(r(), 0.55));
      arr[i * 3 + 0] = bounds.center.x + rr * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = bounds.center.y + rr * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = bounds.center.z + rr * Math.cos(phi);
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [bounds.center.x, bounds.center.y, bounds.center.z, bounds.radius]);

  useEffect(() => () => geom.dispose(), [geom]);

  return (
    <points geometry={geom} frustumCulled={false}>
      <pointsMaterial
        color={palette.text}
        size={1.25}
        sizeAttenuation
        transparent
        opacity={0.42}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function FlowParticles({ curves, count = 160 }: { curves: LinkCurve[]; count?: number }) {
  const { palette } = useTheme();
  const inst = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(() => {
    const r = mulberry32(1337);
    return Array.from({ length: count }, () => ({
      ci: Math.floor(r() * Math.max(1, curves.length)),
      t: r(),
      v: 0.08 + r() * 0.25,
      s: 0.3 + r() * 0.8,
    }));
  }, [count, curves.length]);
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }),
    [],
  );

  // Dispose GPU resources explicitly on unmount.
  useEffect(() => {
    const im = inst.current;
    return () => {
      if (!im) return;
      im.geometry?.dispose?.();
      const mats = Array.isArray(im.material) ? im.material : [im.material];
      for (const m of mats) (m as any)?.dispose?.();
    };
  }, []);

  useFrame((_, dt) => {
    const im = inst.current;
    if (!im || curves.length === 0) return;
    // Compose with a stable identity orientation.
    tmp.q.identity();
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.t = (p.t + dt * p.v) % 1;
      curves[p.ci % curves.length].curve.getPointAt(p.t, tmp.p);
      tmp.s.setScalar(p.s);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      im.setMatrixAt(i, tmp.m);
    }
    im.instanceMatrix.needsUpdate = true;
  });

  useEffect(() => {
    const im = inst.current;
    if (!im || curves.length === 0) return;
    const tmpC = new THREE.Color();
    const tertiary = new THREE.Color(palette.tertiary);
    for (let i = 0; i < parts.length; i++) {
      const c = curves[parts[i].ci % curves.length];
      tmpC.set(c.emissive).lerp(tertiary, 0.25);
      im.setColorAt(i, tmpC);
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [curves, parts]);

  return (
    <instancedMesh ref={inst} args={[undefined as any, undefined as any, parts.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial
        vertexColors
        color={'#ffffff'}
        transparent
        opacity={0.92}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function MajorAura({ r }: { r: number }) {
  const { palette } = useTheme();
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const m = mat.current;
    if (!m) return;
    m.opacity = 0.09 + 0.05 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.2));
  });
  return (
    <mesh>
      <sphereGeometry args={[r * 1.1, 18, 18]} />
      <meshBasicMaterial
        ref={mat}
        color={palette.primary}
        transparent
        opacity={0.12}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function Scene({
  graph,
  bounds,
  onSelect,
  resetRef,
}: {
  graph: FrozenGraph;
  bounds: Bounds;
  onSelect: (n: ArchNode) => void;
  resetRef: MutableRefObject<(() => void) | null>;
}) {
  const { palette } = useTheme();
  const { camera, gl } = useThree();
  const controls = useRef<any>(null);
  const isWebGPU = gl instanceof WebGPURenderer;
  const coreMat = useMemo(() => {
    if (!isWebGPU) return null;
    try {
      return createHyphaeCoreNodeMaterial({ emissiveIntensity: 1.1, noiseScale: 0.92 });
    } catch (e) {
      console.warn('[Hyphae] Core node material failed (TSL/WebGPU). Falling back to standard material.', e);
      return null;
    }
  }, [isWebGPU]);

  useEffect(() => {
    return () => {
      (coreMat as any)?.dispose?.();
    };
  }, [coreMat]);
  const curves = useMemo(() => buildCurves(graph.nodes, graph.links, palette), [graph.nodes, graph.links, palette]);

  useEffect(() => {
    if (graph.nodes.length === 0) return;
    const c = bounds.center;
    const r = bounds.radius;
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.1;
    cam.far = Math.max(2000, r * 10);
    cam.position.set(c.x, c.y + r * 0.15, c.z + r * 2.25);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(c);
      controls.current.update?.();
    }

    resetRef.current = () => {
      cam.position.set(c.x, c.y + r * 0.15, c.z + r * 2.25);
      cam.lookAt(c);
      cam.updateProjectionMatrix();
      if (controls.current) {
        controls.current.target.copy(c);
        controls.current.update?.();
      }
    };
  }, [bounds.center, bounds.radius, camera, graph.nodes.length, resetRef]);

  return (
    <group>
      <BackgroundStars bounds={bounds} />
			<LivingBackground bounds={bounds} />

      <ambientLight intensity={0.32} />
      <hemisphereLight intensity={0.18} color={palette.text} groundColor={palette.background} />
      <directionalLight position={[60, 80, 120]} intensity={0.95} color={palette.tertiary} />
      <pointLight position={[-90, 60, 80]} intensity={0.62} color={palette.primary} />
      <pointLight position={[90, -40, 60]} intensity={0.35} color={palette.secondary} />

      {curves.map((c) => (
        <group key={c.key}>
          {/* Core filament */}
          <mesh>
            <tubeGeometry args={[c.curve, 56, c.radius, 8, false]} />
            <meshStandardMaterial
              color={palette.background}
              emissive={c.emissive}
              emissiveIntensity={0.95}
              roughness={0.5}
              metalness={0.08}
              transparent
              opacity={Math.min(0.95, c.opacity)}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Soft glow envelope */}
          <mesh>
            <tubeGeometry args={[c.curve, 44, c.radius * 2.4, 7, false]} />
            <meshBasicMaterial
              color={c.emissive}
              transparent
              opacity={0.12}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      <FlowParticles curves={curves} count={220} />

      {graph.nodes.map((n) => {
        const z = n.type === 'major' ? Z_MAJOR : 0;
        const r = n.type === 'major' ? Math.max(10, n.r * 0.24) : Math.max(4, n.r * 0.18);
        return (
          <group key={n.id} position={[n.x ?? 0, n.y ?? 0, z]}>
            <mesh
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n);
              }}
            >
              <sphereGeometry args={[r, 22, 22]} />
              {n.type === 'major' && coreMat ? (
                <primitive object={coreMat as any} attach="material" />
              ) : (
                <meshStandardMaterial
                  color={n.type === 'major' ? palette.background : n.color}
                  emissive={n.type === 'major' ? palette.secondary : n.color}
                  emissiveIntensity={n.type === 'major' ? 0.65 : 0.35}
                  roughness={0.6}
                  metalness={0.08}
                />
              )}
            </mesh>
            {n.type === 'major' && <MajorAura r={r} />}
          </group>
        );
      })}

      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.55}
        minDistance={Math.max(30, bounds.radius * 0.35)}
        maxDistance={Math.max(240, bounds.radius * 6)}
      />
    </group>
  );
}

export function ArchitectureMap3D() {
  const { palette } = useTheme();
  const { nodes, links } = useGraphData();
  const [frozen, setFrozen] = useState<FrozenGraph | null>(null);
  const [selected, setSelected] = useState<ArchNode | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const resetViewRef = useRef<(() => void) | null>(null);
  const destroyedRef = useRef(false);

  const onTick = useCallback(() => {}, []);
  const onAutoFit = useCallback((s: RenderState) => {
    // Freeze the graph once the worker has produced a stable-ish layout.
    // The worker calls this only once (see fittedRef inside useSimulationWorker).
    const nextNodes = s.nodes.map((n) => ({ ...n, x: n.x ?? 0, y: n.y ?? 0 }));
    const hasFinitePos = nextNodes.some((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
    if (!hasFinitePos) return;
    setFrozen((prev) => prev ?? { nodes: nextNodes, links: s.links });
  }, []);
  const { init, setAlphaTarget, destroy } = useSimulationWorker(onAutoFit, onTick);

  useEffect(() => {
    destroyedRef.current = false;
    const s = createRenderState();
    s.nodes = nodes;
    s.links = links;
    init(s);
    const fallbackTimer = window.setTimeout(() => {
      setFrozen((prev) => prev ?? buildFallbackLayout(nodes, links));
    }, 2600);
    return () => {
      window.clearTimeout(fallbackTimer);
      if (destroyedRef.current) return;
      destroy();
    };
  }, [destroy, init, links, nodes]);

  useEffect(() => {
    if (!frozen) return;
    // Stop the worker once we have a frozen layout.
    setAlphaTarget(0);
    destroyedRef.current = true;
    destroy();
  }, [destroy, frozen, setAlphaTarget]);

  useEffect(() => {
    const onResize = () => resetViewRef.current?.();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const bounds = useMemo(() => (frozen ? computeBounds(frozen.nodes) : null), [frozen]);

  return (
		<div className="flex overflow-hidden bg-black/90 relative" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Canvas area */}
      <div className="flex-1 relative">
        <Canvas
          className="absolute inset-0"
          dpr={[1, 2]}
          camera={{ fov: 45, position: [0, 0, 220], near: 0.1, far: 3000 }}
          gl={async (p) => {
            try {
              return await createHyphaeRenderer(p.canvas, {
                alpha: false,
                clearColor: palette.background,
                clearAlpha: 1,
              });
            } catch (e) {
              console.warn('[Hyphae] WebGPU renderer init failed; falling back to WebGLRenderer.', e);
              const r = new THREE.WebGLRenderer({ canvas: p.canvas as any, antialias: true, alpha: false });
              r.setClearColor(new THREE.Color(palette.background), 1);
              return r;
            }
          }}
          onPointerMissed={() => setSelected(null)}
        >
          <color attach="background" args={[palette.background]} />
          {bounds && <fog attach="fog" args={[palette.background, bounds.radius * 1.35, bounds.radius * 6.5]} />}
          {frozen && bounds && (
            <Scene graph={frozen} bounds={bounds} onSelect={setSelected} resetRef={resetViewRef} />
          )}
        </Canvas>

        {/* Header bar */}
        <div
          className="absolute top-3 left-4 z-20 flex items-center space-x-3 pointer-events-none"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <Network className="w-7 h-7 text-orange-400/80" />
          <div>
            <h2 className="text-xl font-bold text-white/80/80">Architecture Map (3D)</h2>
            <p className="text-orange-400/40 text-xs">orbit to explore - click nodes to inspect - scroll to zoom</p>
          </div>
        </div>

        {/* Top-right controls */}
        <div
          className="absolute top-3 right-4 z-20 flex items-center space-x-2 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetViewRef.current?.();
            }}
            className="p-2 bg-black/60 hover:bg-white/10 rounded-lg text-orange-300 border border-orange-500/30 transition-colors"
            title="Reset view"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen((v) => !v);
            }}
            className="p-2 bg-black/60 hover:bg-white/10 rounded-lg text-orange-300 border border-orange-500/30 transition-colors"
            title={sidebarOpen ? 'Hide inspector' : 'Show inspector'}
          >
            {sidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Inspector panel */}
      {sidebarOpen && (
        <div
          className="w-[380px] max-w-[42vw] border-l border-orange-500/20 bg-black/80 backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="h-full flex flex-col">
            <div className="px-5 py-4 border-b border-orange-500/15">
              <div className="text-white/80 font-semibold">Inspector</div>
              <div className="text-xs text-orange-400/50">Click a node in the 3D map to see details.</div>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {selected ? (
                selected.type === 'major' ? (
                  <MajorInspector node={selected} />
                ) : (
                  <MinorInspector node={selected} />
                )
              ) : (
                <div className="text-orange-400/60 text-sm">
                  <p className="mb-3">No selection.</p>
                  <ul className="text-xs space-y-1 text-orange-400/50">
                    <li>- Drag: orbit</li>
                    <li>- Scroll: zoom</li>
                    <li>- Click: inspect node</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


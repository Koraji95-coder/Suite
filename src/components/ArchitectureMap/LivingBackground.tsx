import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { HYPHAE_PALETTE } from '../../lib/three/emberPalette';

type BoundsLike = { center: THREE.Vector3; radius: number };

// Deterministic seeded RNG (mulberry32-like)
function createSeededRandom(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function Tendrils({
	bounds,
	count = 12,
	opacity = 0.11,
	emissiveIntensity = 0.55,
	thicknessPulse = 0,
	thicknessPulseSpeed = 0.2,
	reducedMotion = false,
}: {
	bounds: BoundsLike;
	count?: number;
	opacity?: number;
	emissiveIntensity?: number;
	/** 0 = off. Typical range: 0.08 - 0.25 */
	thicknessPulse?: number;
	/** Typical range: 0.1 - 0.35 (slow) */
	thicknessPulseSpeed?: number;
	reducedMotion?: boolean;
}) {
	const instancedRef = useRef<THREE.InstancedMesh>(null);
	const dummy = useMemo(() => new THREE.Object3D(), []);
	const tmp = useMemo(
		() => ({
			p: new THREE.Vector3(),
			dir: new THREE.Vector3(),
			zAxis: new THREE.Vector3(0, 0, 1),
			q: new THREE.Quaternion(),
			qRoll: new THREE.Quaternion(),
		}),
		[],
	);

	const seeds = useMemo(() => {
		const r = createSeededRandom(9876);
		return Array.from({ length: count }, (_, i) => ({
			angle: (i / Math.max(1, count)) * Math.PI * 2 + (r() - 0.5) * 0.35,
			radiusFactor: 0.55 + r() * 0.9,
			heightFactor: 0.15 + r() * 0.85,
			thickness: 0.09 + r() * 0.18,
			speed: 0.08 + r() * 0.22,
			offset: r() * Math.PI * 2,
			roll: (r() - 0.5) * Math.PI,
		}));
	}, [count]);

	const tubeGeo = useMemo(() => {
		// A small "organic" wavy spine oriented along +Z, then instanced/rotated into place.
		const pts: THREE.Vector3[] = [];
		const seg = 26;
		for (let i = 0; i <= seg; i++) {
			const t = i / seg;
			const z = (t - 0.5) * 2;
			const a = t * Math.PI * 5;
			const rad = 0.28 + 0.14 * Math.sin(t * Math.PI * 2);
			pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad * 0.7, z));
		}
		const curve = new THREE.CatmullRomCurve3(pts);
		return new THREE.TubeGeometry(curve, 40, 0.5, 7, false);
	}, []);

	useEffect(() => {
		const im = instancedRef.current;
		if (!im) return;
		im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		return () => tubeGeo.dispose();
	}, [tubeGeo]);

	const updateInstances = useCallback(
		(time: number) => {
			const im = instancedRef.current;
			if (!im) return;
			const c = bounds.center;
			const baseRadius = bounds.radius * 0.75;

			for (let i = 0; i < seeds.length; i++) {
				const s = seeds[i];
				const wave1 = Math.sin(time * s.speed + s.offset) * 0.25;
				const wave2 = Math.cos(time * s.speed * 0.7 + s.offset) * 0.18;
				const r = baseRadius * s.radiusFactor;
				const x = c.x + Math.cos(s.angle + wave1) * r;
				const y = c.y + Math.sin(s.angle * 2 + wave2) * r * 0.28 + bounds.radius * 0.08 * s.heightFactor;
				const z = c.z + Math.sin(s.angle + wave1) * r * 0.42 - bounds.radius * 0.65;

				tmp.p.set(x, y, z);
				tmp.dir.subVectors(c, tmp.p).normalize();
				tmp.q.setFromUnitVectors(tmp.zAxis, tmp.dir);
				tmp.qRoll.setFromAxisAngle(tmp.dir, s.roll + 0.18 * wave1);
				tmp.q.multiply(tmp.qRoll);

				dummy.position.copy(tmp.p);
				dummy.quaternion.copy(tmp.q);
				// Base tube is length~2 in Z, so zScale of (desiredLen/2) gives desired world length.
				const desiredLen = bounds.radius * (0.55 + 0.35 * s.heightFactor);
				const pulse =
					thicknessPulse > 0
						? 1 + Math.sin(time * thicknessPulseSpeed + s.offset) * thicknessPulse
						: 1;
				const thick = Math.max(0.02, s.thickness * pulse);
				dummy.scale.set(thick, thick, desiredLen / 2);
				dummy.updateMatrix();
				im.setMatrixAt(i, dummy.matrix);
			}

			im.instanceMatrix.needsUpdate = true;
		},
		[bounds.center, bounds.radius, dummy, seeds, thicknessPulse, thicknessPulseSpeed, tmp],
	);

	useEffect(() => {
		// Ensure there is a stable initial state even if motion is reduced/frozen.
		updateInstances(0);
	}, [updateInstances]);

	useFrame(({ clock }) => {
		if (reducedMotion) return;
		updateInstances(clock.elapsedTime);
	});

	return (
		<instancedMesh ref={instancedRef} args={[tubeGeo, undefined as any, count]} frustumCulled={false}>
			<meshStandardMaterial
				color={HYPHAE_PALETTE.primary}
				emissive={HYPHAE_PALETTE.secondary}
				emissiveIntensity={emissiveIntensity}
				transparent
				opacity={opacity}
				depthWrite={false}
				blending={THREE.AdditiveBlending}
				roughness={0.75}
				metalness={0.0}
				// keep the glow color stable regardless of tonemapping
				toneMapped={false}
			/>
		</instancedMesh>
	);
}

function LivingParticles({
	bounds,
	count = 6000,
	opacity = 0.22,
	sizeScale = 1,
	reducedMotion = false,
}: {
	bounds: BoundsLike;
	count?: number;
	opacity?: number;
	sizeScale?: number;
	reducedMotion?: boolean;
}) {
	const pointsRef = useRef<THREE.Points>(null);
	const geom = useMemo(() => {
		const rng = createSeededRandom(1234);
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);

		const c = bounds.center;
		const spread = bounds.radius * 2.8;
		const a = new THREE.Color(HYPHAE_PALETTE.primary);
		const b = new THREE.Color(HYPHAE_PALETTE.tertiary);

		for (let i = 0; i < count; i++) {
			const u = rng();
			const v = rng();
			const theta = u * Math.PI * 2;
			const phi = Math.acos(2 * v - 1);
			const rr = spread * (0.35 + 0.65 * Math.pow(rng(), 0.7));

			positions[i * 3 + 0] = c.x + rr * Math.sin(phi) * Math.cos(theta);
			positions[i * 3 + 1] = c.y + rr * Math.sin(phi) * Math.sin(theta);
			positions[i * 3 + 2] = c.z + rr * Math.cos(phi);

			const mix = THREE.MathUtils.clamp((rr / spread) * 0.9 + 0.15 * rng(), 0, 1);
			const col = a.clone().lerp(b, mix);
			colors[i * 3 + 0] = col.r;
			colors[i * 3 + 1] = col.g;
			colors[i * 3 + 2] = col.b;
		}

		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		return g;
	}, [bounds.center.x, bounds.center.y, bounds.center.z, bounds.radius, count]);

	useEffect(() => () => geom.dispose(), [geom]);

	useFrame(({ clock }) => {
		if (reducedMotion) return;
		const p = pointsRef.current;
		if (!p) return;
		const t = clock.elapsedTime;
		p.rotation.y = t * 0.018;
		p.rotation.x = Math.sin(t * 0.11) * 0.05;
	});

	const size = Math.max(0.55, bounds.radius * 0.003) * sizeScale;

	return (
		<points ref={pointsRef} geometry={geom} frustumCulled={false}>
			<pointsMaterial
				size={size}
				vertexColors
				transparent
				opacity={opacity}
				depthWrite={false}
				blending={THREE.AdditiveBlending}
				sizeAttenuation
				toneMapped={false}
			/>
		</points>
	);
}

function CentralGlow({
	bounds,
	opacity,
	color,
	pulse = false,
	pulseSpeed = 0.8,
	pulseStrength = 0.1,
	reducedMotion = false,
}: {
	bounds: BoundsLike;
	opacity: number;
	color: THREE.ColorRepresentation;
	pulse?: boolean;
	pulseSpeed?: number;
	pulseStrength?: number;
	reducedMotion?: boolean;
}) {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame(({ clock }) => {
		if (reducedMotion || !pulse) return;
		const m = meshRef.current;
		if (!m) return;
		const scale = 1 + Math.sin(clock.elapsedTime * pulseSpeed) * pulseStrength;
		m.scale.setScalar(scale);
	});

	return (
		<mesh
			ref={meshRef}
			position={[bounds.center.x, bounds.center.y, bounds.center.z - bounds.radius * 0.6]}
		>
			<sphereGeometry args={[bounds.radius * 0.22, 24, 16]} />
			<meshBasicMaterial
				color={color}
				transparent
				opacity={opacity}
				blending={THREE.AdditiveBlending}
				depthWrite={false}
				toneMapped={false}
			/>
		</mesh>
	);
}

export function LivingBackground({
	bounds,
	particleCount = 6000,
	particleOpacity = 0.22,
	particleSizeScale = 1,
	tendrilCount = 12,
	tendrilOpacity = 0.11,
	tendrilEmissiveIntensity = 0.55,
	tendrilThicknessPulse = 0,
	tendrilThicknessPulseSpeed = 0.2,
	glowOpacity = 0.04,
	glowPulse = false,
	glowPulseSpeed = 0.8,
	glowPulseStrength = 0.1,
	reducedMotion = false,
}: {
	bounds: BoundsLike;
	particleCount?: number;
	particleOpacity?: number;
	particleSizeScale?: number;
	tendrilCount?: number;
	tendrilOpacity?: number;
	tendrilEmissiveIntensity?: number;
	/** 0 = off. Typical range: 0.08 - 0.25 */
	tendrilThicknessPulse?: number;
	/** Typical range: 0.1 - 0.35 (slow) */
	tendrilThicknessPulseSpeed?: number;
	glowOpacity?: number;
	glowPulse?: boolean;
	/** Typical range: 0.5 - 1.0 */
	glowPulseSpeed?: number;
	/** Typical range: 0.06 - 0.14 */
	glowPulseStrength?: number;
	reducedMotion?: boolean;
}) {
	return (
		<group>
			<LivingParticles
				bounds={bounds}
				count={particleCount}
				opacity={particleOpacity}
				sizeScale={particleSizeScale}
				reducedMotion={reducedMotion}
			/>
			<Tendrils
				bounds={bounds}
				count={tendrilCount}
				opacity={tendrilOpacity}
				emissiveIntensity={tendrilEmissiveIntensity}
				thicknessPulse={tendrilThicknessPulse}
				thicknessPulseSpeed={tendrilThicknessPulseSpeed}
				reducedMotion={reducedMotion}
			/>
			<CentralGlow
				bounds={bounds}
				opacity={glowOpacity}
				color={HYPHAE_PALETTE.tertiary}
				pulse={glowPulse}
				pulseSpeed={glowPulseSpeed}
				pulseStrength={glowPulseStrength}
				reducedMotion={reducedMotion}
			/>
		</group>
	);
}

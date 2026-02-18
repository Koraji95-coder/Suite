import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  dot,
  float,
  mix,
  normalWorld,
  normalize,
  oneMinus,
  positionLocal,
  positionViewDirection,
  pow,
  sin,
  smoothstep,
  time,
  triNoise3D,
} from 'three/tsl';

import { HYPHAE_PALETTE } from '@/lib/palette';

export interface HyphaeCoreMaterialOptions {
  /** Spatial frequency of the procedural tissue/vein pattern. */
  noiseScale?: number;
  /** How strong the emissive energy should be. */
  emissiveIntensity?: number;
  /** PBR knobs. */
  roughness?: number;
  metalness?: number;
}

/**
 * Shared Hyphae “living tissue + energy” material.
 *
 * Implemented with TSL (Three Shader Language) so it runs on WebGPU and
 * can also compile down for WebGL fallback via node materials.
 */
export function createHyphaeCoreNodeMaterial(
  opts: HyphaeCoreMaterialOptions = {},
) {
  const {
    noiseScale = 0.9,
    emissiveIntensity = 1.35,
    roughness = 0.38,
    metalness = 0.06,
  } = opts;

  const mat = new MeshStandardNodeMaterial();
  mat.roughness = roughness;
  mat.metalness = metalness;

  // --- TSL graph ---
  // Use local position so the pattern “sticks” to the mesh.
  const p = positionLocal.mul(float(noiseScale));
	// triNoise3D signature is (position, scale, speed).
	const n = triNoise3D(p.add(time.mul(float(0.22))), float(1.0), float(1.0));

  // Vein mask: thin bright filaments emerging from noise ridges.
  const ridges = smoothstep(float(0.12), float(0.55), abs(n));
  const pulse = mix(float(0.15), float(1.0),
    float(0.5).add(float(0.5).mul(sin(time.mul(float(2.2)).add(n.mul(float(6.0))))))
  );

  const base = color(HYPHAE_PALETTE.background);
  const energy = mix(color(HYPHAE_PALETTE.primary), color(HYPHAE_PALETTE.tertiary), pulse);

  // Fresnel-ish rim boost: stronger glow at grazing angles.
  const ndotv = abs(dot(normalize(normalWorld), normalize(positionViewDirection)));
  const rim = pow(clamp(oneMinus(ndotv), float(0), float(1)), float(3.5));

  mat.colorNode = mix(base, energy, ridges.mul(float(0.55)));
  mat.emissiveNode = energy
    .mul(ridges.mul(float(emissiveIntensity)))
    .add(color(HYPHAE_PALETTE.primary).mul(rim.mul(float(0.55))));

  return mat;
}

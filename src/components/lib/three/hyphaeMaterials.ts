import * as THREE from "three";

export interface HyphaeCoreNodeMaterialOptions {
	emissiveIntensity?: number;
	noiseScale?: number;
}

export function createHyphaeCoreNodeMaterial(
	options: HyphaeCoreNodeMaterialOptions = {},
): THREE.MeshStandardMaterial {
	const emissiveIntensity = options.emissiveIntensity ?? 0.9;
	return new THREE.MeshStandardMaterial({
		color: "#0a0f1a",
		emissive: "#66f5ff",
		emissiveIntensity,
		roughness: 0.45,
		metalness: 0.12,
	});
}

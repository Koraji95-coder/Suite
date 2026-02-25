import * as THREE from "three";

export interface HyphaeRendererOptions {
	alpha?: boolean;
	clearColor?: string;
	clearAlpha?: number;
}

export async function createHyphaeRenderer(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	options: HyphaeRendererOptions = {},
): Promise<THREE.WebGLRenderer> {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: options.alpha ?? false,
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setClearColor(
		new THREE.Color(options.clearColor ?? "#020409"),
		options.clearAlpha ?? 1,
	);
	return renderer;
}

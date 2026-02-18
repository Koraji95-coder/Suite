import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { COLOR_SCHEMES, DEFAULT_SCHEME_KEY, type ColorScheme } from '@/lib/palette';

export interface HyphaeRendererOptions {
  palette?: ColorScheme;
  clearColor?: string;
  /** Alpha used when clearing the framebuffer (0 = transparent, 1 = opaque). */
  clearAlpha?: number;
  alpha?: boolean;
  antialias?: boolean;
}

export type HyphaeAnyRenderer = THREE.WebGLRenderer | WebGPURenderer;

function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

function isHTMLCanvas(canvas: unknown): canvas is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement;
}

/**
 * R3F v9-compatible `gl` initializer: WebGPU-first, falls back to WebGL.
 *
 * Usage:
 *   <Canvas gl={(props) => createHyphaeRenderer(props.canvas)} />
 */
export async function createHyphaeRenderer(
	canvas: unknown,
  opts: HyphaeRendererOptions = {},
): Promise<HyphaeAnyRenderer> {
  const {
    palette = COLOR_SCHEMES[DEFAULT_SCHEME_KEY],
    clearColor = palette.background,
    alpha = true,
    antialias = true,
  } = opts;

	// If the canvas has an alpha channel, default to clearing with 0 alpha so it can be composited.
	const clearAlpha = opts.clearAlpha ?? (alpha ? 0 : 1);

	if (hasWebGPU() && isHTMLCanvas(canvas)) {
    try {
      const r = new WebGPURenderer({
        canvas,
        alpha,
        antialias,
	        // NOTE: WebGPU's adapter selection currently ignores `powerPreference` on Windows
	        // and can emit a console warning. We omit it here to keep logs clean.
      });

      // Required before first render in r17x+.
      await r.init();

      // Keep output consistent with WebGL renderer defaults we set below.
      (r as any).outputColorSpace = THREE.SRGBColorSpace;
      (r as any).toneMapping = THREE.ACESFilmicToneMapping;
      (r as any).toneMappingExposure = 1.0;

	      (r as any).setClearColor?.(new THREE.Color(clearColor), clearAlpha);

      return r;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Hyphae] WebGPU init failed, falling back to WebGL:', err);
    }
  }

	const r = new THREE.WebGLRenderer({
		canvas: canvas as any,
    alpha,
    antialias,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });

  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
	  r.setClearColor(new THREE.Color(clearColor), clearAlpha);

  return r;
}

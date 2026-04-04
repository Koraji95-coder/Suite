/**
 * Generate a locally-unique identifier using `crypto.randomUUID()`.
 *
 * This replaces the insecure `Math.random()`-based fallback that CodeQL
 * flags under `js/insecure-randomness`. Every modern browser and Node ≥ 19
 * exposes `crypto.randomUUID()`, so no fallback is necessary.
 */
export function localId(prefix?: string): string {
	return prefix ? `${prefix}-${crypto.randomUUID()}` : crypto.randomUUID();
}

/**
 * Cryptographically secure random helpers that replace `Math.random()`.
 *
 * CodeQL flags `Math.random()` under `js/insecure-randomness` because its
 * output is predictable. These wrappers use `crypto.getRandomValues()` which
 * is available in every modern browser and Node ≥ 19.
 */

/** Return a random float in [0, 1) — drop-in replacement for `Math.random()`. */
export function secureRandom(): number {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return buf[0] / (0xffffffff + 1);
}

/** Return a random integer in [min, max] (inclusive on both ends). */
export function secureRandomInt(min: number, max: number): number {
	return min + Math.floor(secureRandom() * (max - min + 1));
}

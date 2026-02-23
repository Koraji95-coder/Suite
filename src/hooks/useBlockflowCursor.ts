// src/hooks/useBlockflowCursor.ts
import { useEffect, useMemo, useRef } from "react";

/**
 * Pointer state shared between cursor + any other effects.
 * - x/y are screen pixels
 * - normalX/normalY are 0..1 normalized to either:
 *   - containerRef bounds if provided
 *   - viewport bounds if not
 */
export type PointerState = {
	x: number;
	y: number;
	normalX: number;
	normalY: number;
};

/**
 * Main pointer tracker hook.
 * This does NOT render the cursor; it just tracks pointer state in a ref.
 *
 * Why: this lets you feed the same pointer data to:
 * - Cursor (DOM)
 * - Three/R3F refs (mouseX/mouseY)
 * - Any parallax / FX without extra listeners
 */
export function usePointerTrack(containerRef?: React.RefObject<HTMLElement>) {
	const pointerRef = useRef<PointerState>({
		x: 0,
		y: 0,
		normalX: 0.5,
		normalY: 0.5,
	});

	useEffect(() => {
		let raf = 0;
		let pending = false;

		const computeNormalized = (clientX: number, clientY: number) => {
			const el = containerRef?.current;
			if (!el) {
				const w = Math.max(1, window.innerWidth);
				const h = Math.max(1, window.innerHeight);
				return {
					nx: Math.min(1, Math.max(0, clientX / w)),
					ny: Math.min(1, Math.max(0, clientY / h)),
				};
			}

			const rect = el.getBoundingClientRect();
			const w = Math.max(1, rect.width);
			const h = Math.max(1, rect.height);
			const x = clientX - rect.left;
			const y = clientY - rect.top;

			return {
				nx: Math.min(1, Math.max(0, x / w)),
				ny: Math.min(1, Math.max(0, y / h)),
			};
		};

		const flush = (x: number, y: number) => {
			const { nx, ny } = computeNormalized(x, y);
			pointerRef.current = { x, y, normalX: nx, normalY: ny };
		};

		const onMove = (e: PointerEvent) => {
			// RAF throttle: prevents excessive writes during very high Hz pointers.
			if (pending) return;
			pending = true;
			const x = e.clientX;
			const y = e.clientY;

			raf = requestAnimationFrame(() => {
				pending = false;
				flush(x, y);
			});
		};

		window.addEventListener("pointermove", onMove, { passive: true });

		return () => {
			window.removeEventListener("pointermove", onMove);
			cancelAnimationFrame(raf);
		};
	}, [containerRef]);

	return pointerRef;
}

/**
 * Custom cursor hook.
 * Uses the same pointer tracking ref, then animates cursor and ring.
 *
 * Why: cursor should NOT re-render React; we only mutate DOM styles.
 */
export function useBlockflowCursor(
	enabled: boolean,
	options?: {
		/**
		 * If provided, normalX/normalY will be relative to this element.
		 * If omitted, normalized is relative to viewport.
		 */
		containerRef?: React.RefObject<HTMLElement>;
		/**
		 * Custom hover selector list to enlarge cursor.
		 */
		hoverSelector?: string;
	},
) {
	const hoverSelector = useMemo(
		() =>
			options?.hoverSelector ??
			"a,button,[role='button'],.feat-card,.theme-card,.settings-tab,.btn-hero-primary,.btn-hero-secondary",
		[options?.hoverSelector],
	);

	const pointerRef = usePointerTrack(options?.containerRef);

	useEffect(() => {
		if (!enabled) return;

		const cur = document.getElementById("cursor") as HTMLDivElement | null;
		const ring = document.getElementById("cursor-ring") as HTMLDivElement | null;
		if (!cur || !ring) return;

		// Only hide OS cursor while our custom cursor is active.
		document.body.classList.add("cursor-enabled");

		let raf = 0;
		let rx = 0;
		let ry = 0;

		const tick = () => {
			const { x, y } = pointerRef.current;

			// Smooth only the ring; keep the dot snappy.
			rx += (x - rx) * 0.13;
			ry += (y - ry) * 0.13;

			cur.style.left = `${x}px`;
			cur.style.top = `${y}px`;
			ring.style.left = `${rx}px`;
			ring.style.top = `${ry}px`;

			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);

		const hoverables = Array.from(document.querySelectorAll(hoverSelector)) as HTMLElement[];

		const onEnter = () => {
			cur.style.transform = "translate(-50%,-50%) scale(0.4)";
			ring.style.width = "50px";
			ring.style.height = "50px";
			ring.style.borderColor = "rgba(232,201,126,0.55)";
		};

		const onLeave = () => {
			cur.style.transform = "translate(-50%,-50%) scale(1)";
			ring.style.width = "34px";
			ring.style.height = "34px";
			ring.style.borderColor = "rgba(232,201,126,0.32)";
		};

		hoverables.forEach((el) => {
			el.addEventListener("mouseenter", onEnter);
			el.addEventListener("mouseleave", onLeave);
		});

		return () => {
			document.body.classList.remove("cursor-enabled");
			cancelAnimationFrame(raf);
			hoverables.forEach((el) => {
				el.removeEventListener("mouseenter", onEnter);
				el.removeEventListener("mouseleave", onLeave);
			});
		};
	}, [enabled, hoverSelector, pointerRef]);

	// Return pointerRef so other systems can use the same data (R3F, parallax, etc.)
	return pointerRef;
}

export function useCursorEnabled() {
	// Disable on touch devices.
	if (typeof window === "undefined") return false;
	const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
	return !isTouch;
}
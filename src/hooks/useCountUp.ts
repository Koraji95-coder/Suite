import { useEffect, useRef, useState } from "react";

export function useCountUp(
	target: number,
	triggered: boolean,
	duration = 2000,
	prefix = "",
	suffix = "",
) {
	const [display, setDisplay] = useState(`${prefix}0${suffix}`);
	const frameRef = useRef<number>(0);

	useEffect(() => {
		if (!triggered) return;
		const start = performance.now();

		const animate = (now: number) => {
			const elapsed = now - start;
			const t = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - t, 3);
			const current = Math.round(eased * target);
			setDisplay(`${prefix}${current.toLocaleString()}${suffix}`);

			if (t < 1) {
				frameRef.current = requestAnimationFrame(animate);
			}
		};

		frameRef.current = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(frameRef.current);
	}, [triggered, target, duration, prefix, suffix]);

	return display;
}

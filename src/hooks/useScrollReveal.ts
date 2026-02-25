import { RefObject, useEffect, useRef, useState } from "react";

export function useScrollReveal(
	_sectionRef: RefObject<HTMLElement | null>,
	threshold = 0.15,
) {
	const ref = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const obs = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setVisible(true);
					obs.disconnect();
				}
			},
			{ threshold },
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, [threshold]);

	return { ref, visible };
}

export function useScrollProgress() {
	const ref = useRef<HTMLDivElement>(null);
	const progress = useRef(0);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		let raf: number;
		const update = () => {
			const rect = el.getBoundingClientRect();
			const vh = window.innerHeight;
			const raw = 1 - rect.top / vh;
			progress.current = Math.max(0, Math.min(1, raw));
			raf = requestAnimationFrame(update);
		};
		raf = requestAnimationFrame(update);
		return () => cancelAnimationFrame(raf);
	}, []);

	return { ref, progress };
}

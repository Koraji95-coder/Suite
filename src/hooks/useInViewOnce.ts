// src/hooks/useInViewOnce.ts
import { useEffect, useState } from "react";

export function useInViewOnce<T extends Element>(
	ref: React.RefObject<T>,
	threshold = 0.12,
) {
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el || inView) return;

		const obs = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setInView(true);
					obs.disconnect();
				}
			},
			{ threshold },
		);

		obs.observe(el);
		return () => obs.disconnect();
	}, [ref, threshold, inView]);

	return inView;
}

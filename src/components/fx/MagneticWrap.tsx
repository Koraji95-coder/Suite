// src/components/fx/MagneticWrap.tsx
import React, { useEffect, useRef } from "react";

export default function MagneticWrap({
	children,
}: {
	children: React.ReactNode;
}) {
	const wrapRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;

		const btn = wrap.querySelector("a,button") as HTMLElement | null;
		if (!btn) return;

		const onMove = (e: MouseEvent) => {
			const r = wrap.getBoundingClientRect();
			const x = (e.clientX - r.left - r.width / 2) * 0.32;
			const y = (e.clientY - r.top - r.height / 2) * 0.32;
			btn.style.transform = `translate(${x}px,${y}px)`;
		};
		const onLeave = () => {
			btn.style.transform = "";
		};

		wrap.addEventListener("mousemove", onMove);
		wrap.addEventListener("mouseleave", onLeave);
		return () => {
			wrap.removeEventListener("mousemove", onMove);
			wrap.removeEventListener("mouseleave", onLeave);
		};
	}, []);

	return (
		<span className="magnetic-wrap" ref={wrapRef}>
			{children}
		</span>
	);
}

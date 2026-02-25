// src/components/fx/ParticleField.tsx
import { useEffect, useRef } from "react";

type Pt = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	col: string;
	a: number;
};

export default function ParticleField() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let W = 0;
		let H = 0;

		const resize = () => {
			const r = canvas.getBoundingClientRect();
			W = canvas.width = Math.max(1, Math.floor(r.width));
			H = canvas.height = Math.max(1, Math.floor(r.height));
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(canvas);

		const COLS = [
			"rgba(232,201,126,",
			"rgba(212,216,232,",
			"rgba(232,126,158,",
			"rgba(255,255,255,",
		];

		const pts: Pt[] = Array.from({ length: 85 }, () => ({
			x: Math.random() * 1800,
			y: Math.random() * 1000,
			vx: (Math.random() - 0.5) * 0.16,
			vy: (Math.random() - 0.5) * 0.16,
			r: Math.random() * 1.3 + 0.4,
			col: COLS[Math.floor(Math.random() * COLS.length)],
			a: Math.random() * 0.3 + 0.07,
		}));

		let pmx = 9999;
		let pmy = 9999;

		const onMove = (e: MouseEvent) => {
			const r = canvas.getBoundingClientRect();
			pmx = e.clientX - r.left;
			pmy = e.clientY - r.top;
		};

		canvas.addEventListener("mousemove", onMove);

		let raf = 0;
		const draw = () => {
			ctx.clearRect(0, 0, W, H);

			for (const p of pts) {
				const dx = p.x - pmx;
				const dy = p.y - pmy;
				const d = Math.sqrt(dx * dx + dy * dy);

				if (d < 110 && d > 0.0001) {
					const f = ((110 - d) / 110) * 0.22;
					p.vx += (dx / d) * f;
					p.vy += (dy / d) * f;
				}

				p.vx *= 0.986;
				p.vy *= 0.986;

				p.x += p.vx + (Math.random() - 0.5) * 0.04;
				p.y += p.vy + (Math.random() - 0.5) * 0.04;

				if (p.x < -8) p.x = W + 8;
				if (p.x > W + 8) p.x = -8;
				if (p.y < -8) p.y = H + 8;
				if (p.y > H + 8) p.y = -8;

				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
				ctx.fillStyle = `${p.col}${p.a})`;
				ctx.fill();
			}

			raf = requestAnimationFrame(draw);
		};

		raf = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(raf);
			canvas.removeEventListener("mousemove", onMove);
			ro.disconnect();
		};
	}, []);

	return (
		<canvas
			id="particle-canvas"
			ref={canvasRef}
			className="absolute inset-0 w-full h-full"
		/>
	);
}

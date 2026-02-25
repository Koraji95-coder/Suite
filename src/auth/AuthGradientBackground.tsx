// src/auth/AuthGradientBackground.tsx
// Animated Gradient Glass background for auth pages
import { useEffect, useRef } from "react";

export default function AuthGradientBackground() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		let frame = 0;
		let running = true;

		// Animate gradient angle and stops
		function animate() {
			if (!running) return;
			if (!ref.current) return;
			frame++;
			const angle = 110 + 10 * Math.sin(frame / 220);
			const gold = "var(--gold)";
			const silver = "var(--silver)";
			const rose = "var(--rose)";
			ref.current.style.background = `linear-gradient(${angle}deg, ${gold} 0%, var(--white-faint) 36%, ${silver} 62%, ${rose} 100%)`;
			ref.current.style.filter = "blur(20px) saturate(120%)";
			requestAnimationFrame(animate);
		}
		animate();
		return () => {
			running = false;
		};
	}, []);

	return (
		<div
			ref={ref}
			aria-hidden="true"
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 0,
				pointerEvents: "none",
				opacity: 0.58,
				backgroundSize: "140% 140%",
				backgroundPosition: "50% 50%",
				transition: "opacity 0.5s",
			}}
			className="auth-gradient-bg"
		/>
	);
}

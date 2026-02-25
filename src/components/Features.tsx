// src/components/Features.tsx
import { useEffect, useMemo, useRef } from "react";

type Feature = { title: string; desc: string };

export default function Features() {
	const features: Feature[] = useMemo(
		() => [
			{
				title: "Instant Assembly",
				desc: "Drag and drop pre-built components directly into your project. Zero config, zero boilerplate.",
			},
			{
				title: "Production Hardened",
				desc: "Every block is tested across edge cases, accessibility audited, and performance benchmarked.",
			},
			{
				title: "Infinite Composability",
				desc: "Nest blocks within blocks. Build complex layouts from simple, well-defined primitives.",
			},
			{
				title: "Global CDN",
				desc: "Assets served from edge locations worldwide. Sub-50ms load times, no matter where your users are.",
			},
			{
				title: "AI-Powered Suggestions",
				desc: "Smart block recommendations based on your project context, design system, and team patterns.",
			},
			{
				title: "Version Control",
				desc: "Full semantic versioning for every block. Roll back, compare diffs, and manage dependencies effortlessly.",
			},
		],
		[],
	);

	const cardRefs = useRef<Array<HTMLDivElement | null>>([]);

	useEffect(() => {
		cardRefs.current.forEach((card) => {
			if (!card) return;

			let raf = 0;

			const onMove = (e: MouseEvent) => {
				cancelAnimationFrame(raf);
				raf = requestAnimationFrame(() => {
					const r = card.getBoundingClientRect();
					const x = e.clientX - r.left;
					const y = e.clientY - r.top;
					const nx = x / r.width - 0.5;
					const ny = y / r.height - 0.5;

					card.style.transform = `perspective(700px) rotateX(${ny * -7}deg) rotateY(${nx * 7}deg) scale(1.025) translateY(-4px)`;
					card.style.background = `radial-gradient(circle at ${35 + nx * 50}% ${35 + ny * 50}%,rgba(255,255,255,0.07),rgba(255,255,255,0.03) 60%)`;
				});
			};

			const onLeave = () => {
				card.style.transform = "";
				card.style.background = "";
			};

			card.addEventListener("mousemove", onMove);
			card.addEventListener("mouseleave", onLeave);

			return () => {
				cancelAnimationFrame(raf);
				card.removeEventListener("mousemove", onMove);
				card.removeEventListener("mouseleave", onLeave);
			};
		});
	}, []);

	return (
		<section className="content" id="features" data-section="features">
			<div className="inner">
				<div className="reveal in">
					<span className="section-eyebrow">Features</span>
					<h2 className="section-title">
						Everything you need
						<br />
						<em>to ship faster</em>
					</h2>
					<p className="section-sub">
						Purpose-built for modern teams who refuse to compromise between
						speed and quality.
					</p>
				</div>

				<div className="feat-grid">
					{features.map((f, i) => (
						<div
							key={f.title}
							ref={(el) => {
								cardRefs.current[i] = el;
							}}
							className="feat-card reveal"
							style={{ transitionDelay: `${i * 0.05}s` }}
							data-index={i}
						>
							<div className="feat-title">{f.title}</div>
							<p className="feat-desc">{f.desc}</p>
						</div>
					))}
				</div>
			</div>

			<div className="fade-divider" />
		</section>
	);
}

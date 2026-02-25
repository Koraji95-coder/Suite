// src/components/HowItWorks.tsx
import { useEffect, useRef } from "react";

export default function HowItWorks() {
	const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

	useEffect(() => {
		const steps = stepRefs.current.filter(Boolean) as HTMLDivElement[];
		if (steps.length === 0) return;

		const obs = new IntersectionObserver(
			(entries) => {
				entries.forEach((e) => {
					if (!e.isIntersecting) return;
					const el = e.target as HTMLElement;
					const delay = Number(el.dataset.delay ?? "0");
					setTimeout(() => el.classList.add("in"), delay);
					obs.unobserve(el);
				});
			},
			{ threshold: 0.1 },
		);

		steps.forEach((s) => obs.observe(s));
		return () => obs.disconnect();
	}, []);

	return (
		<section className="content" id="how-it-works" data-section="how-it-works">
			<div className="inner">
				<div className="reveal in">
					<span className="section-eyebrow">Process</span>
					<h2 className="section-title">
						Three steps to
						<br />
						<em>production</em>
					</h2>
					<p className="section-sub">
						Go from idea to shipped product in minutes, not months.
					</p>
				</div>

				<div className="steps">
					{[
						{
							num: "01 — Browse & Discover",
							title: "Find your block",
							desc: "Explore thousands of production-ready blocks organized by category, framework, and design system.",
						},
						{
							num: "02 — Compose & Customize",
							title: "Build your system",
							desc: "Stack blocks together visually or through code. Every block exposes a clean API with TypeScript definitions.",
						},
						{
							num: "03 — Ship & Scale",
							title: "Deploy everywhere",
							desc: "Deploy with a single command. Automatic tree-shaking ensures you only ship what you use.",
						},
					].map((s, i) => (
						<div
							key={s.num}
							ref={(el) => {
								stepRefs.current[i] = el;
							}}
							className="step"
							data-delay={i * 120}
						>
							<div className="step-num">{s.num}</div>
							<div className="step-title">{s.title}</div>
							<p className="step-desc">{s.desc}</p>
						</div>
					))}
				</div>
			</div>

			<div className="fade-divider" />
		</section>
	);
}

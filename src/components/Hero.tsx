// src/components/Hero.tsx
import { useEffect, useMemo } from "react";
import MagneticWrap from "./fx/MagneticWrap";
import Marquee from "./fx/Marquee";

function easeOutQuart(t: number) {
	return 1 - Math.pow(1 - t, 4);
}

function useCountUpOnView() {
	useEffect(() => {
		const statsEl = document.querySelector(".hero-stats") as HTMLElement | null;
		if (!statsEl) return;

		const countUp = (el: HTMLElement) => {
			const tgt = Number(el.dataset.target ?? "0");
			const suf = el.dataset.suffix ?? "";
			const pre = el.dataset.prefix ?? "";
			const dec = Number(el.dataset.dec ?? "0");
			const dur = 2000;
			const t0 = performance.now();

			const frame = (now: number) => {
				const t = Math.min((now - t0) / dur, 1);
				const val = tgt * easeOutQuart(t);
				const out = dec ? val.toFixed(dec) : Math.floor(val).toLocaleString();
				el.textContent = `${pre}${out}${suf}`;

				if (t < 1) requestAnimationFrame(frame);
				else {
					const finalOut = dec ? tgt.toFixed(dec) : tgt.toLocaleString();
					el.textContent = `${pre}${finalOut}${suf}`;
					setTimeout(() => {
						el.classList.add("glint");
						setTimeout(() => el.classList.remove("glint"), 600);
					}, 100);
				}
			};

			requestAnimationFrame(frame);
		};

		const obs = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					document
						.querySelectorAll<HTMLElement>(".stat-val[data-target]")
						.forEach(countUp);
					obs.disconnect();
				}
			},
			{ threshold: 0.5 },
		);

		obs.observe(statsEl);
		return () => obs.disconnect();
	}, []);
}

export default function Hero() {
	useCountUpOnView();

	const words = useMemo(() => {
		const line1 = ["Build", "with"];
		const line2 = ["modular", "blocks"];
		let i = 0;

		const mk = (w: string, italic: boolean) => {
			const delay = 0.28 + i * 0.13;
			i += 1;
			return { w, italic, delay };
		};

		return {
			line1: line1.map((w) => mk(w, false)),
			line2: line2.map((w) => mk(w, true)),
		};
	}, []);

	return (
		<section id="hero" data-section="hero">
			<div className="hero-badge">
				<span className="badge-dot" />
				Now in Public Beta
			</div>

			<h1 className="hero-title" id="hero-title">
				<span style={{ display: "block" }}>
					{words.line1.map((x) => (
						<span
							key={x.w}
							className="word"
							style={{ animationDelay: `${x.delay}s` }}
						>
							{x.w}{" "}
						</span>
					))}
				</span>
				<span style={{ display: "block" }}>
					{words.line2.map((x) => (
						<span
							key={x.w}
							className={`word ${x.italic ? "shine-word" : ""}`}
							style={{ animationDelay: `${x.delay}s` }}
						>
							{x.w}{" "}
						</span>
					))}
				</span>
			</h1>

			<p className="hero-sub">
				Assemble production-ready interfaces from intelligent, physics-aware
				building blocks. Zero config, infinite possibilities.
			</p>

			<div className="hero-actions">
				<MagneticWrap>
					<a href="#cta" className="btn-hero-primary">
						Start building free
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M2.5 7h9M7.5 3l4 4-4 4" />
						</svg>
					</a>
				</MagneticWrap>

				<MagneticWrap>
					<a href="#how-it-works" className="btn-hero-secondary">
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
						>
							<circle cx="7" cy="7" r="6" />
							<path
								d="M5.5 4.5l5 2.5-5 2.5V4.5z"
								fill="currentColor"
								stroke="none"
							/>
						</svg>
						Watch demo
					</a>
				</MagneticWrap>
			</div>

			<Marquee />

			<div className="hero-stats">
				<div className="stat-item">
					<span className="stat-val" data-target="10421" data-suffix="+">
						0
					</span>
					<span className="stat-label">Components</span>
				</div>
				<div className="stat-item">
					<span
						className="stat-val"
						data-target="99.97"
						data-dec="2"
						data-suffix="%"
					>
						0
					</span>
					<span className="stat-label">Uptime</span>
				</div>
				<div className="stat-item">
					<span
						className="stat-val"
						data-prefix="&lt;"
						data-target="12"
						data-suffix="ms"
					>
						0
					</span>
					<span className="stat-label">Latency</span>
				</div>
				<div className="stat-item">
					<span className="stat-val" data-target="247" data-suffix="+">
						0
					</span>
					<span className="stat-label">Edge nodes</span>
				</div>
			</div>
		</section>
	);
}

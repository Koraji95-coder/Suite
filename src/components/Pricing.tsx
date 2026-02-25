// src/components/Pricing.tsx  (CTA version)
import { useEffect } from "react";
import { Link } from "react-router-dom";
import MagneticWrap from "./fx/MagneticWrap";

export default function Pricing() {
	useEffect(() => {
		const wrap = document.querySelector(".cta-wrap") as HTMLElement | null;
		if (!wrap) return;

		const obs = new IntersectionObserver(
			(entries) => {
				entries.forEach((e) => {
					if (e.isIntersecting) wrap.classList.add("in");
				});
			},
			{ threshold: 0.08 },
		);

		obs.observe(wrap);
		return () => obs.disconnect();
	}, []);

	useEffect(() => {
		const ctaWrap = document.querySelector(".cta-wrap") as HTMLElement | null;
		const glow = document.getElementById("cta-glow") as HTMLElement | null;
		if (!ctaWrap || !glow) return;

		const onMove = (e: MouseEvent) => {
			const r = ctaWrap.getBoundingClientRect();
			glow.style.left = `${r.width / 2 + (e.clientX - r.left - r.width / 2) * -0.28}px`;
			glow.style.top = `${r.height / 2 + (e.clientY - r.top - r.height / 2) * -0.28}px`;
		};

		const onLeave = () => {
			glow.style.left = "50%";
			glow.style.top = "50%";
		};

		ctaWrap.addEventListener("mousemove", onMove);
		ctaWrap.addEventListener("mouseleave", onLeave);
		return () => {
			ctaWrap.removeEventListener("mousemove", onMove);
			ctaWrap.removeEventListener("mouseleave", onLeave);
		};
	}, []);

	return (
		<section className="content" id="cta" data-section="cta">
			<div className="inner">
				<div className="cta-wrap">
					<div className="cta-card">
						<div id="cta-glow" />
						<h2 className="cta-title">
							Ready to
							<br />
							<em>start building?</em>
						</h2>
						<p className="cta-sub">
							Join thousands of teams already shipping faster with BlockFlow.
							Free to start, scales with you.
						</p>

						<div className="cta-actions">
							<MagneticWrap>
								<Link to="/signup" className="btn-hero-primary">
									Get started for free
								</Link>
							</MagneticWrap>
							<MagneticWrap>
								<Link to="/login" className="btn-hero-secondary">
									Talk to sales
								</Link>
							</MagneticWrap>
						</div>

						<p className="cta-note">No credit card required · Cancel anytime</p>
					</div>
				</div>
			</div>

			<div className="fade-divider" />
		</section>
	);
}

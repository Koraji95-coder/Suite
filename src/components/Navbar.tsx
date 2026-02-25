// src/components/Navbar.tsx
import { useEffect } from "react";
import { Link } from "react-router-dom";
import MagneticWrap from "./fx/MagneticWrap";

export default function Navbar() {
	useEffect(() => {
		const navbar = document.getElementById("navbar");
		if (!navbar) return;

		const onScroll = () =>
			navbar.classList.toggle("scrolled", window.scrollY > 40);
		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();

		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<nav id="navbar">
			<a href="#hero" className="nav-logo">
				<div className="nav-logo-mark">
					<span />
					<span />
					<span />
					<span />
				</div>
				<span className="nav-logo-name">BlockFlow</span>
			</a>

			<div className="nav-links">
				<a href="#features">Features</a>
				<a href="#how-it-works">How It Works</a>
				<a href="#cta">Get Access</a>
			</div>

			<div className="nav-right">
				<Link to="/login" className="btn-ghost">
					Sign in
				</Link>
				<MagneticWrap>
					<Link to="/signup" className="btn-pill">
						Start free
					</Link>
				</MagneticWrap>
			</div>
		</nav>
	);
}

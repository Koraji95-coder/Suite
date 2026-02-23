// src/routes/PrivacyPage.tsx
import { Link } from "react-router-dom";

export default function PrivacyPage() {
	return (
		<div className="auth-page">
			<nav id="navbar" className="scrolled">
				<Link to="/" className="nav-logo" aria-label="BlockFlow home">
					<div className="nav-logo-mark">
						<span />
						<span />
						<span />
						<span />
					</div>
					<span className="nav-logo-name">BlockFlow</span>
				</Link>

				<div className="nav-right">
					<Link to="/" className="btn-ghost">
						Back to landing
					</Link>
				</div>
			</nav>

			<main className="auth-main">
				<div className="auth-card glass" style={{ width: "min(860px, 100%)" }}>
					<div className="auth-head">
						<div className="hero-badge" style={{ marginBottom: 18 }}>
							<span className="badge-dot" />
							Privacy
						</div>
						<h1 className="auth-title">Privacy Policy</h1>
						<p className="auth-sub">
							This is a living document. We’ll update it as features roll out.
						</p>
					</div>

					<div style={{ position: "relative", zIndex: 1, color: "var(--white-dim)", lineHeight: 1.75, fontSize: 14 }}>
						<h2 style={{ color: "var(--white)", fontSize: 16, marginTop: 14 }}>What we collect</h2>
						<ul style={{ paddingLeft: 18, marginTop: 8 }}>
							<li>Account information (email, auth identifiers)</li>
							<li>Product usage events (to improve the product)</li>
							<li>Optional billing data (if/when enabled)</li>
						</ul>

						<h2 style={{ color: "var(--white)", fontSize: 16, marginTop: 18 }}>How we use it</h2>
						<ul style={{ paddingLeft: 18, marginTop: 8 }}>
							<li>Provide and secure the service</li>
							<li>Improve reliability, performance, and UX</li>
							<li>Support and debugging (when needed)</li>
						</ul>

						<h2 style={{ color: "var(--white)", fontSize: 16, marginTop: 18 }}>Contact</h2>
						<p style={{ marginTop: 8 }}>
							If you have questions, contact: <span style={{ color: "var(--white)" }}>privacy@blockflow.example</span>
						</p>

						<div style={{ marginTop: 20, display: "flex", gap: 12 }}>
							<Link to="/login" className="btn-hero-secondary" style={{ textDecoration: "none" }}>
								Sign in
							</Link>
							<Link to="/signup" className="btn-hero-primary" style={{ textDecoration: "none" }}>
								Create account
							</Link>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
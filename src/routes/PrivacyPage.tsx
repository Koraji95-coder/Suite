// src/routes/PrivacyPage.tsx
import { Link } from "react-router-dom";
import AuthShell from "../auth/AuthShell";

export default function PrivacyPage() {
	return (
		<AuthShell
			navLink={{ to: "/", label: "Back to landing" }}
			panelBadge="Privacy & Trust"
			panelTitle="Built for clarity and control"
			panelSubtitle="We collect only what we need to operate the workspace. Your data stays scoped to your account."
			panelItems={[
				{
					title: "Minimal collection",
					description:
						"Email, auth identifiers, and usage events to improve UX.",
				},
				{
					title: "Operational security",
					description:
						"We secure sessions, data access, and recovery workflows.",
				},
				{
					title: "Transparent updates",
					description:
						"This policy will evolve with the product, with clear change logs.",
				},
			]}
			panelFooter="Have questions? privacy@blockflow.example"
			cardClassName="auth-card-wide"
		>
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

			<div className="auth-copy">
				<h2>What we collect</h2>
				<ul>
					<li>Account information (email, auth identifiers)</li>
					<li>Product usage events (to improve the product)</li>
					<li>Optional billing data (if/when enabled)</li>
				</ul>

				<h2>How we use it</h2>
				<ul>
					<li>Provide and secure the service</li>
					<li>Improve reliability, performance, and UX</li>
					<li>Support and debugging (when needed)</li>
				</ul>

				<h2>Contact</h2>
				<p>
					If you have questions, contact:{" "}
					<span className="auth-copy-strong">privacy@blockflow.example</span>
				</p>

				<div className="auth-copy-actions">
					<Link to="/login" className="btn-hero-secondary">
						Sign in
					</Link>
					<Link to="/signup" className="btn-hero-primary">
						Create account
					</Link>
				</div>
			</div>
		</AuthShell>
	);
}

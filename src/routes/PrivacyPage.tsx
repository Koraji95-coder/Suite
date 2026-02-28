// src/routes/PrivacyPage.tsx
import { Link } from "react-router-dom";
import { APP_NAME } from "@/app";
import AuthShell from "../auth/AuthShell";

const APP_SLUG = APP_NAME.toLowerCase().replace(/\s+/g, "");

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
			panelFooter={`Have questions? privacy@${APP_SLUG}.example`}
			cardClassName="md:col-span-12"
		>
			<div className="mb-6">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
					<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
					Privacy
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Privacy Policy
				</h1>
				<p className="mt-2 text-sm [color:var(--text-muted)]">
					This is a living document. We’ll update it as features roll out.
				</p>
			</div>

			<div className="grid gap-3 text-sm [color:var(--text-muted)]">
				<h2 className="mt-2 text-base font-semibold [color:var(--text)]">
					What we collect
				</h2>
				<ul className="list-disc pl-5">
					<li>Account information (email, auth identifiers)</li>
					<li>Product usage events (to improve the product)</li>
					<li>Optional billing data (if/when enabled)</li>
				</ul>

				<h2 className="mt-2 text-base font-semibold [color:var(--text)]">
					How we use it
				</h2>
				<ul className="list-disc pl-5">
					<li>Provide and secure the service</li>
					<li>Improve reliability, performance, and UX</li>
					<li>Support and debugging (when needed)</li>
				</ul>

				<h2 className="mt-2 text-base font-semibold [color:var(--text)]">
					Contact
				</h2>
				<p>
					If you have questions, contact:{" "}
					<span className="font-semibold [color:var(--text)]">
						{`privacy@${APP_SLUG}.example`}
					</span>
				</p>

				<div className="mt-2 flex flex-wrap gap-2">
					<Link
						to="/login"
						className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						Sign in
					</Link>
					<Link
						to="/signup"
						className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
					>
						Create account
					</Link>
				</div>
			</div>
		</AuthShell>
	);
}

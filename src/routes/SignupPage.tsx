import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthEnvDebugCard from "../auth/AuthEnvDebugCard";
import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import { useAuth } from "../auth/useAuth";
import { logger } from "../lib/logger";

export default function SignupPage() {
	const { user, loading, signUp } = useAuth();
	const notification = useNotification();

	const [email, setEmail] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

	const canSubmit = useMemo(() => {
		if (loading || submitting) return false;
		return email.trim().length > 0;
	}, [email, loading, submitting]);

	if (user && !loading) return <Navigate to="/app/home" replace />;

	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			await signUp(email.trim());
			setSent(true);
			notification.success(
				"Check your email",
				"If this email can be used, a secure signup link was sent.",
			);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "We couldn't send your signup link right now.";
			setError(msg);
			logger.error("Signup link request failed", "SignupPage", { error: err });
			notification.error("Signup failed", msg);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
			<div className="mb-8">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
					<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
					{sent ? "Check your email" : "Create account"}
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					{sent ? "Almost there" : "Get started"}
				</h1>
				{!sent ? (
					<p className="mt-2 text-sm leading-relaxed [color:var(--text-muted)]">
						Create your account to access the workspace.
					</p>
				) : null}
			</div>

			{sent ? (
				<div className="grid gap-4">
					<div className="rounded-lg border px-3 py-2.5 text-sm leading-relaxed [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]">
						If this email can be used, we sent a secure link to finish setup.
						Open the email link on this device and you'll be redirected into
						your workspace.
					</div>

					<Link
						to="/login"
						className="auth-submit-btn text-center no-underline"
					>
						Go to sign in
					</Link>

					<button
						type="button"
						className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						onClick={() => setSent(false)}
					>
						Send another link
					</button>

					<AuthEnvDebugCard />
				</div>
			) : (
				<form className="grid gap-4" onSubmit={onSubmit} noValidate>
					<div className="grid gap-1.5">
						<label className="text-sm font-medium" htmlFor="email">
							Email
						</label>
						<input
							id="email"
							className="auth-input-field"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@company.com"
							required
						/>
					</div>

					{error ? (
						<div className="rounded-lg border px-3 py-2 text-sm [border-color:color-mix(in_oklab,var(--danger)_45%,var(--border))] [background:color-mix(in_oklab,var(--danger)_8%,var(--surface))] [color:var(--danger)]">
							{error}
						</div>
					) : null}

					<button
						className="auth-submit-btn mt-1"
						type="submit"
						disabled={!canSubmit}
					>
						{submitting ? (
							<span className="inline-flex items-center gap-2">
								<span className="auth-spinner" />
								Sending link...
							</span>
						) : (
							"Send get-started link"
						)}
					</button>

					<div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-sm [color:var(--text-muted)]">
						<span>
							Already have an account?{" "}
							<Link
								to="/login"
								className="font-medium underline-offset-2 hover:underline [color:var(--primary)]"
							>
								Sign in
							</Link>
						</span>
						<Link
							to="/privacy"
							className="font-medium underline-offset-2 hover:underline [color:var(--text-muted)] hover:[color:var(--text)]"
						>
							Privacy
						</Link>
					</div>

					<AuthEnvDebugCard />
				</form>
			)}
		</AuthShell>
	);
}

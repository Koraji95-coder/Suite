import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthEnvDebugCard from "../auth/AuthEnvDebugCard";
import CaptchaChallenge from "../auth/CaptchaChallenge";
import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import { useAuth } from "../auth/useAuth";
import { logger } from "../lib/logger";
import { logAuthMethodTelemetry } from "../services/securityEventService";

export default function SignupPage() {
	const { user, loading, signUp } = useAuth();
	const notification = useNotification();

	const [email, setEmail] = useState("");
	const [captchaToken, setCaptchaToken] = useState("");
	const [honeypot, setHoneypot] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);
	const requiresCaptcha = Boolean(
		(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim(),
	);
	const honeypotFieldName =
		(import.meta.env.VITE_AUTH_HONEYPOT_FIELD || "company").trim() || "company";

	const canSubmit = useMemo(() => {
		if (loading || submitting) return false;
		if (email.trim().length === 0) return false;
		if (requiresCaptcha) return captchaToken.trim().length > 0;
		return true;
	}, [email, loading, submitting, requiresCaptcha, captchaToken]);

	if (user && !loading) return <Navigate to="/app/home" replace />;

	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			await signUp(email.trim(), { captchaToken, honeypot });
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
			setCaptchaToken("");
			logger.error("Signup link request failed", "SignupPage", { error: err });
			await logAuthMethodTelemetry(
				"email_link",
				"sign_up_request_failed",
				`Sign-up email-link request failed: ${msg}`,
			);
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

					<div
						aria-hidden="true"
						style={{
							position: "absolute",
							left: "-10000px",
							top: "auto",
							width: 1,
							height: 1,
							overflow: "hidden",
						}}
					>
						<label htmlFor={`hp-${honeypotFieldName}`}>Company</label>
						<input
							id={`hp-${honeypotFieldName}`}
							name={honeypotFieldName}
							type="text"
							autoComplete="off"
							tabIndex={-1}
							value={honeypot}
							onChange={(event) => setHoneypot(event.target.value)}
						/>
					</div>

					<CaptchaChallenge
						token={captchaToken}
						onTokenChange={setCaptchaToken}
						disabled={submitting}
					/>

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

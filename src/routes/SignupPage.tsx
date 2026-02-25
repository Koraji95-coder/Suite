// src/routes/SignupPage.tsx
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import { useAuth } from "../auth/useAuth";
import { logger } from "../lib/logger";

export default function SignupPage() {
	const { user, loading, signUp } = useAuth();
	const notification = useNotification();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

	const canSubmit = useMemo(() => {
		if (loading || submitting) return false;
		return email.trim().length > 0 && password.length >= 8;
	}, [email, password, loading, submitting]);

	if (user && !loading) return <Navigate to="/app/home" replace />;

	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			await signUp(email.trim(), password);
			setSent(true);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Signup failed";
			const normalized = msg.toLowerCase();
			const likelyExistingUser =
				normalized.includes("already registered") ||
				normalized.includes("already exists") ||
				normalized.includes("user already") ||
				normalized.includes("email address is already") ||
				normalized.includes("already been registered");

			if (likelyExistingUser) {
				setSent(true);
			} else {
				setError(
					"We couldn't create your account right now. Please try again.",
				);
				logger.error("Signup failed", "SignupPage", { email, error: err });
				notification.error(
					"Signup failed",
					"We couldn't create your account right now. Please try again.",
				);
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
			<div className="auth-head">
				<div className="hero-badge" style={{ marginBottom: 18 }}>
					<span className="badge-dot" />
					{sent ? "Check your email" : "Create account"}
				</div>
				<h1 className="auth-title">{sent ? "Almost there" : "Get started"}</h1>
				{!sent ? (
					<p className="auth-sub">
						Create your account. Use a password with at least 8 characters.
					</p>
				) : null}
			</div>

			{sent ? (
				<div className="auth-form">
					<div className="auth-message is-warning">
						If this email is available, we sent a confirmation link. If you
						already have an account, sign in or reset your password.
					</div>

					<Link
						to="/login"
						className="btn-hero-primary auth-submit"
						style={{ textAlign: "center" }}
					>
						Go to sign in
					</Link>

					<Link
						to="/forgot-password"
						className="auth-link"
						style={{ textAlign: "center" }}
					>
						Forgot password?
					</Link>
				</div>
			) : (
				<form className="auth-form" onSubmit={onSubmit} noValidate>
					<label className="auth-label" htmlFor="email">
						Email
					</label>
					<input
						id="email"
						className="auth-input"
						type="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="you@company.com"
						required
					/>

					<label className="auth-label" htmlFor="password">
						Password
					</label>
					<input
						id="password"
						className="auth-input"
						type="password"
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="••••••••••"
						required
					/>

					{error ? <div className="auth-error">{error}</div> : null}

					<button
						className="btn-primary auth-submit"
						type="submit"
						disabled={!canSubmit}
					>
						{submitting ? "Creating…" : "Create account"}
					</button>

					<div className="auth-foot">
						<span className="muted">
							Already have an account?{" "}
							<Link to="/login" className="auth-link">
								Sign in
							</Link>
						</span>
						<Link to="/privacy" className="auth-link">
							Privacy
						</Link>
					</div>
				</form>
			)}
		</AuthShell>
	);
}

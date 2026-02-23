// src/routes/ForgotPasswordPage.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { useNotification } from "../auth/NotificationContext";
import { logger } from "../lib/logger";

	const [email, setEmail] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);
	const notification = useNotification();

	const canSubmit = useMemo(() => email.trim().length > 0 && !submitting, [email, submitting]);

	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			const redirectTo = `${window.location.origin}/login`;
			const { error: supaErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
				redirectTo,
			});
			if (supaErr) throw supaErr;
			setSent(true);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Failed to send reset email";
			setError(msg);
			logger.error("Password reset failed", "ForgotPasswordPage", { email, error: err });
			notification.error("Password reset failed", msg);
		} finally {
			setSubmitting(false);
		}
	};

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
					<Link to="/login" className="btn-ghost">
						Back to login
					</Link>
				</div>
			</nav>

			<main className="auth-main">
				<div className="auth-card glass">
					<div className="auth-head">
						<div className="hero-badge" style={{ marginBottom: 18 }}>
							<span className="badge-dot" />
							Password reset
						</div>
						<h1 className="auth-title">Reset your password</h1>
						<p className="auth-sub">
							We’ll email you a link to reset your password.
						</p>
					</div>

					{sent ? (
						<div className="auth-form">
							<div className="auth-error" style={{ borderColor: "rgba(232,201,126,0.28)", background: "rgba(232,201,126,0.08)" }}>
								If an account exists for <strong>{email.trim()}</strong>, a reset link was sent.
							</div>
							<Link to="/login" className="btn-primary auth-submit" style={{ textAlign: "center" }}>
								Return to login
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

							{error ? <div className="auth-error">{error}</div> : null}

							<button className="btn-primary auth-submit" type="submit" disabled={!canSubmit}>
								{submitting ? "Sending…" : "Send reset link"}
							</button>

							<div className="auth-foot">
								<Link to="/privacy" className="auth-link">
									Privacy
								</Link>
								<Link to="/signup" className="auth-link">
									Create account
								</Link>
							</div>
						</form>
					)}
				</div>
			</main>
		</div>
	);
// ...existing code...
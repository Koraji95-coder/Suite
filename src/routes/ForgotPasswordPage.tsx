// src/routes/ForgotPasswordPage.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";
import { isSupabaseConfigured } from "../lib/supabaseUtils";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

	const notification = useNotification();

	const canSubmit = useMemo(() => {
		if (submitting) return false;
		return email.trim().length > 0;
	}, [email, submitting]);

	return (
		<AuthShell navLink={{ to: "/login", label: "Back to login" }}>
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
					<div className="auth-message is-warning">
						If an account exists for <strong>{email.trim()}</strong>, a reset
						link was sent.
					</div>

					<Link
						to="/login"
						className="btn-hero-primary auth-submit"
						style={{ textAlign: "center" }}
					>
						Return to login
					</Link>
				</div>
			) : (
				<form
					className="auth-form"
					noValidate
					onSubmit={async (e) => {
						e.preventDefault();
						if (!canSubmit) return;

						if (!isSupabaseConfigured()) {
							const msg =
								"Supabase is not configured. Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.";
							setError(msg);
							notification.error("Password reset unavailable", msg);
							return;
						}

						setError("");
						setSubmitting(true);

						try {
							const redirectTo = `${window.location.origin}/reset-password`;

							const { error: supaErr } =
								await supabase.auth.resetPasswordForEmail(email.trim(), {
									redirectTo,
								});
							if (supaErr) throw supaErr;

							setSent(true);
							notification.success(
								"Check your email",
								"If an account exists, a reset link was sent.",
							);
						} catch (err) {
							const msg =
								err instanceof Error
									? err.message
									: "Failed to send reset email";
							setError(msg);
							logger.error("ForgotPasswordPage", "Password reset failed", {
								email,
								error: err,
							});
							notification.error("Password reset failed", msg);
						} finally {
							setSubmitting(false);
						}
					}}
				>
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

					<button
						className="btn-hero-primary auth-submit"
						type="submit"
						disabled={!canSubmit}
					>
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
		</AuthShell>
	);
}

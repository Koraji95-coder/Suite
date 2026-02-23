// src/routes/SignupPage.tsx
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { useNotification } from "../auth/NotificationContext";
import { logger } from "../lib/logger";

	const { user, loading, signUp } = useAuth();
	const notification = useNotification();
	const navigate = useNavigate();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

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
			// Supabase may require email confirmation; still send them to login for clarity.
			navigate("/login", { replace: true });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Signup failed";
			setError(msg);
			logger.error("Signup failed", "SignupPage", { email, error: err });
			notification.error("Signup failed", msg);
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
					<Link to="/" className="btn-ghost">
						Back to landing
					</Link>
				</div>
			</nav>

			<main className="auth-main">
				<div className="auth-card glass">
					<div className="auth-head">
						<div className="hero-badge" style={{ marginBottom: 18 }}>
							<span className="badge-dot" />
							Create account
						</div>
						<h1 className="auth-title">Get started</h1>
						<p className="auth-sub">
							Create your account. Use a password with at least 8 characters.
						</p>
					</div>

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

						<button className="btn-primary auth-submit" type="submit" disabled={!canSubmit}>
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
				</div>
			</main>
		</div>
	);
}
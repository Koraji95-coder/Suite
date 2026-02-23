// src/routes/LoginPage.tsx
import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import AuthGradientBackground from "../auth/AuthGradientBackground";
import { useNotification } from "../auth/NotificationContext";
import { logger } from "../lib/logger";

type LocationState = { from?: string };

	const { user, loading, signIn } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const from = (location.state as LocationState | null)?.from ?? "/app/home";

	const notification = useNotification();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	const canSubmit = useMemo(() => {
		if (loading || submitting) return false;
		return email.trim().length > 0 && password.length > 0;
	}, [email, password, loading, submitting]);

	if (user && !loading) return <Navigate to="/app/home" replace />;

	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			await signIn(email.trim(), password);
			navigate(from, { replace: true });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Login failed";
			setError(msg);
			logger.error("Login failed", "LoginPage", { email, error: err });
			notification.error("Login failed", msg);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="auth-page" style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
			<AuthGradientBackground />
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
							Secure login
						</div>
						<h1 className="auth-title">Welcome back</h1>
						<p className="auth-sub">Sign in to continue to your dashboard.</p>
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
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••••"
							required
						/>

						{error ? <div className="auth-error">{error}</div> : null}

						<button className="btn-primary auth-submit" type="submit" disabled={!canSubmit}>
							{submitting ? "Signing in…" : "Sign in"}
						</button>

						<div className="auth-foot">
							<span className="muted">
								No account yet?{" "}
								<Link to="/signup" className="auth-link">
									Create one
								</Link>
							</span>
							<Link to="/forgot-password" className="auth-link">
								Forgot password?
							</Link>
						</div>
					</form>
				</div>
			</main>
		</div>
	);
// ...existing code...
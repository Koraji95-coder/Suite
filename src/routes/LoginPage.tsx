// src/routes/LoginPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import { useAuth } from "../auth/useAuth";
import { logger } from "../lib/logger";

type LocationState = { from?: string };

export default function LoginPage() {
	const { user, loading, signIn } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const from = (location.state as LocationState | null)?.from ?? "/app/home";

	const notification = useNotification();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [redirectProgress, setRedirectProgress] = useState(0);

	const canSubmit = useMemo(() => {
		if (loading || submitting) return false;
		return email.trim().length > 0 && password.length > 0;
	}, [email, password, loading, submitting]);

	useEffect(() => {
		if (!(user && !loading)) {
			setRedirectProgress(0);
			return;
		}

		const durationMs = 1100;
		const start = performance.now();
		let rafId: number | null = null;

		const tick = (now: number) => {
			const elapsed = now - start;
			const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
			setRedirectProgress(pct);
			if (elapsed >= durationMs) {
				navigate(from, { replace: true });
				return;
			}
			rafId = window.requestAnimationFrame(tick);
		};

		rafId = window.requestAnimationFrame(tick);

		return () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
			}
		};
	}, [from, loading, navigate, user]);

	const showSessionCard = loading || Boolean(user);

	if (showSessionCard) {
		const redirecting = Boolean(user && !loading);
		return (
			<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
				<div className="auth-head">
					<div className="hero-badge" style={{ marginBottom: 18 }}>
						<span className="badge-dot" />
						{redirecting ? "Redirecting" : "Preparing your session"}
					</div>
					<h1 className="auth-title">
						{redirecting ? "Opening your dashboard" : "Checking your account"}
					</h1>
					<p className="auth-sub">
						{redirecting
							? "Email confirmed. We’re signing you in now."
							: "Validating your sign-in status…"}
					</p>
				</div>

				<div className="auth-form" style={{ gap: 12 }}>
					<div className="auth-progress-track" aria-hidden="true">
						<div
							className={`auth-progress-fill ${redirecting ? "" : "is-indeterminate"}`}
							style={
								redirecting
									? { width: `${Math.max(8, redirectProgress)}%` }
									: undefined
							}
						/>
					</div>
					<p className="auth-sub" style={{ margin: 0, fontSize: 13 }}>
						{redirecting ? `${Math.max(8, redirectProgress)}%` : "Connecting…"}
					</p>
				</div>
			</AuthShell>
		);
	}

	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			await signIn(email.trim(), password);
			navigate(from, { replace: true });
		} catch (err: unknown) {
			const rawMsg = err instanceof Error ? err.message : "Login failed";
			const normalized = rawMsg.toLowerCase();
			const msg = normalized.includes("invalid login credentials")
				? "Email or password is incorrect."
				: normalized.includes("email not confirmed")
					? "Please confirm your email before signing in."
					: "Unable to sign in right now. Please try again.";

			setError(msg);
			logger.error("Login failed", "LoginPage", { email, error: err });
			notification.error("Login failed", msg);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
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

				<button
					className="btn-primary auth-submit"
					type="submit"
					disabled={!canSubmit}
				>
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

				<button
					type="button"
					className="auth-submit"
					style={{
						marginTop: 12,
						background: "rgba(255,255,255,0.06)",
						border: "1px dashed rgba(255,255,255,0.15)",
						color: "rgba(255,255,255,0.5)",
						fontSize: 13,
					}}
					onClick={() => {
						sessionStorage.setItem("dev_bypass_auth", "1");
						navigate("/app/home", { replace: true });
					}}
				>
					Dev Preview (skip auth)
				</button>
			</form>
		</AuthShell>
	);
}

// src/routes/LoginPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthEnvDebugCard from "../auth/AuthEnvDebugCard";
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
				<div className="mb-6">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
						<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
						{redirecting ? "Redirecting" : "Preparing your session"}
					</div>
					<h1 className="text-2xl font-semibold tracking-tight">
						{redirecting ? "Opening your dashboard" : "Checking your account"}
					</h1>
					<p className="mt-2 text-sm [color:var(--text-muted)]">
						{redirecting
							? "Email confirmed. We’re signing you in now."
							: "Validating your sign-in status…"}
					</p>
				</div>

				<div className="grid gap-3">
					<div
						className="h-2 w-full overflow-hidden rounded-full [background:var(--surface-2)]"
						aria-hidden="true"
					>
						<div
							className={`h-full rounded-full [background:var(--primary)] ${redirecting ? "" : "w-[35%] animate-[loading-slide_1.2s_ease-in-out_infinite]"}`}
							style={
								redirecting
									? { width: `${Math.max(8, redirectProgress)}%` }
									: undefined
							}
						/>
					</div>
					<p className="m-0 text-xs [color:var(--text-muted)]">
						{redirecting ? `${Math.max(8, redirectProgress)}%` : "Connecting…"}
					</p>
					<AuthEnvDebugCard />
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
			<div className="mb-6">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
					<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
					Secure login
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
				<p className="mt-2 text-sm [color:var(--text-muted)]">
					Sign in to continue to your dashboard.
				</p>
			</div>

			<form className="grid gap-3" onSubmit={onSubmit} noValidate>
				<label className="text-sm font-medium" htmlFor="email">
					Email
				</label>
				<input
					id="email"
					className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition [border-color:var(--border)] [background:var(--surface)] [color:var(--text)] focus:[border-color:var(--primary)]"
					type="email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="you@company.com"
					required
				/>

				<label className="text-sm font-medium" htmlFor="password">
					Password
				</label>
				<input
					id="password"
					className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition [border-color:var(--border)] [background:var(--surface)] [color:var(--text)] focus:[border-color:var(--primary)]"
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="••••••••••"
					required
				/>

				{error ? (
					<div className="rounded-lg border px-3 py-2 text-sm [border-color:color-mix(in_oklab,var(--danger)_45%,var(--border))] [background:color-mix(in_oklab,var(--danger)_8%,var(--surface))] [color:var(--danger)]">
						{error}
					</div>
				) : null}

				<button
					className="mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
					type="submit"
					disabled={!canSubmit}
				>
					{submitting ? "Signing in…" : "Sign in"}
				</button>

				<div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm [color:var(--text-muted)]">
					<span>
						No account yet?{" "}
						<Link
							to="/signup"
							className="font-medium underline-offset-2 hover:underline [color:var(--text)]"
						>
							Create one
						</Link>
					</span>
					<Link
						to="/forgot-password"
						className="font-medium underline-offset-2 hover:underline [color:var(--text)]"
					>
						Forgot password?
					</Link>
				</div>

				<AuthEnvDebugCard />
			</form>
		</AuthShell>
	);
}

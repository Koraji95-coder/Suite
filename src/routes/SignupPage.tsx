// src/routes/SignupPage.tsx
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
			<div className="mb-6">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
					<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
					{sent ? "Check your email" : "Create account"}
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					{sent ? "Almost there" : "Get started"}
				</h1>
				{!sent ? (
					<p className="mt-2 text-sm [color:var(--text-muted)]">
						Create your account. Use a password with at least 8 characters.
					</p>
				) : null}
			</div>

			{sent ? (
				<div className="grid gap-3">
					<div className="rounded-lg border px-3 py-2 text-sm [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]">
						If this email is available, we sent a confirmation link. If you
						already have an account, sign in or reset your password.
					</div>

					<Link
						to="/login"
						className="mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
						style={{ textAlign: "center" }}
					>
						Go to sign in
					</Link>

					<Link
						to="/forgot-password"
						className="text-center text-sm font-medium underline-offset-2 hover:underline [color:var(--text)]"
						style={{ textAlign: "center" }}
					>
						Forgot password?
					</Link>

					<AuthEnvDebugCard />
				</div>
			) : (
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
						autoComplete="new-password"
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
						{submitting ? "Creating…" : "Create account"}
					</button>

					<div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm [color:var(--text-muted)]">
						<span>
							Already have an account?{" "}
							<Link
								to="/login"
								className="font-medium underline-offset-2 hover:underline [color:var(--text)]"
							>
								Sign in
							</Link>
						</span>
						<Link
							to="/privacy"
							className="font-medium underline-offset-2 hover:underline [color:var(--text)]"
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

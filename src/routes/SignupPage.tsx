import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthEnvDebugCard from "../auth/AuthEnvDebugCard";
import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import { useAuth } from "../auth/useAuth";
import { logger } from "../lib/logger";

function getPasswordStrength(pw: string): { level: number; label: string } {
	if (pw.length === 0) return { level: 0, label: "" };
	let score = 0;
	if (pw.length >= 8) score++;
	if (pw.length >= 12) score++;
	if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
	if (/\d/.test(pw)) score++;
	if (/[^A-Za-z0-9]/.test(pw)) score++;

	if (score <= 1) return { level: 1, label: "Weak" };
	if (score <= 2) return { level: 2, label: "Fair" };
	if (score <= 3) return { level: 3, label: "Good" };
	return { level: 4, label: "Strong" };
}

const STRENGTH_COLORS: Record<number, string> = {
	1: "var(--danger)",
	2: "var(--warning)",
	3: "var(--primary)",
	4: "var(--success)",
};

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

	const strength = useMemo(() => getPasswordStrength(password), [password]);

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
						If this email is available, we sent a confirmation link. If you
						already have an account, sign in or reset your password.
					</div>

					<Link
						to="/login"
						className="auth-submit-btn text-center no-underline"
					>
						Go to sign in
					</Link>

					<Link
						to="/forgot-password"
						className="text-center text-sm font-medium underline-offset-2 hover:underline [color:var(--text-muted)] hover:[color:var(--text)]"
					>
						Forgot password?
					</Link>

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

					<div className="grid gap-1.5">
						<label className="text-sm font-medium" htmlFor="password">
							Password
						</label>
						<input
							id="password"
							className="auth-input-field"
							type="password"
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Min. 8 characters"
							required
						/>
						{password.length > 0 && (
							<div className="mt-1 grid gap-1.5">
								<div className="flex gap-1">
									{[1, 2, 3, 4].map((i) => (
										<div
											key={i}
											className="h-1 flex-1 rounded-full transition-all duration-300"
											style={{
												background:
													i <= strength.level
														? STRENGTH_COLORS[strength.level]
														: "var(--surface-2)",
											}}
										/>
									))}
								</div>
								<p
									className="text-xs font-medium"
									style={{ color: STRENGTH_COLORS[strength.level] ?? "var(--text-muted)" }}
								>
									{strength.label}
									{password.length > 0 && password.length < 8 && (
										<span className="font-normal [color:var(--text-muted)]">
											{" "}&mdash; must be at least 8 characters
										</span>
									)}
								</p>
							</div>
						)}
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
								Creating...
							</span>
						) : (
							"Create account"
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

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AuthShell from "../auth/AuthShell";
import { resolveAuthRedirect } from "../auth/authRedirect";
import { useNotification } from "../auth/NotificationContext";
import { logger } from "../lib/logger";
import { supabase } from "@/supabase/client";
import { isSupabaseConfigured } from "@/supabase/utils";

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
			<div className="mb-8">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
					<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
					Password reset
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Reset your password
				</h1>
				<p className="mt-2 text-sm leading-relaxed [color:var(--text-muted)]">
					Enter your email and we'll send you a link to reset your password.
				</p>
			</div>

			{sent ? (
				<div className="grid gap-4">
					<div className="rounded-lg border px-3 py-2.5 text-sm leading-relaxed [border-color:color-mix(in_oklab,var(--success)_30%,var(--border))] [background:color-mix(in_oklab,var(--success)_6%,var(--surface))] [color:var(--text-muted)]">
						If an account exists for <strong className="[color:var(--text)]">{email.trim()}</strong>, a reset
						link was sent. Check your inbox.
					</div>

					<Link
						to="/login"
						className="auth-submit-btn text-center no-underline"
					>
						Return to login
					</Link>
				</div>
			) : (
				<form
					className="grid gap-4"
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
							const redirectTo = resolveAuthRedirect("/reset-password");

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
								Sending...
							</span>
						) : (
							"Send reset link"
						)}
					</button>

					<div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-sm [color:var(--text-muted)]">
						<Link
							to="/signup"
							className="font-medium underline-offset-2 hover:underline [color:var(--primary)]"
						>
							Create account
						</Link>
						<Link
							to="/privacy"
							className="font-medium underline-offset-2 hover:underline [color:var(--text-muted)] hover:[color:var(--text)]"
						>
							Privacy
						</Link>
					</div>
				</form>
			)}
		</AuthShell>
	);
}

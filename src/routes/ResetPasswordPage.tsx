import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import { logger } from "../lib/logger";
import { supabase } from "@/supabase/client";
import { isSupabaseConfigured } from "@/supabase/utils";

export default function ResetPasswordPage() {
	const navigate = useNavigate();
	const notification = useNotification();

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [checkingSession, setCheckingSession] = useState(true);
	const [hasRecoverySession, setHasRecoverySession] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);

	useEffect(() => {
		const checkRecoverySession = async () => {
			if (!isSupabaseConfigured()) {
				setError(
					"Supabase is not configured. Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.",
				);
				setCheckingSession(false);
				return;
			}

			try {
				const {
					data: { session },
					error: sessionError,
				} = await supabase.auth.getSession();

				if (sessionError) throw sessionError;

				setHasRecoverySession(Boolean(session?.user));
				if (!session?.user) {
					setError(
						"This reset link is invalid or expired. Request a new password reset email.",
					);
				}
			} catch (err) {
				const msg =
					err instanceof Error
						? err.message
						: "Failed to validate reset session";
				setError(msg);
				logger.error("ResetPasswordPage", "Recovery session check failed", {
					error: err,
				});
			} finally {
				setCheckingSession(false);
			}
		};

		void checkRecoverySession();
	}, []);

	const canSubmit = useMemo(() => {
		if (submitting || checkingSession || !hasRecoverySession) return false;
		if (password.length < 8) return false;
		return confirmPassword.length > 0 && password === confirmPassword;
	}, [
		password,
		confirmPassword,
		submitting,
		checkingSession,
		hasRecoverySession,
	]);

	const submitReset = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);

		try {
			const { error: updateError } = await supabase.auth.updateUser({
				password,
			});
			if (updateError) throw updateError;

			setSuccess(true);
			notification.success(
				"Password updated",
				"Your password has been changed. Please sign in with your new password.",
			);

			await supabase.auth.signOut();
			setTimeout(() => navigate("/login", { replace: true }), 900);
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to update password";
			setError(msg);
			logger.error("ResetPasswordPage", "Password update failed", {
				error: err,
			});
			notification.error("Password reset failed", msg);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<AuthShell navLink={{ to: "/login", label: "Back to login" }}>
			<div className="mb-6">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
					<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
					Set new password
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Create a new password
				</h1>
				<p className="mt-2 text-sm [color:var(--text-muted)]">
					Choose a strong password with at least 8 characters.
				</p>
			</div>

			{checkingSession ? (
				<div className="grid gap-3">
					<div className="rounded-lg border px-3 py-2 text-sm [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]">
						Validating reset link…
					</div>
				</div>
			) : success ? (
				<div className="grid gap-3">
					<div className="rounded-lg border px-3 py-2 text-sm [border-color:color-mix(in_oklab,var(--success)_45%,var(--border))] [background:var(--surface-2)] [color:var(--success)]">
						Password updated successfully. Redirecting to login…
					</div>
				</div>
			) : (
				<form className="grid gap-3" noValidate onSubmit={submitReset}>
					<label className="text-sm font-medium" htmlFor="password">
						New password
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

					<label className="text-sm font-medium" htmlFor="confirmPassword">
						Confirm new password
					</label>
					<input
						id="confirmPassword"
						className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition [border-color:var(--border)] [background:var(--surface)] [color:var(--text)] focus:[border-color:var(--primary)]"
						type="password"
						autoComplete="new-password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						placeholder="••••••••••"
						required
					/>

					{password.length > 0 && password.length < 8 ? (
						<div className="rounded-lg border px-3 py-2 text-sm [border-color:color-mix(in_oklab,var(--danger)_45%,var(--border))] [background:color-mix(in_oklab,var(--danger)_8%,var(--surface))] [color:var(--danger)]">
							Password must be at least 8 characters.
						</div>
					) : null}

					{confirmPassword.length > 0 && password !== confirmPassword ? (
						<div className="rounded-lg border px-3 py-2 text-sm [border-color:color-mix(in_oklab,var(--danger)_45%,var(--border))] [background:color-mix(in_oklab,var(--danger)_8%,var(--surface))] [color:var(--danger)]">
							Passwords do not match.
						</div>
					) : null}

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
						{submitting ? "Updating…" : "Update password"}
					</button>

					<div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm [color:var(--text-muted)]">
						<Link
							to="/forgot-password"
							className="font-medium underline-offset-2 hover:underline [color:var(--text)]"
						>
							Request a new reset link
						</Link>
						<Link
							to="/privacy"
							className="font-medium underline-offset-2 hover:underline [color:var(--text)]"
						>
							Privacy
						</Link>
					</div>
				</form>
			)}
		</AuthShell>
	);
}

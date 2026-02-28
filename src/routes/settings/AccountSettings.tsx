// src/routes/app/settings/AccountSettings.tsx
import { Lock, LogOut, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../../auth/useAuth";
import { agentService } from "../../services/agentService";
import { logSecurityEvent } from "../../services/securityEventService";
import { supabase } from "@/supabase/client";

export default function AccountSettings() {
	const { user, signOut } = useAuth();

	const [newPassword, setNewPassword] = useState("");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string>("");
	const [isSigningOutAll, setIsSigningOutAll] = useState(false);
	const [isResettingAgent, setIsResettingAgent] = useState(false);

	const canUpdatePassword = useMemo(
		() => newPassword.length >= 8 && !saving,
		[newPassword, saving],
	);

	const updatePassword = async () => {
		if (!canUpdatePassword) return;
		setSaving(true);
		setMessage("");

		try {
			const { error } = await supabase.auth.updateUser({
				password: newPassword,
			});
			if (error) throw error;
			setNewPassword("");
			setMessage("Password updated.");
			await logSecurityEvent(
				"auth_password_update_success",
				"User updated account password successfully.",
			);
		} catch (err: unknown) {
			setMessage(
				err instanceof Error ? err.message : "Failed to update password.",
			);
			await logSecurityEvent(
				"auth_password_update_failed",
				"Password update attempt failed.",
			);
		} finally {
			setSaving(false);
		}
	};

	const signOutAllSessions = async () => {
		if (isSigningOutAll) return;
		setIsSigningOutAll(true);
		setMessage("");

		try {
			await agentService.unpair();
			const { error } = await supabase.auth.signOut({ scope: "global" });
			if (error) throw error;
			await logSecurityEvent(
				"auth_sign_out_global",
				"User signed out all active sessions.",
			);
			setMessage("Signed out all sessions.");
		} catch (err: unknown) {
			setMessage(
				err instanceof Error ? err.message : "Failed to sign out all sessions.",
			);
		} finally {
			setIsSigningOutAll(false);
		}
	};

	const resetTrustedAgentDevice = async () => {
		if (isResettingAgent) return;
		setIsResettingAgent(true);
		setMessage("");

		try {
			await agentService.unpair();
			setMessage("Trusted agent pairing removed for this device.");
		} catch (err: unknown) {
			setMessage(
				err instanceof Error
					? err.message
					: "Failed to reset trusted agent pairing.",
			);
		} finally {
			setIsResettingAgent(false);
		}
	};

	return (
		<div className="grid gap-3">
			<h3 className="text-lg font-semibold tracking-tight [color:var(--text)]">
				Account
				<span className="ml-2 text-sm font-normal [color:var(--text-muted)]">
					Security and account actions.
				</span>
			</h3>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
				<div className="flex items-start gap-2">
					<Lock size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Change password
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							Minimum 8 characters.
						</div>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<input
						className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						type="password"
						placeholder="New password"
						autoComplete="new-password"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
					/>
					<button
						className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 [background:var(--primary)] [color:var(--primary-contrast)]"
						type="button"
						disabled={!canUpdatePassword}
						onClick={() => void updatePassword()}
					>
						{saving ? "Saving…" : "Update"}
					</button>
				</div>

				{message ? (
					<div className="text-xs [color:var(--text-muted)]">{message}</div>
				) : null}
			</div>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
				<div className="flex items-start gap-2">
					<LogOut size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Sign out
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							End your current session.
						</div>
					</div>
				</div>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					type="button"
					onClick={() => void signOut()}
				>
					Sign out
				</button>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					type="button"
					disabled={isSigningOutAll}
					onClick={() => void signOutAllSessions()}
				>
					{isSigningOutAll ? "Signing out all…" : "Sign out all devices"}
				</button>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					type="button"
					disabled={isResettingAgent}
					onClick={() => void resetTrustedAgentDevice()}
				>
					{isResettingAgent
						? "Resetting agent trust…"
						: "Reset trusted agent pairing"}
				</button>

				<div className="text-xs [color:var(--text-muted)]">
					Last sign-in: {user?.last_sign_in_at ?? "unknown"}
				</div>
			</div>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_10%,var(--surface))]">
				<div className="flex items-start gap-2">
					<Trash2 size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Delete account
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							This usually requires a server-side action. We’ll wire it when
							your backend policy is ready.
						</div>
					</div>
				</div>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_18%,transparent)] [color:var(--danger)]"
					type="button"
					disabled
					title="Requires server-side endpoint / admin policy"
				>
					Delete account (coming soon)
				</button>

				<div className="text-xs [color:var(--text-muted)]">
					Signed in as: <strong>{user?.email ?? "unknown"}</strong>
				</div>
			</div>
		</div>
	);
}

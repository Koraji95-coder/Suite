// src/routes/app/settings/AccountSettings.tsx
import { Lock, LogOut, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../../auth/useAuth";
import { supabase } from "../../lib/supabase";

export default function AccountSettings() {
	const { user, signOut } = useAuth();

	const [newPassword, setNewPassword] = useState("");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string>("");

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
		} catch (err: unknown) {
			setMessage(
				err instanceof Error ? err.message : "Failed to update password.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="settings-panel">
			<h3 className="settings-h3">
				Account
				<span className="settings-h3-sub">Security and account actions.</span>
			</h3>

			<div className="glass settings-card">
				<div className="settings-card-head">
					<Lock size={16} />
					<div>
						<div className="settings-card-title">Change password</div>
						<div className="settings-card-sub">Minimum 8 characters.</div>
					</div>
				</div>

				<div className="settings-row">
					<input
						className="auth-input"
						type="password"
						placeholder="New password"
						autoComplete="new-password"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
					/>
					<button
						className="btn-primary"
						type="button"
						disabled={!canUpdatePassword}
						onClick={() => void updatePassword()}
					>
						{saving ? "Saving…" : "Update"}
					</button>
				</div>

				{message ? <div className="settings-note">{message}</div> : null}
			</div>

			<div className="glass settings-card">
				<div className="settings-card-head">
					<LogOut size={16} />
					<div>
						<div className="settings-card-title">Sign out</div>
						<div className="settings-card-sub">End your current session.</div>
					</div>
				</div>

				<button
					className="btn-hero-secondary"
					type="button"
					onClick={() => void signOut()}
				>
					Sign out
				</button>
			</div>

			<div className="glass settings-card danger">
				<div className="settings-card-head">
					<Trash2 size={16} />
					<div>
						<div className="settings-card-title">Delete account</div>
						<div className="settings-card-sub">
							This usually requires a server-side action. We’ll wire it when
							your backend policy is ready.
						</div>
					</div>
				</div>

				<button
					className="btn-danger"
					type="button"
					disabled
					title="Requires server-side endpoint / admin policy"
				>
					Delete account (coming soon)
				</button>

				<div className="settings-note">
					Signed in as: <strong>{user?.email ?? "unknown"}</strong>
				</div>
			</div>
		</div>
	);
}

// src/routes/app/settings/ProfileSettings.tsx
import { Save, User } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../../auth/useAuth";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";

export default function ProfileSettings() {
	const { profile, user } = useAuth();

	const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
	const [email, setEmail] = useState(profile?.email ?? user?.email ?? "");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");

	const canSave = useMemo(() => {
		if (!user || saving) return false;
		return displayName.trim().length > 0 && email.trim().length > 0;
	}, [user, saving, displayName, email]);

	const handleSave = async () => {
		if (!user || !canSave) return;

		setSaving(true);
		setSaved(false);
		setError("");

		const payload: Database["public"]["Tables"]["profiles"]["Insert"] = {
			id: user.id,
			display_name: displayName.trim(),
			email: email.trim(),
			updated_at: new Date().toISOString(),
		};

		try {
			const { error: upsertError } = await supabase
				.from("profiles")
				.upsert(payload);
			if (upsertError) throw upsertError;

			setSaved(true);
			window.setTimeout(() => setSaved(false), 1500);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to save profile");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="settings-panel">
			<h3 className="settings-h3">
				Profile
				<span className="settings-h3-sub">Saved to Supabase profiles.</span>
			</h3>

			<div className="glass settings-card">
				<div className="settings-card-head">
					<User size={16} />
					<div>
						<div className="settings-card-title">Profile information</div>
						<div className="settings-card-sub">
							Update your display name and email.
						</div>
					</div>
				</div>

				<div
					style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
				>
					<div>
						<label className="auth-label" htmlFor="displayName">
							Display Name
						</label>
						<input
							id="displayName"
							className="auth-input"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="Your name"
						/>
					</div>

					<div>
						<label className="auth-label" htmlFor="email">
							Email
						</label>
						<input
							id="email"
							className="auth-input"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@email.com"
							type="email"
						/>
					</div>
				</div>

				{error ? <div className="auth-error">{error}</div> : null}

				<button
					type="button"
					className="btn-hero-primary"
					disabled={!canSave}
					onClick={() => void handleSave()}
				>
					<Save size={14} />
					{saving ? "Saving…" : saved ? "Saved" : "Save profile"}
				</button>

				<div className="settings-note">
					Role: <strong>Admin</strong> (placeholder)
				</div>
			</div>
		</div>
	);
}

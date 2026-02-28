// src/routes/app/settings/ProfileSettings.tsx
import { Save, User } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../../auth/useAuth";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";

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
		<div className="grid gap-3">
			<h3 className="text-lg font-semibold tracking-tight [color:var(--text)]">
				Profile
				<span className="ml-2 text-sm font-normal [color:var(--text-muted)]">
					Saved to Supabase profiles.
				</span>
			</h3>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
				<div className="flex items-start gap-2">
					<User size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Profile information
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							Update your display name and email.
						</div>
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<div>
						<label
							className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
							htmlFor="displayName"
						>
							Display Name
						</label>
						<input
							id="displayName"
							className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="Your name"
						/>
					</div>

					<div>
						<label
							className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
							htmlFor="email"
						>
							Email
						</label>
						<input
							id="email"
							className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@email.com"
							type="email"
						/>
					</div>
				</div>

				{error ? (
					<div className="rounded-xl border px-3 py-2 text-sm [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_18%,transparent)] [color:var(--danger)]">
						{error}
					</div>
				) : null}

				<button
					type="button"
					className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 [background:var(--primary)] [color:var(--primary-contrast)]"
					disabled={!canSave}
					onClick={() => void handleSave()}
				>
					<Save size={14} />
					{saving ? "Saving…" : saved ? "Saved" : "Save profile"}
				</button>

				<div className="text-xs [color:var(--text-muted)]">
					Role: <strong>Admin</strong> (placeholder)
				</div>
			</div>
		</div>
	);
}

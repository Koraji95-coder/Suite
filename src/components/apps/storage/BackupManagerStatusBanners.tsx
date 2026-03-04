interface BackupManagerStatusBannersProps {
	status: "idle" | "running" | "done" | "error";
	restoreMsg: string | null;
}

export function BackupManagerStatusBanners({
	status,
	restoreMsg,
}: BackupManagerStatusBannersProps) {
	return (
		<>
			{status === "done" && (
				<div className="mb-3 rounded-lg border px-3.5 py-2 text-[13px] border-[color-mix(in_srgb,var(--success)_30%,transparent)] [background:color-mix(in_srgb,var(--success)_12%,transparent)] [color:var(--success)]">
					Backup saved successfully
				</div>
			)}

			{status === "error" && (
				<div className="mb-3 rounded-lg border px-3.5 py-2 text-[13px] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] [background:color-mix(in_srgb,var(--danger)_12%,transparent)] [color:var(--danger)]">
					Backup failed
				</div>
			)}

			{restoreMsg && (
				<div className="mb-3 rounded-lg border px-3.5 py-2 text-[13px] border-[color-mix(in_srgb,var(--secondary)_30%,transparent)] [background:color-mix(in_srgb,var(--secondary)_12%,transparent)] [color:var(--secondary)]">
					{restoreMsg}
				</div>
			)}
		</>
	);
}

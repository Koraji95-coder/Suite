import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface BackupManagerStatusBannersProps {
	palette: ColorScheme;
	status: "idle" | "running" | "done" | "error";
	restoreMsg: string | null;
}

export function BackupManagerStatusBanners({
	palette,
	status,
	restoreMsg,
}: BackupManagerStatusBannersProps) {
	return (
		<>
			{status === "done" ? (
				<div
					style={{
						marginBottom: 12,
						padding: "8px 14px",
						borderRadius: 8,
						fontSize: 13,
						background: hexToRgba("#22c55e", 0.12),
						border: `1px solid ${hexToRgba("#22c55e", 0.3)}`,
						color: "#4ade80",
					}}
				>
					Backup saved successfully
				</div>
			) : null}

			{status === "error" ? (
				<div
					style={{
						marginBottom: 12,
						padding: "8px 14px",
						borderRadius: 8,
						fontSize: 13,
						background: hexToRgba(palette.accent, 0.12),
						border: `1px solid ${hexToRgba(palette.accent, 0.3)}`,
						color: palette.accent,
					}}
				>
					Backup failed
				</div>
			) : null}

			{restoreMsg ? (
				<div
					style={{
						marginBottom: 12,
						padding: "8px 14px",
						borderRadius: 8,
						fontSize: 13,
						background: hexToRgba(palette.secondary, 0.12),
						border: `1px solid ${hexToRgba(palette.secondary, 0.3)}`,
						color: palette.secondary,
					}}
				>
					{restoreMsg}
				</div>
			) : null}
		</>
	);
}

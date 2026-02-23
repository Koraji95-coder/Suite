import { Clock, ExternalLink, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRecentFiles } from "@/hooks/useRecentFiles";
import { hexToRgba, useTheme } from "@/lib/palette";

export function RecentFilesWidget() {
	const { palette } = useTheme();
	const navigate = useNavigate();
	const { files, loading } = useRecentFiles(8);

	const formatTime = (iso: string) => {
		const d = new Date(iso);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return "Just now";
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return d.toLocaleDateString();
	};

	return (
		<div
			style={{
				borderRadius: 12,
				border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				background: hexToRgba(palette.surface, 0.6),
				backdropFilter: "blur(12px)",
				padding: 20,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 16,
				}}
			>
				<Clock size={16} color={palette.primary} />
				<h3
					style={{
						fontSize: 14,
						fontWeight: 600,
						color: palette.text,
						margin: 0,
					}}
				>
					Recent Files
				</h3>
			</div>

			{loading ? (
				<div
					style={{ fontSize: 12, color: palette.textMuted, padding: "12px 0" }}
				>
					Loading...
				</div>
			) : files.length === 0 ? (
				<div
					style={{ fontSize: 12, color: palette.textMuted, padding: "12px 0" }}
				>
					No recent files yet. Open files to see them here.
				</div>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{files.map((f) => (
						<button
							key={f.id}
							onClick={() => navigate(f.file_path)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								padding: "8px 10px",
								borderRadius: 8,
								border: "none",
								background: "transparent",
								cursor: "pointer",
								textAlign: "left",
								width: "100%",
								transition: "background 0.15s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = hexToRgba(
									palette.surfaceLight,
									0.5,
								);
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
						>
							<FileText
								size={14}
								color={palette.textMuted}
								style={{ flexShrink: 0 }}
							/>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										fontSize: 12,
										fontWeight: 500,
										color: palette.text,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{f.file_name}
								</div>
								{f.context && (
									<div
										style={{
											fontSize: 10,
											color: palette.textMuted,
											marginTop: 1,
										}}
									>
										{f.context}
									</div>
								)}
							</div>
							<span
								style={{
									fontSize: 10,
									color: palette.textMuted,
									flexShrink: 0,
									whiteSpace: "nowrap",
								}}
							>
								{formatTime(f.accessed_at)}
							</span>
							<ExternalLink
								size={10}
								color={palette.textMuted}
								style={{ flexShrink: 0, opacity: 0.4 }}
							/>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

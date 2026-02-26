import { Clock, ExternalLink, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRecentFiles } from "@/hooks/useRecentFiles";
import { hexToRgba, useTheme } from "@/lib/palette";
import { TieredCard } from "../ui/TieredCard";
import { bubbleStyle } from "./dashboardStyles";

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
		<TieredCard
			tier="solid"
			tint={palette.primary}
			className="p-7"
		>
			<div className="relative z-10">
				<div className="flex items-center space-x-2 mb-4">
					<div
						className="p-2 rounded-lg"
						style={{
							background: `linear-gradient(135deg, ${hexToRgba(
								palette.primary,
								0.25,
							)} 0%, ${hexToRgba(palette.primary, 0.08)} 100%)`,
							boxShadow: `0 0 16px ${hexToRgba(palette.primary, 0.12)}`,
						}}
					>
						<Clock className="w-5 h-5" style={{ color: palette.primary }} />
					</div>
					<h3 className="text-xl font-bold" style={{ color: palette.primary }}>
						Recent Files
					</h3>
				</div>

				{loading ? (
					<div
						className="text-sm"
						style={{ color: hexToRgba(palette.text, 0.45) }}
					>
						Loading...
					</div>
				) : files.length === 0 ? (
					<div
						className="text-sm"
						style={{ color: hexToRgba(palette.text, 0.45) }}
					>
						No recent files yet. Open files to see them here.
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{files.map((f) => (
							<button
								key={f.id}
								onClick={() => navigate(f.file_path)}
								className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-all duration-300 hover:-translate-y-px"
								style={bubbleStyle(palette, palette.primary)}
							>
								<FileText
									size={14}
									color={hexToRgba(palette.text, 0.45)}
									style={{ flexShrink: 0 }}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											fontSize: 12,
											fontWeight: 600,
											color: hexToRgba(palette.text, 0.9),
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
												color: hexToRgba(palette.text, 0.45),
												marginTop: 2,
											}}
										>
										{f.context}
									</div>
									)}
								</div>
								<span
									style={{
										fontSize: 10,
										color: hexToRgba(palette.text, 0.45),
										flexShrink: 0,
										whiteSpace: "nowrap",
									}}
								>
									{formatTime(f.accessed_at)}
								</span>
								<ExternalLink
									size={10}
									color={hexToRgba(palette.text, 0.4)}
									style={{ flexShrink: 0, opacity: 0.5 }}
								/>
							</button>
						))}
					</div>
				)}
			</div>
		</TieredCard>
	);
}

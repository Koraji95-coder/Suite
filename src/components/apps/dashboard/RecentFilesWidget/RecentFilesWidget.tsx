// src/components/apps/dashboard/RecentFilesWidget.tsx
import { Clock, ExternalLink, FileText, FolderOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import { useRecentFiles } from "./useRecentFiles";

function formatTimeAgo(timestamp: string) {
	const now = new Date();
	const then = new Date(timestamp);
	const diffMs = now.getTime() - then.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentFilesWidget() {
	const navigate = useNavigate();
	const { files, loading } = useRecentFiles(8);

	return (
		<Panel variant="default" padding="lg" className="h-full">
			<Stack gap={5}>
				{/* Header */}
				<HStack justify="between" align="center">
					<HStack gap={3} align="center">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning">
							<Clock size={20} />
						</div>
						<Stack gap={0}>
							<Text size="lg" weight="bold">
								Recent Files
							</Text>
							<Text size="xs" color="muted">
								Recently accessed documents
							</Text>
						</Stack>
					</HStack>

					{files.length > 0 && (
						<Badge variant="soft" size="sm">
							{files.length} file{files.length !== 1 ? "s" : ""}
						</Badge>
					)}
				</HStack>

				{/* Files list */}
				{loading ? (
					<Stack gap={2}>
						{[1, 2, 3].map((i) => (
							<div
								key={i}
								className="h-16 rounded-xl bg-surface-2 animate-pulse"
							/>
						))}
					</Stack>
				) : files.length === 0 ? (
					<Panel variant="inset" padding="lg" className="text-center">
						<Stack gap={3} align="center">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
								<FolderOpen size={24} className="text-text-muted" />
							</div>
							<Stack gap={1}>
								<Text size="sm" weight="medium">
									No recent files
								</Text>
								<Text size="xs" color="muted">
									Open files to see them here
								</Text>
							</Stack>
						</Stack>
					</Panel>
				) : (
					<Stack gap={2}>
						{files.map((file) => (
							<button
								key={file.id}
								type="button"
								onClick={() => navigate(file.file_path)}
								className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-all hover:bg-surface-2 hover:border-primary/30 hover:-translate-y-0.5"
							>
								{/* File icon */}
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
									<FileText size={18} />
								</div>

								{/* File info */}
								<Stack gap={0} className="flex-1 min-w-0">
									<Text size="sm" weight="medium" truncate>
										{file.file_name}
									</Text>
									{file.context && (
										<Text size="xs" color="muted" truncate>
											{file.context}
										</Text>
									)}
								</Stack>

								{/* Time */}
								<Text size="xs" color="muted" className="shrink-0">
									{formatTimeAgo(file.accessed_at)}
								</Text>

								{/* Arrow */}
								<ExternalLink
									size={12}
									className="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
								/>
							</button>
						))}
					</Stack>
				)}
			</Stack>
		</Panel>
	);
}

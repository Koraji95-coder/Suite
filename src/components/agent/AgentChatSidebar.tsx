import { MessageSquarePlus, Trash2 } from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { AgentConversation } from "@/services/agentTaskManager";

interface AgentChatSidebarProps {
	conversations: AgentConversation[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onNew: () => void;
	onDelete: (id: string) => void;
}

export function AgentChatSidebar({
	conversations,
	activeId,
	onSelect,
	onNew,
	onDelete,
}: AgentChatSidebarProps) {
	const { palette } = useTheme();

	return (
		<div
			className="flex h-full flex-col"
			style={{ borderRight: `1px solid ${hexToRgba(palette.text, 0.06)}` }}
		>
			<div className="flex items-center justify-between px-4 py-3">
				<span
					className="text-xs font-semibold uppercase tracking-wider"
					style={{ color: hexToRgba(palette.text, 0.4) }}
				>
					Conversations
				</span>
				<button
					type="button"
					onClick={onNew}
					className="rounded-lg p-1.5 transition-colors"
					style={{ color: palette.primary }}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = hexToRgba(palette.primary, 0.1);
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent";
					}}
				>
					<MessageSquarePlus size={16} />
				</button>
			</div>

			<div className="flex-1 overflow-y-auto px-2 pb-2">
				{conversations.length === 0 ? (
					<p
						className="px-2 py-8 text-center text-xs"
						style={{ color: hexToRgba(palette.text, 0.3) }}
					>
						No conversations yet
					</p>
				) : (
					<div className="space-y-0.5">
						{conversations.map((conv) => {
							const isActive = conv.id === activeId;
							return (
								<div
									key={conv.id}
									className="group relative"
								>
									<button
										type="button"
										onClick={() => onSelect(conv.id)}
										className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
										style={{
											background: isActive
												? hexToRgba(palette.primary, 0.1)
												: "transparent",
											color: isActive
												? palette.text
												: hexToRgba(palette.text, 0.6),
										}}
										onMouseEnter={(e) => {
											if (!isActive)
												e.currentTarget.style.background = hexToRgba(palette.text, 0.04);
										}}
										onMouseLeave={(e) => {
											if (!isActive)
												e.currentTarget.style.background = "transparent";
										}}
									>
										<div className="truncate font-medium">{conv.title}</div>
										<div
											className="mt-0.5 text-xs"
											style={{ color: hexToRgba(palette.text, 0.3) }}
										>
											{conv.messages.length} message{conv.messages.length !== 1 ? "s" : ""}
										</div>
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onDelete(conv.id);
										}}
										className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
										style={{ color: hexToRgba(palette.text, 0.35) }}
										onMouseEnter={(e) => {
											e.currentTarget.style.color = "var(--danger)";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.color = hexToRgba(palette.text, 0.35);
										}}
									>
										<Trash2 size={13} />
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

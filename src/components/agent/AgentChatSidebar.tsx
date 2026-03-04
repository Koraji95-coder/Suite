// src/components/agent/AgentChatSidebar.tsx
import { MessageCircle, MessageSquarePlus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
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
	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<Text
					size="xs"
					weight="semibold"
					color="muted"
					className="uppercase tracking-wider"
				>
					Conversations
				</Text>
				<IconButton
					icon={<MessageSquarePlus size={16} />}
					aria-label="New conversation"
					variant="ghost"
					size="sm"
					onClick={onNew}
				/>
			</div>

			{/* Conversation List */}
			<div className="flex-1 overflow-y-auto p-2">
				{conversations.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 px-4">
						<div className="rounded-full bg-surface-2 p-3 mb-3">
							<MessageCircle size={20} className="text-text-muted" />
						</div>
						<Text size="sm" color="muted" align="center" block>
							No conversations yet
						</Text>
						<Text size="xs" color="muted" align="center" className="mt-1" block>
							Start a new chat to get going
						</Text>
						<Button
							variant="outline"
							size="sm"
							className="mt-4"
							iconLeft={<MessageSquarePlus size={14} />}
							onClick={onNew}
						>
							New chat
						</Button>
					</div>
				) : (
					<Stack gap={1}>
						{conversations.map((conv) => {
							const isActive = conv.id === activeId;
							return (
								<ConversationItem
									key={conv.id}
									conversation={conv}
									isActive={isActive}
									onSelect={() => onSelect(conv.id)}
									onDelete={() => onDelete(conv.id)}
								/>
							);
						})}
					</Stack>
				)}
			</div>

			{/* Footer */}
			<div className="border-t border-border p-3">
				<Button
					variant="primary"
					size="sm"
					fluid
					iconLeft={<MessageSquarePlus size={14} />}
					onClick={onNew}
				>
					New conversation
				</Button>
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION ITEM
// ═══════════════════════════════════════════════════════════════════════════
function ConversationItem({
	conversation,
	isActive,
	onSelect,
	onDelete,
}: {
	conversation: AgentConversation;
	isActive: boolean;
	onSelect: () => void;
	onDelete: () => void;
}) {
	return (
		<div className="group relative">
			<button
				type="button"
				onClick={onSelect}
				className={`
          w-full rounded-xl px-3 py-2.5 text-left transition-colors
          ${
						isActive
							? "bg-primary/10 border border-primary/20"
							: "hover:bg-surface-2 border border-transparent"
					}
        `}
			>
				<HStack gap={2} align="start">
					{/* Icon */}
					<div
						className={`
            mt-0.5 shrink-0 rounded-lg p-1.5
            ${isActive ? "bg-primary/15 text-primary" : "bg-surface-2 text-text-muted"}
          `}
					>
						<MessageCircle size={12} />
					</div>

					{/* Content */}
					<Stack gap={0} className="min-w-0 flex-1">
						<Text
							size="sm"
							weight="medium"
							color={isActive ? "default" : "muted"}
							truncate
							block
						>
							{conversation.title}
						</Text>
						<Text size="xs" color="muted">
							{conversation.messages.length} message
							{conversation.messages.length !== 1 ? "s" : ""}
						</Text>
					</Stack>
				</HStack>
			</button>

			{/* Delete button */}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
				className="
          absolute right-2 top-1/2 -translate-y-1/2 
          rounded-lg p-1.5 
          text-text-muted hover:text-danger hover:bg-danger/10
          opacity-0 group-hover:opacity-100 
          transition-all
        "
				aria-label="Delete conversation"
			>
				<Trash2 size={14} />
			</button>
		</div>
	);
}

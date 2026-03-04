// src/components/agent/AgentChatSidebar.tsx
import { MessageCircle, MessageSquarePlus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import type { AgentConversation } from "@/services/agentTaskManager";
import styles from "./AgentChatSidebar.module.css";

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
		<div className={styles.root}>
			{/* Header */}
			<div className={styles.header}>
				<Text
					size="xs"
					weight="semibold"
					color="muted"
					className={styles.headerLabel}
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
			<div className={styles.listWrap}>
				{conversations.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyIconWrap}>
							<MessageCircle size={20} className={styles.emptyIcon} />
						</div>
						<Text size="sm" color="muted" align="center" block>
							No conversations yet
						</Text>
						<Text
							size="xs"
							color="muted"
							align="center"
							className={styles.emptyHint}
							block
						>
							Start a new chat to get going
						</Text>
						<Button
							variant="outline"
							size="sm"
							className={styles.emptyAction}
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
			<div className={styles.footer}>
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
		<div className={styles.conversationRoot}>
			<button
				type="button"
				onClick={onSelect}
				className={cn(
					styles.conversationButton,
					isActive
						? styles.conversationButtonActive
						: styles.conversationButtonInactive,
				)}
			>
				<HStack gap={2} align="start">
					{/* Icon */}
					<div
						className={cn(
							styles.conversationIconWrap,
							isActive
								? styles.conversationIconWrapActive
								: styles.conversationIconWrapInactive,
						)}
					>
						<MessageCircle size={12} />
					</div>

					{/* Content */}
					<Stack gap={0} className={styles.conversationContent}>
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
				className={styles.deleteButton}
				aria-label="Delete conversation"
			>
				<Trash2 size={14} />
			</button>
		</div>
	);
}

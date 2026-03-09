// src/components/agent/AgentChatMessages.tsx

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";

// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import type { AgentConversationMessage } from "@/services/agentTaskManager";
import styles from "./AgentChatMessages.module.css";
import { AgentPixelMark } from "./AgentPixelMark";
import {
	type AgentMarkState,
	resolveAgentMarkState,
} from "./agentMarkState";
import { AGENT_PROFILES, type AgentProfileId } from "./agentProfiles";

interface AgentChatMessagesProps {
	messages: AgentConversationMessage[];
	defaultProfileId: AgentProfileId;
	thinkingProfileId?: AgentProfileId;
	thinkingContent?: string;
	isThinking?: boolean;
	baseAvatarState?: AgentMarkState;
}

const SPEAKING_TRANSIENT_MS = 1_400;

export function AgentChatMessages({
	messages,
	defaultProfileId,
	thinkingProfileId,
	thinkingContent = "",
	isThinking = false,
	baseAvatarState = "idle",
}: AgentChatMessagesProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const latestMessage = messages[messages.length - 1];
	const showThinking = isThinking && latestMessage?.role !== "assistant";

	// Scroll to bottom when messages change
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [latestMessage?.id, messages.length, showThinking]);

	return (
		<div className={styles.root}>
			<div className={styles.inner}>
				<Stack gap={4}>
					{messages.map((msg, index) => {
						if (msg.role === "user") {
							return <UserBubble key={msg.id} content={msg.content} />;
						}
						const messageProfileId = resolveMessageProfileId(
							msg.profileId,
							defaultProfileId,
						);
						return (
							<AssistantRow
								key={msg.id}
								content={msg.content}
								profileId={messageProfileId}
								isLatest={index === messages.length - 1 && !showThinking}
								baseAvatarState={baseAvatarState}
							/>
						);
					})}

					{/* Thinking indicator */}
					{showThinking && (
						<ThinkingIndicator
							profileId={thinkingProfileId ?? defaultProfileId}
							baseAvatarState={baseAvatarState}
							content={thinkingContent}
						/>
					)}
				</Stack>

				<div ref={bottomRef} />
			</div>
		</div>
	);
}

function resolveMessageProfileId(
	profileId: string | undefined,
	fallbackProfileId: AgentProfileId,
): AgentProfileId {
	const normalized = String(profileId || "").trim().toLowerCase();
	if (normalized in AGENT_PROFILES) {
		return normalized as AgentProfileId;
	}
	return fallbackProfileId;
}

// ═══════════════════════════════════════════════════════════════════════════
// USER BUBBLE
// ═══════════════════════════════════════════════════════════════════════════
function UserBubble({ content }: { content: string }) {
	return (
		<div className={styles.userRow}>
			<div className={styles.userBubble}>
				{/* Subtle shine effect */}
				<div className={styles.userShine} />

				<Text size="sm" className={styles.userText}>
					{content}
				</Text>
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSISTANT ROW
// ═══════════════════════════════════════════════════════════════════════════
function AssistantRow({
	content,
	profileId,
	isLatest,
	baseAvatarState,
}: {
	content: string;
	profileId: AgentProfileId;
	isLatest: boolean;
	baseAvatarState: AgentMarkState;
}) {
	const [copied, setCopied] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(isLatest);

	useEffect(() => {
		if (!isLatest) {
			setIsSpeaking(false);
			return;
		}
		setIsSpeaking(true);
		const timer = window.setTimeout(() => {
			setIsSpeaking(false);
		}, SPEAKING_TRANSIENT_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [isLatest]);

	const avatarState = resolveAgentMarkState({
		error: baseAvatarState === "error",
		waiting: baseAvatarState === "waiting",
		running: baseAvatarState === "running",
		speaking: isSpeaking,
		focus: baseAvatarState === "focus",
	});

	// Check if content looks like JSON/code
	const isCodeBlock =
		content.trim().startsWith("{") || content.trim().startsWith("[");

	const handleCopy = async () => {
		await navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<HStack gap={3} align="start" className={styles.assistantRow}>
			{/* Avatar */}
			<div className={styles.assistantAvatarShell}>
				<div className={styles.assistantAvatarWrap}>
					<AgentPixelMark
						profileId={profileId}
						size={42}
						detailLevel="auto"
						state={avatarState}
					/>
					{/* Online indicator */}
					<div className={styles.onlineDot} />
				</div>
			</div>

			{/* Content */}
			<Stack gap={1} className={styles.assistantContent}>
				<p className={styles.assistantTag}>
					{AGENT_PROFILES[profileId]?.name ?? profileId}
				</p>
				{isCodeBlock ? (
					<Panel variant="inset" padding="md" className={styles.codePanel}>
						{/* Copy button */}
						<IconButton
							icon={copied ? <Check size={14} /> : <Copy size={14} />}
							aria-label="Copy code"
							variant="ghost"
							size="sm"
							onClick={handleCopy}
							className={styles.codeCopyButton}
						/>

						<pre className={styles.codeContent}>{content}</pre>
					</Panel>
				) : (
					<div className={styles.assistantBubble}>
						<Text size="sm" className={styles.assistantText}>
							{content}
						</Text>
					</div>
				)}

				{/* Message actions (visible on hover) */}
				<HStack gap={1} className={styles.messageActions}>
					<IconButton
						icon={copied ? <Check size={12} /> : <Copy size={12} />}
						aria-label="Copy message"
						variant="ghost"
						size="sm"
						onClick={handleCopy}
					/>
				</HStack>
			</Stack>
		</HStack>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// THINKING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════
function ThinkingIndicator({
	profileId,
	baseAvatarState,
	content,
}: {
	profileId: AgentProfileId;
	baseAvatarState: AgentMarkState;
	content: string;
}) {
	const avatarState = resolveAgentMarkState({
		error: baseAvatarState === "error",
		waiting: baseAvatarState === "waiting",
		running: baseAvatarState === "running",
		thinking: true,
	});
	const hasContent = content.trim().length > 0;
	return (
		<HStack gap={3} align="start" className={styles.thinkingRow}>
			<div className={styles.assistantAvatarShell}>
				<AgentPixelMark
					profileId={profileId}
					size={42}
					detailLevel="auto"
					state={avatarState}
				/>
			</div>

			{hasContent ? (
				<div className={styles.thinkingStreamBubble}>
					<Text size="sm" className={styles.assistantText}>
						{content}
					</Text>
				</div>
			) : (
				<HStack gap={2} align="center" className={styles.thinkingBubble}>
					<ThinkingDots />
					<Text size="xs" color="muted">
						Thinking...
					</Text>
				</HStack>
			)}
		</HStack>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// THINKING DOTS
// ═══════════════════════════════════════════════════════════════════════════
function ThinkingDots() {
	return (
		<div className={styles.thinkingDots}>
			{[0, 1, 2].map((i) => (
				<span
					key={i}
					className={cn(styles.thinkingDot)}
					style={{ animationDelay: `${i * 0.15}s` }}
				/>
			))}
		</div>
	);
}

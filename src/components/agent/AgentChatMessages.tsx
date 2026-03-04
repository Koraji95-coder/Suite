// src/components/agent/AgentChatMessages.tsx

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";

// Primitives
import { Text } from "@/components/primitives/Text";
import type { AgentConversationMessage } from "@/services/agentTaskManager";
import { AgentPixelMark } from "./AgentPixelMark";
import type { AgentProfileId } from "./agentProfiles";

interface AgentChatMessagesProps {
	messages: AgentConversationMessage[];
	profileId: AgentProfileId;
	isThinking?: boolean;
}

export function AgentChatMessages({
	messages,
	profileId,
	isThinking = false,
}: AgentChatMessagesProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	// Scroll to bottom when messages change
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	});

	return (
		<div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
			<div className="mx-auto max-w-190">
				<Stack gap={4}>
					{messages.map((msg, index) =>
						msg.role === "user" ? (
							<UserBubble key={msg.id} content={msg.content} />
						) : (
							<AssistantRow
								key={msg.id}
								content={msg.content}
								profileId={profileId}
								isLatest={index === messages.length - 1 && !isThinking}
							/>
						),
					)}

					{/* Thinking indicator */}
					{isThinking && <ThinkingIndicator profileId={profileId} />}
				</Stack>

				<div ref={bottomRef} />
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// USER BUBBLE
// ═══════════════════════════════════════════════════════════════════════════
function UserBubble({ content }: { content: string }) {
	return (
		<div className="flex justify-end pl-12">
			<div
				className="
          relative max-w-[85%] rounded-2xl rounded-br-sm 
          bg-linear-to-br from-primary/20 to-primary/10
          border border-primary/20
          px-4 py-3
        "
			>
				{/* Subtle shine effect */}
				<div className="absolute inset-0 rounded-2xl rounded-br-sm bg-linear-to-br from-white/5 to-transparent pointer-events-none" />

				<Text
					size="sm"
					className="relative leading-relaxed whitespace-pre-wrap"
				>
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
}: {
	content: string;
	profileId: AgentProfileId;
	isLatest: boolean;
}) {
	const [copied, setCopied] = useState(false);

	// Check if content looks like JSON/code
	const isCodeBlock =
		content.trim().startsWith("{") || content.trim().startsWith("[");

	const handleCopy = async () => {
		await navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<HStack gap={3} align="start" className="group pr-12">
			{/* Avatar */}
			<div className="shrink-0 pt-1">
				<div className="relative">
					<AgentPixelMark
						profileId={profileId}
						size={32}
						expression={isLatest ? "active" : "neutral"}
					/>
					{/* Online indicator */}
					<div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
				</div>
			</div>

			{/* Content */}
			<Stack gap={1} className="min-w-0 flex-1">
				{isCodeBlock ? (
					<Panel
						variant="inset"
						padding="md"
						className="overflow-x-auto relative group/code"
					>
						{/* Copy button */}
						<IconButton
							icon={copied ? <Check size={14} /> : <Copy size={14} />}
							aria-label="Copy code"
							variant="ghost"
							size="sm"
							onClick={handleCopy}
							className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity"
						/>

						<pre className="text-xs leading-relaxed text-text/90 font-mono whitespace-pre-wrap pr-8">
							{content}
						</pre>
					</Panel>
				) : (
					<div className="rounded-2xl rounded-tl-sm bg-surface-2/50 border border-border/50 px-4 py-3">
						<Text size="sm" className="leading-relaxed whitespace-pre-wrap">
							{content}
						</Text>
					</div>
				)}

				{/* Message actions (visible on hover) */}
				<HStack
					gap={1}
					className="opacity-0 group-hover:opacity-100 transition-opacity"
				>
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
function ThinkingIndicator({ profileId }: { profileId: AgentProfileId }) {
	return (
		<HStack gap={3} align="start" className="pr-12">
			<div className="shrink-0 pt-1">
				<AgentPixelMark
					profileId={profileId}
					size={32}
					expression="active"
					pulse
				/>
			</div>

			<HStack
				gap={2}
				align="center"
				className="rounded-2xl rounded-tl-sm bg-surface-2/50 border border-border/50 px-4 py-3"
			>
				<ThinkingDots />
				<Text size="xs" color="muted">
					Thinking...
				</Text>
			</HStack>
		</HStack>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// THINKING DOTS
// ═══════════════════════════════════════════════════════════════════════════
function ThinkingDots() {
	return (
		<>
			<div className="flex items-center gap-1">
				{[0, 1, 2].map((i) => (
					<span
						key={i}
						className="h-1.5 w-1.5 rounded-full bg-primary thinking-dot"
						style={{ animationDelay: `${i * 0.15}s` }}
					/>
				))}
			</div>

			<style>{`
        @keyframes thinking-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        .thinking-dot {
          animation: thinking-bounce 1s ease-in-out infinite;
        }
      `}</style>
		</>
	);
}

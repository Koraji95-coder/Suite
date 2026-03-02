import { useEffect, useRef } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { AgentConversationMessage } from "@/services/agentTaskManager";
import type { AgentProfileId } from "./agentProfiles";
import { AgentPixelMark } from "./AgentPixelMark";

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
	const { palette } = useTheme();
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, isThinking]);

	return (
		<div className="flex-1 overflow-y-auto px-6 py-6">
			<div className="mx-auto max-w-[720px] space-y-6">
				{messages.map((msg) =>
					msg.role === "user" ? (
						<UserBubble key={msg.id} content={msg.content} palette={palette} />
					) : (
						<AssistantRow
							key={msg.id}
							content={msg.content}
							profileId={profileId}
							palette={palette}
						/>
					),
				)}

				{isThinking && (
					<div className="flex items-start gap-3">
						<div className="suite-mark-pulse shrink-0 pt-0.5">
							<AgentPixelMark
								profileId={profileId}
								size={32}
								expression="active"
							/>
						</div>
						<div className="flex items-center gap-1.5 pt-2.5">
							<span className="suite-thinking-dot" />
							<span className="suite-thinking-dot" />
							<span className="suite-thinking-dot" />
						</div>
					</div>
				)}

				<div ref={bottomRef} />
			</div>
		</div>
	);
}

function UserBubble({
	content,
	palette,
}: {
	content: string;
	palette: ReturnType<typeof useTheme>["palette"];
}) {
	return (
		<div className="flex justify-end">
			<div
				className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed"
				style={{
					background: hexToRgba(palette.primary, 0.12),
					color: palette.text,
				}}
			>
				{content}
			</div>
		</div>
	);
}

function AssistantRow({
	content,
	profileId,
	palette,
}: {
	content: string;
	profileId: AgentProfileId;
	palette: ReturnType<typeof useTheme>["palette"];
}) {
	return (
		<div className="flex items-start gap-3">
			<div className="shrink-0 pt-0.5">
				<AgentPixelMark profileId={profileId} size={32} expression="neutral" />
			</div>
			<div
				className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap"
				style={{ color: hexToRgba(palette.text, 0.88) }}
			>
				{content}
			</div>
		</div>
	);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import {
	agentTaskManager,
	type AgentConversation,
} from "@/services/agentTaskManager";
import { agentService } from "@/services/agentService";
import { AgentChatSidebar } from "./AgentChatSidebar";
import { AgentChatMessages } from "./AgentChatMessages";
import { AgentChatComposer } from "./AgentChatComposer";
import { AgentPixelMark } from "./AgentPixelMark";
import { AgentProfileSwitcher } from "./AgentProfileSwitcher";
import {
	AGENT_PROFILES,
	DEFAULT_AGENT_PROFILE,
	type AgentProfileId,
} from "./agentProfiles";
import { getAgentTaskTemplates } from "./agentTaskTemplates";

interface AgentChatPanelProps {
	healthy: boolean;
	paired: boolean;
}

export function AgentChatPanel({ healthy, paired }: AgentChatPanelProps) {
	const { palette } = useTheme();

	const [profileId, setProfileId] = useState<AgentProfileId>(() => {
		try {
			const stored = localStorage.getItem("agent-active-profile");
			if (stored && stored in AGENT_PROFILES) return stored as AgentProfileId;
		} catch {
			/* noop */
		}
		return DEFAULT_AGENT_PROFILE;
	});

	const [conversations, setConversations] = useState<AgentConversation[]>([]);
	const [activeConvId, setActiveConvId] = useState<string | null>(null);
	const [isThinking, setIsThinking] = useState(false);

	useEffect(() => {
		agentTaskManager.setProfileScope(profileId);
		const convs = agentTaskManager.getConversations();
		setConversations(convs);
		setActiveConvId(convs[0]?.id ?? null);
		try {
			localStorage.setItem("agent-active-profile", profileId);
		} catch {
			/* noop */
		}
	}, [profileId]);

	const activeConv = useMemo(
		() => conversations.find((c) => c.id === activeConvId) ?? null,
		[conversations, activeConvId],
	);

	const profile = AGENT_PROFILES[profileId];
	const templates = getAgentTaskTemplates(profileId);

	const refreshConversations = useCallback(() => {
		const convs = agentTaskManager.getConversations();
		setConversations(convs);
	}, []);

	const handleNewConversation = useCallback(() => {
		const conv = agentTaskManager.createConversation(profileId);
		agentTaskManager.saveConversation(conv);
		refreshConversations();
		setActiveConvId(conv.id);
	}, [profileId, refreshConversations]);

	const handleDeleteConversation = useCallback(
		(id: string) => {
			agentTaskManager.deleteConversation(id);
			refreshConversations();
			setActiveConvId((prev) => {
				if (prev === id) {
					const remaining = agentTaskManager.getConversations();
					return remaining[0]?.id ?? null;
				}
				return prev;
			});
		},
		[refreshConversations],
	);

	const handleSend = useCallback(
		async (message: string) => {
			if (!healthy || !paired) return;

			let convId = activeConvId;
			if (!convId) {
				const conv = agentTaskManager.createConversation(profileId);
				agentTaskManager.saveConversation(conv);
				convId = conv.id;
				setActiveConvId(convId);
			}

			agentTaskManager.addMessageToConversation(convId, "user", message);
			refreshConversations();

			setIsThinking(true);
			try {
				const response = await agentService.sendMessage(message);
				const reply = response.success
					? typeof response.data === "object"
						? JSON.stringify(response.data, null, 2)
						: String(response.data ?? "Task completed.")
					: response.error || "Request failed.";

				agentTaskManager.addMessageToConversation(convId, "assistant", reply);
			} catch (err) {
				const errMsg =
					err instanceof Error ? err.message : "Unknown error occurred.";
				agentTaskManager.addMessageToConversation(
					convId,
					"assistant",
					errMsg,
				);
			} finally {
				setIsThinking(false);
				refreshConversations();
			}
		},
		[healthy, paired, activeConvId, profileId, refreshConversations],
	);

	const isReady = healthy && paired;

	return (
		<div
			className="flex h-full overflow-hidden rounded-2xl border"
			style={{
				background: palette.background,
				borderColor: hexToRgba(palette.text, 0.06),
			}}
		>
			{/* Sidebar */}
			<div
				className="hidden w-64 shrink-0 md:block"
				style={{ background: hexToRgba(palette.surface, 0.5) }}
			>
				<AgentChatSidebar
					conversations={conversations}
					activeId={activeConvId}
					onSelect={setActiveConvId}
					onNew={handleNewConversation}
					onDelete={handleDeleteConversation}
				/>
			</div>

			{/* Main area */}
			<div className="flex min-w-0 flex-1 flex-col">
				{/* Top bar */}
				<div
					className="flex items-center justify-between border-b px-4 py-2"
					style={{ borderColor: hexToRgba(palette.text, 0.06) }}
				>
					<AgentProfileSwitcher
						activeProfileId={profileId}
						onSelect={setProfileId}
					/>
					<div className="flex items-center gap-2">
						<StatusDot
							ok={healthy}
							label={healthy ? "Online" : "Offline"}
							palette={palette}
						/>
						<StatusDot
							ok={paired}
							label={paired ? "Paired" : "Unpaired"}
							palette={palette}
						/>
					</div>
				</div>

				{/* Messages or empty state */}
				{activeConv && activeConv.messages.length > 0 ? (
					<AgentChatMessages
						messages={activeConv.messages}
						profileId={profileId}
						isThinking={isThinking}
					/>
				) : (
					<EmptyState
						profile={profile}
						profileId={profileId}
						palette={palette}
						templates={templates}
						onTemplateClick={(prompt) => {
							if (isReady) handleSend(prompt);
						}}
					/>
				)}

				{/* Composer */}
				<AgentChatComposer
					onSend={handleSend}
					disabled={!isReady || isThinking}
					templates={activeConv?.messages.length ? [] : []}
				/>
			</div>
		</div>
	);
}

function StatusDot({
	ok,
	label,
	palette,
}: {
	ok: boolean;
	label: string;
	palette: ReturnType<typeof import("@/lib/palette").useTheme>["palette"];
}) {
	return (
		<span
			className="flex items-center gap-1.5 text-xs"
			style={{ color: hexToRgba(palette.text, 0.5) }}
		>
			<span
				className="h-1.5 w-1.5 rounded-full"
				style={{ background: ok ? "var(--success)" : "var(--danger)" }}
			/>
			{label}
		</span>
	);
}

function EmptyState({
	profile,
	profileId,
	palette,
	templates,
	onTemplateClick,
}: {
	profile: { name: string; tagline: string };
	profileId: AgentProfileId;
	palette: ReturnType<typeof import("@/lib/palette").useTheme>["palette"];
	templates: Array<{ label: string; prompt: string }>;
	onTemplateClick: (prompt: string) => void;
}) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
			<div
				className="mb-6 rounded-2xl p-5"
				style={{
					background: hexToRgba(palette.surface, 0.6),
					boxShadow: "var(--shadow-neon)",
				}}
			>
				<AgentPixelMark profileId={profileId} size={72} expression="focus" />
			</div>
			<h2
				className="text-xl font-semibold"
				style={{ color: palette.text }}
			>
				{profile.name}
			</h2>
			<p
				className="mt-1 text-sm"
				style={{ color: hexToRgba(palette.text, 0.45) }}
			>
				{profile.tagline}
			</p>

			{templates.length > 0 && (
				<div className="mt-8 flex max-w-md flex-wrap justify-center gap-2">
					{templates.map((t) => (
						<button
							key={t.label}
							type="button"
							onClick={() => onTemplateClick(t.prompt)}
							className="rounded-full px-4 py-2 text-xs font-medium transition-colors"
							style={{
								background: hexToRgba(palette.primary, 0.08),
								color: palette.primary,
								border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = hexToRgba(
									palette.primary,
									0.16,
								);
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = hexToRgba(
									palette.primary,
									0.08,
								);
							}}
						>
							{t.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// src/components/agent/AgentChatPanel.tsx

import {
	ChevronLeft,
	ChevronRight,
	Loader2,
	Maximize2,
	Settings2,
	WifiOff,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Button, IconButton } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import { agentService } from "@/services/agentService";
import {
	type AgentConversation,
	agentTaskManager,
} from "@/services/agentTaskManager";
import { AgentChatComposer } from "./AgentChatComposer";
import { AgentChatMessages } from "./AgentChatMessages";
import styles from "./AgentChatPanel.module.css";
import { AgentChatSidebar } from "./AgentChatSidebar";
import { AgentPixelMark } from "./AgentPixelMark";
import { AgentProfileSwitcher } from "./AgentProfileSwitcher";
import {
	AGENT_PROFILES,
	type AgentProfileId,
	DEFAULT_AGENT_PROFILE,
} from "./agentProfiles";
import { getAgentTaskTemplates } from "./agentTaskTemplates";

interface AgentChatPanelProps {
	healthy: boolean;
	paired: boolean;
}

export function AgentChatPanel({ healthy, paired }: AgentChatPanelProps) {
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
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
				agentTaskManager.addMessageToConversation(convId, "assistant", errMsg);
			} finally {
				setIsThinking(false);
				refreshConversations();
			}
		},
		[healthy, paired, activeConvId, profileId, refreshConversations],
	);

	const isReady = healthy && paired;

	return (
		<Panel variant="default" padding="none" className={styles.panelRoot}>
			{/* ═══════════════════════════════════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════════════════════════════════ */}
			<div
				className={cn(
					styles.sidebar,
					sidebarCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded,
				)}
			>
				<AgentChatSidebar
					conversations={conversations}
					activeId={activeConvId}
					onSelect={setActiveConvId}
					onNew={handleNewConversation}
					onDelete={handleDeleteConversation}
				/>
			</div>

			{/* Sidebar toggle */}
			<button
				type="button"
				onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
				className={styles.sidebarToggle}
				style={{ left: sidebarCollapsed ? 0 : 256 }}
			>
				{sidebarCollapsed ? (
					<ChevronRight size={12} />
				) : (
					<ChevronLeft size={12} />
				)}
			</button>

			{/* ═══════════════════════════════════════════════════════════════════
          MAIN CHAT AREA
      ═══════════════════════════════════════════════════════════════════ */}
			<div className={styles.mainArea}>
				{/* Header */}
				<div className={styles.header}>
					<HStack gap={3} align="center">
						{/* Agent avatar with status ring */}
						<div className={styles.avatarCluster}>
							<div
								className={cn(
									styles.avatarThinkingHalo,
									isThinking && styles.avatarThinkingHaloVisible,
								)}
							/>
							<AgentPixelMark
								profileId={profileId}
								size={44}
								expression={isThinking ? "active" : "neutral"}
								pulse={isThinking}
							/>
							{/* Status dot */}
							<div
								className={cn(
									styles.statusDot,
									isReady ? styles.statusDotReady : styles.statusDotPending,
								)}
							/>
						</div>

						<Stack gap={0}>
							<HStack gap={2} align="center">
								<AgentProfileSwitcher
									activeProfileId={profileId}
									onSelect={setProfileId}
								/>
								{isThinking && (
									<Badge color="primary" variant="soft" size="sm">
										<Loader2 size={10} className={styles.spin} />
										Working...
									</Badge>
								)}
							</HStack>
							<Text size="xs" color="muted">
								{profile.tagline}
							</Text>
						</Stack>
					</HStack>

					{/* Right side actions */}
					<HStack gap={2}>
						{/* Status badges */}
						<div className={styles.statusBadges}>
							<Badge
								color={healthy ? "success" : "danger"}
								variant="soft"
								size="sm"
								dot
								pulse={!healthy}
							>
								{healthy ? "Online" : "Offline"}
							</Badge>

							<Badge
								color={paired ? "primary" : "warning"}
								variant="soft"
								size="sm"
								dot
							>
								{paired ? "Connected" : "Unpaired"}
							</Badge>
						</div>

						{/* Action buttons */}
						<IconButton
							icon={<Maximize2 size={16} />}
							aria-label="Expand chat"
							variant="ghost"
							size="sm"
						/>
						<IconButton
							icon={<Settings2 size={16} />}
							aria-label="Agent settings"
							variant="ghost"
							size="sm"
						/>
					</HStack>
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
						templates={templates}
						isReady={isReady}
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
		</Panel>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY STATE (Creative Design)
// ═══════════════════════════════════════════════════════════════════════════
function EmptyState({
	profile,
	profileId,
	templates,
	isReady,
	onTemplateClick,
}: {
	profile: { name: string; tagline: string };
	profileId: AgentProfileId;
	templates: Array<{ label: string; prompt: string }>;
	isReady: boolean;
	onTemplateClick: (prompt: string) => void;
}) {
	return (
		<div className={styles.emptyRoot}>
			{/* Background decorations */}
			<div className={styles.emptyBackdrop}>
				{/* Radial gradient */}
				<div className={styles.emptyRadial} />

				{/* Grid pattern */}
				<div className={styles.emptyGrid} />
			</div>

			{/* Content */}
			<div className={styles.emptyContent}>
				{/* Agent avatar with effects */}
				<div className={styles.emptyAvatarWrap}>
					{/* Outer glow ring */}
					<div className={styles.emptyAvatarGlow} />

					{/* Inner container */}
					<div className={styles.emptyAvatarInner}>
						<AgentPixelMark
							profileId={profileId}
							size={108}
							expression={isReady ? "focus" : "neutral"}
							breathe={isReady}
							className={styles.emptyAvatarMark}
						/>
					</div>
				</div>

				{/* Agent name with gradient */}
				<h2 className={styles.emptyTitle}>{profile.name}</h2>

				<Text
					size="md"
					color="muted"
					align="center"
					className={styles.emptyTagline}
					block
				>
					{profile.tagline}
				</Text>

				{/* Status indicator */}
				{!isReady ? (
					<HStack
						gap={2}
						align="center"
						className={cn(styles.statusPill, styles.statusPillWarning)}
					>
						<WifiOff size={14} className={styles.warningIcon} />
						<Text size="sm" color="warning">
							Waiting for connection...
						</Text>
					</HStack>
				) : (
					<HStack
						gap={2}
						align="center"
						className={cn(styles.statusPill, styles.statusPillSuccess)}
					>
						<div className={styles.readyDot} />
						<Text size="sm" color="success">
							Ready to assist
						</Text>
					</HStack>
				)}

				{/* Quick action templates */}
				{templates.length > 0 && isReady && (
					<div className={styles.templateWrap}>
						<Text
							size="xs"
							color="muted"
							weight="semibold"
							align="center"
							className={styles.templateLabel}
							block
						>
							Get started with
						</Text>

						<div className={styles.templateGrid}>
							{templates.slice(0, 4).map((t) => (
								<Button
									key={t.label}
									variant="outline"
									onClick={() => onTemplateClick(t.prompt)}
									iconLeft={<Zap size={14} />}
									className={styles.templateButton}
								>
									<Text size="sm" weight="medium" truncate>
										{t.label}
									</Text>
								</Button>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

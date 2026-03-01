import { MessageSquarePlus, Send, Trash2 } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAgentAvatar } from "@/agent/AgentAvatarContext";
import type { AgentProfileId } from "@/agent/agentProfiles";
import { getAgentTaskTemplates } from "@/agent/agentTaskTemplates";
import { AgentPixelAvatar } from "@/components/agent/AgentPixelAvatar";
import {
	type AgentConversation,
	type AgentConversationMessage,
	agentTaskManager,
	type ExecutedTask,
} from "@/services/agentTaskManager";

interface AgentTaskPanelProps {
	onExecuteTask: (
		prompt: string,
		taskName: string,
	) => Promise<{ success: boolean; text: string }>;
	isExecuting?: boolean;
	activeTaskName?: string | null;
	history?: ExecutedTask[];
	onSelectHistory?: (taskId: string) => void;
	onClearHistory?: () => void;
	agentName?: string;
	agentShortName?: string;
	agentTagline?: string;
	agentProfileId?: AgentProfileId;
}

function makeConversationTitle(messages: AgentConversationMessage[]): string {
	const firstUser = messages.find((msg) => msg.role === "user");
	if (!firstUser) return "New Conversation";
	const trimmed = firstUser.content.trim();
	return trimmed.length <= 56 ? trimmed : `${trimmed.slice(0, 56)}...`;
}

function createBlankConversation(
	id: string,
	nowIso: string,
): AgentConversation {
	return {
		id,
		title: "New Conversation",
		createdAt: nowIso,
		updatedAt: nowIso,
		messages: [],
	};
}

export function AgentTaskPanel({
	onExecuteTask,
	isExecuting = false,
	activeTaskName = null,
	history = [],
	onSelectHistory,
	onClearHistory,
	agentName = "Agent",
	agentShortName = "Agent",
	agentTagline = "Engineering assistant",
	agentProfileId = "devstral",
}: AgentTaskPanelProps) {
	const [conversations, setConversations] = useState<AgentConversation[]>([]);
	const [activeConversationId, setActiveConversationId] = useState<
		string | null
	>(null);
	const [inputValue, setInputValue] = useState("");
	const messagesScrollRef = useRef<HTMLDivElement | null>(null);
	const previousConversationIdRef = useRef<string | null>(null);
	const { getAvatarVariant } = useAgentAvatar();
	const taskTemplates = useMemo(
		() => getAgentTaskTemplates(agentProfileId),
		[agentProfileId],
	);
	const activeAvatarVariantId = getAvatarVariant(agentProfileId);

	useEffect(() => {
		agentTaskManager.setProfileScope(agentProfileId);
		const loadedConversations = agentTaskManager.getConversations();
		setConversations(loadedConversations);
		setActiveConversationId(loadedConversations[0]?.id ?? null);
		setInputValue("");
	}, [agentProfileId]);

	const activeConversation = useMemo(
		() =>
			conversations.find(
				(conversation) => conversation.id === activeConversationId,
			) ?? null,
		[conversations, activeConversationId],
	);
	const conversationMessages = activeConversation?.messages ?? [];
	const hasConversationMessages = conversationMessages.length > 0;
	const hasExecutionContext =
		isExecuting || history.length > 0 || Boolean(activeTaskName);
	const [detailsOpen, setDetailsOpen] = useState(hasExecutionContext);
	const showDetailsRail =
		detailsOpen && (hasConversationMessages || hasExecutionContext);

	useEffect(() => {
		const scroller = messagesScrollRef.current;
		if (!scroller) return;
		const switchedConversation =
			previousConversationIdRef.current !== activeConversationId;
		previousConversationIdRef.current = activeConversationId;
		const shouldSmooth =
			!switchedConversation && conversationMessages.length > 0;
		const frameId = window.requestAnimationFrame(() => {
			scroller.scrollTo({
				top: scroller.scrollHeight,
				behavior: shouldSmooth ? "smooth" : "auto",
			});
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [activeConversationId, conversationMessages.length]);

	useEffect(() => {
		if (hasExecutionContext) {
			setDetailsOpen(true);
		}
	}, [hasExecutionContext]);

	const saveConversation = (conversation: AgentConversation) => {
		agentTaskManager.saveConversation(conversation);
		const refreshed = agentTaskManager.getConversations();
		setConversations(refreshed);
		setActiveConversationId(conversation.id);
	};

	const handleNewConversation = () => {
		const nowIso = new Date().toISOString();
		const created = createBlankConversation(
			agentTaskManager.generateConversationId(),
			nowIso,
		);
		saveConversation(created);
		setInputValue("");
	};

	const handleDeleteConversation = (conversationId: string) => {
		agentTaskManager.deleteConversation(conversationId);
		const refreshed = agentTaskManager.getConversations();
		setConversations(refreshed);
		if (activeConversationId === conversationId) {
			setActiveConversationId(refreshed[0]?.id ?? null);
		}
	};

	const handleSend = async () => {
		const prompt = inputValue.trim();
		if (!prompt || isExecuting) return;

		const nowIso = new Date().toISOString();
		const userMessage: AgentConversationMessage = {
			id: `msg-${Date.now()}-u`,
			role: "user",
			content: prompt,
			timestamp: nowIso,
		};

		const baseConversation =
			activeConversation ??
			createBlankConversation(
				agentTaskManager.generateConversationId(),
				nowIso,
			);
		const withUser = {
			...baseConversation,
			messages: [...baseConversation.messages, userMessage],
			updatedAt: nowIso,
		};
		withUser.title = makeConversationTitle(withUser.messages);
		saveConversation(withUser);
		setInputValue("");

		const result = await onExecuteTask(prompt, "Chat");
		const assistantMessage: AgentConversationMessage = {
			id: `msg-${Date.now()}-a`,
			role: "assistant",
			content:
				result.text || (result.success ? "Completed." : "Request failed."),
			timestamp: new Date().toISOString(),
		};

		const latest =
			agentTaskManager
				.getConversations()
				.find((item) => item.id === withUser.id) ?? withUser;
		const withAssistant = {
			...latest,
			messages: [...latest.messages, assistantMessage],
			updatedAt: new Date().toISOString(),
		};
		withAssistant.title = makeConversationTitle(withAssistant.messages);
		saveConversation(withAssistant);
	};

	const handleComposerKeyDown = (
		event: ReactKeyboardEvent<HTMLTextAreaElement>,
	) => {
		if (event.key !== "Enter" || event.shiftKey) return;
		event.preventDefault();
		void handleSend();
	};

	return (
		<div
			className={`relative grid h-[var(--suite-agent-panel-h)] min-h-[var(--suite-agent-panel-min-h)] grid-cols-1 overflow-hidden rounded-[26px] border shadow-[var(--shadow-command)] [border-color:color-mix(in_srgb,var(--primary)_30%,var(--border))] [background:linear-gradient(160deg,color-mix(in_srgb,var(--bg-base)_97%,transparent),color-mix(in_srgb,var(--surface)_92%,transparent))] ${
				showDetailsRail
					? "lg:grid-cols-[260px_minmax(0,1fr)_300px]"
					: "lg:grid-cols-[260px_minmax(0,1fr)]"
			}`}
		>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px [background:linear-gradient(90deg,transparent,color-mix(in_srgb,var(--primary)_45%,transparent),transparent)]" />

			<aside className="flex max-h-[240px] min-h-0 flex-col border-b [border-color:var(--border)] [background:linear-gradient(165deg,color-mix(in_srgb,var(--surface)_82%,transparent),color-mix(in_srgb,var(--surface-2)_86%,transparent))] lg:max-h-none lg:border-b-0 lg:border-r">
				<div className="flex items-center justify-between gap-2 border-b px-4 py-3 [border-color:var(--border)]">
					<div>
						<div className="text-[11px] uppercase tracking-[0.14em] [color:var(--text-muted)]">
							Chats
						</div>
						<div className="text-sm font-semibold [color:var(--text)]">
							{conversations.length}
						</div>
					</div>
					<button
						type="button"
						onClick={handleNewConversation}
						className="inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition [border-color:var(--border)] [background:color-mix(in_srgb,var(--surface)_90%,transparent)] [color:var(--text)] hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)]"
					>
						<MessageSquarePlus size={12} />
						New
					</button>
				</div>

				<div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2.5">
					{conversations.length === 0 ? (
						<div className="rounded-lg border px-2.5 py-2 text-xs [border-color:var(--border)] [background:color-mix(in_srgb,var(--surface)_88%,transparent)] [color:var(--text-muted)]">
							No conversations yet.
						</div>
					) : (
						conversations.map((conversation) => (
							<div
								key={conversation.id}
								className={`rounded-xl border px-2.5 py-2 text-xs transition ${
									activeConversationId === conversation.id
										? "[border-color:color-mix(in_srgb,var(--primary)_40%,var(--border))] [background:color-mix(in_srgb,var(--primary)_14%,transparent)]"
										: "[border-color:var(--border)] hover:[border-color:color-mix(in_srgb,var(--primary)_32%,var(--border))] hover:[background:color-mix(in_srgb,var(--surface-2)_62%,transparent)]"
								}`}
							>
								<button
									type="button"
									onClick={() => setActiveConversationId(conversation.id)}
									className="w-full text-left"
								>
									<div className="truncate text-[12px] font-semibold [color:var(--text)]">
										{conversation.title}
									</div>
									<div className="mt-0.5 text-[10px] [color:var(--text-muted)]">
										{new Date(conversation.updatedAt).toLocaleString()}
									</div>
								</button>
								<button
									type="button"
									onClick={() => handleDeleteConversation(conversation.id)}
									className="mt-1 inline-flex items-center gap-1 text-[10px] [color:var(--text-muted)] transition hover:[color:var(--danger)]"
								>
									<Trash2 size={10} />
									Delete
								</button>
							</div>
						))
					)}
				</div>
			</aside>

			<main
				className={`relative flex min-h-0 flex-col border-b [border-color:var(--border)] [background:color-mix(in_srgb,var(--bg-base)_98%,transparent)] lg:border-b-0 ${
					showDetailsRail ? "lg:border-r" : ""
				}`}
			>
				<div className="flex items-center justify-between gap-3 border-b px-5 py-3 [border-color:var(--border)] [background:linear-gradient(145deg,color-mix(in_srgb,var(--surface)_84%,transparent),color-mix(in_srgb,var(--surface-2)_88%,transparent))]">
					<div className="flex min-w-0 items-center gap-3">
						<AgentPixelAvatar
							profileId={agentProfileId}
							variantId={activeAvatarVariantId}
							expression="focus"
							size={74}
						/>
						<div className="min-w-0">
							<div className="truncate text-lg font-semibold tracking-tight [color:var(--text)]">
								{agentName}
							</div>
							<div className="truncate text-xs [color:var(--text-muted)]">
								{agentTagline}
							</div>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setDetailsOpen((prev) => !prev)}
							disabled={!hasConversationMessages && !hasExecutionContext}
							className="rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 [border-color:var(--border)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--surface)_72%,transparent)]"
						>
							{showDetailsRail ? "Hide details" : "Show details"}
						</button>
						<div className="text-[10px] uppercase tracking-[0.13em] [color:var(--text-muted)]">
							Workspace Chat
						</div>
					</div>
				</div>

				<div
					ref={messagesScrollRef}
					className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
				>
					<div
						className={`mx-auto flex w-full max-w-[920px] flex-col ${
							hasConversationMessages
								? "gap-5"
								: "h-full items-center justify-center"
						}`}
					>
						{hasConversationMessages ? (
							<>
								{conversationMessages.map((message) =>
									message.role === "assistant" ? (
										<article
											key={message.id}
											className="flex items-start gap-3.5"
										>
											<AgentPixelAvatar
												profileId={agentProfileId}
												variantId={activeAvatarVariantId}
												expression="active"
												size={56}
											/>
											<div className="min-w-0 flex-1">
												<div className="text-[10px] font-semibold uppercase tracking-[0.14em] [color:var(--text-muted)]">
													{agentShortName}
												</div>
												<div className="mt-1 whitespace-pre-wrap text-[15px] leading-7 [color:var(--text)]">
													{message.content}
												</div>
												<div className="mt-1 text-[10px] [color:var(--text-muted)]">
													{new Date(message.timestamp).toLocaleTimeString()}
												</div>
											</div>
										</article>
									) : (
										<article key={message.id} className="ml-auto max-w-[78%]">
											<div className="rounded-[22px] border px-4 py-3 text-[15px] leading-6 [border-color:color-mix(in_srgb,var(--primary)_36%,var(--border))] [background:linear-gradient(145deg,color-mix(in_srgb,var(--primary)_20%,transparent),color-mix(in_srgb,var(--surface)_95%,transparent))] [color:var(--text)] shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_10%,transparent)]">
												<div className="whitespace-pre-wrap">
													{message.content}
												</div>
											</div>
											<div className="mt-1 px-1 text-right text-[10px] [color:var(--text-muted)]">
												{new Date(message.timestamp).toLocaleTimeString()}
											</div>
										</article>
									),
								)}

								{isExecuting ? (
									<article className="flex items-start gap-3.5">
										<AgentPixelAvatar
											profileId={agentProfileId}
											variantId={activeAvatarVariantId}
											expression="focus"
											size={56}
										/>
										<div className="min-w-0 flex-1">
											<div className="text-[10px] font-semibold uppercase tracking-[0.14em] [color:var(--text-muted)]">
												{agentShortName}
											</div>
											<div className="mt-1 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 [border-color:color-mix(in_srgb,var(--primary)_30%,var(--border))] [background:color-mix(in_srgb,var(--surface)_84%,transparent)]">
												<span className="suite-thinking-dot" />
												<span className="suite-thinking-dot" />
												<span className="suite-thinking-dot" />
												<span className="text-xs [color:var(--text-muted)]">
													{activeTaskName
														? `Working on ${activeTaskName}...`
														: "Thinking..."}
												</span>
											</div>
										</div>
									</article>
								) : null}
							</>
						) : (
							<div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-3xl border px-7 py-8 text-center [border-color:color-mix(in_srgb,var(--primary)_28%,var(--border))] [background:linear-gradient(155deg,color-mix(in_srgb,var(--surface)_92%,transparent),color-mix(in_srgb,var(--surface-2)_84%,transparent))] shadow-[var(--shadow-neon)]">
								<AgentPixelAvatar
									profileId={agentProfileId}
									variantId={activeAvatarVariantId}
									expression="neutral"
									size={90}
								/>
								<div className="text-lg font-semibold [color:var(--text)]">
									Ask {agentShortName}
								</div>
								<div className="text-sm leading-relaxed [color:var(--text-muted)]">
									Start with a direct question or choose a starter below.
								</div>
							</div>
						)}
					</div>
				</div>

				<div className="sticky bottom-0 border-t px-4 pb-4 pt-3 [border-color:color-mix(in_srgb,var(--primary)_24%,var(--border))] [background:linear-gradient(180deg,color-mix(in_srgb,var(--surface)_58%,transparent),color-mix(in_srgb,var(--surface)_90%,transparent))] backdrop-blur-xl">
					<div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
						{taskTemplates.map((template) => (
							<button
								key={template.id}
								type="button"
								onClick={() => setInputValue(template.prompt)}
								className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition [border-color:color-mix(in_srgb,var(--primary)_22%,var(--border))] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_11%,transparent)] hover:[color:var(--text)]"
								title="Insert template prompt"
							>
								{template.label}
							</button>
						))}
					</div>

					<div className="mx-auto flex w-full max-w-[920px] items-end gap-2">
						<textarea
							value={inputValue}
							onChange={(event) => setInputValue(event.target.value)}
							onKeyDown={handleComposerKeyDown}
							placeholder={`Message ${agentShortName}...`}
							className="max-h-[240px] min-h-[82px] flex-1 rounded-[22px] border px-4 py-3 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:color-mix(in_srgb,var(--primary)_30%,var(--border))] [background:linear-gradient(145deg,color-mix(in_srgb,var(--bg-base)_96%,transparent),color-mix(in_srgb,var(--surface)_96%,transparent))] [color:var(--text)]"
							disabled={isExecuting}
						/>
						<button
							type="button"
							onClick={() => void handleSend()}
							disabled={isExecuting || !inputValue.trim()}
							className="inline-flex h-12 items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 [border-color:color-mix(in_srgb,var(--primary)_42%,var(--border))] [background:linear-gradient(140deg,color-mix(in_srgb,var(--primary)_24%,transparent),color-mix(in_srgb,var(--surface)_90%,transparent))] [color:var(--text)] shadow-[0_10px_20px_color-mix(in_srgb,var(--primary)_14%,transparent)] hover:[background:color-mix(in_srgb,var(--primary)_30%,transparent)]"
						>
							<Send size={13} />
							{isExecuting ? "Working..." : "Send"}
						</button>
					</div>
				</div>
			</main>

			{showDetailsRail ? (
				<aside className="hidden min-h-0 flex-col [background:linear-gradient(165deg,color-mix(in_srgb,var(--surface)_82%,transparent),color-mix(in_srgb,var(--surface-2)_86%,transparent))] lg:flex">
					<div className="border-b px-4 py-3 [border-color:var(--border)]">
						<div className="text-xs uppercase tracking-[0.13em] [color:var(--text-muted)]">
							Status
						</div>
						<div className="mt-2 grid gap-1.5 text-xs [color:var(--text-muted)]">
							<div className="flex items-center justify-between">
								<span>Task</span>
								<span className="font-medium [color:var(--text)]">
									{activeTaskName || "None"}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span>State</span>
								<span
									className={`font-medium ${
										isExecuting
											? "[color:var(--warning)]"
											: "[color:var(--success)]"
									}`}
								>
									{isExecuting ? "Running" : "Idle"}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span>History</span>
								<span className="font-medium [color:var(--text)]">
									{history.length}
								</span>
							</div>
						</div>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto p-3.5">
						<div className="mb-2 flex items-center justify-between">
							<div className="text-xs uppercase tracking-[0.13em] [color:var(--text-muted)]">
								Recent Executions
							</div>
							{onClearHistory ? (
								<button
									type="button"
									onClick={onClearHistory}
									disabled={history.length === 0}
									className="text-xs [color:var(--text-muted)] disabled:opacity-50"
								>
									Clear
								</button>
							) : null}
						</div>

						<div className="space-y-1.5">
							{history.length === 0 ? (
								<div className="rounded-md px-2 py-2 text-xs [color:var(--text-muted)]">
									No executions yet.
								</div>
							) : (
								history.slice(0, 8).map((task) => (
									<button
										type="button"
										key={task.id}
										onClick={() => onSelectHistory?.(task.id)}
										className="w-full rounded-md px-2 py-2 text-left text-xs transition hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)]"
									>
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-semibold [color:var(--text)]">
												{task.name}
											</span>
											<span
												className={`text-[10px] ${
													task.status === "failed"
														? "[color:var(--danger)]"
														: task.status === "running"
															? "[color:var(--warning)]"
															: "[color:var(--success)]"
												}`}
											>
												{task.status}
											</span>
										</div>
										<div className="mt-1 [color:var(--text-muted)]">
											{new Date(task.executedAt).toLocaleString()}
										</div>
									</button>
								))
							)}
						</div>
					</div>
				</aside>
			) : null}
		</div>
	);
}

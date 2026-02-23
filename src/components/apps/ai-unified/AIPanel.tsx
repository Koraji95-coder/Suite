import { Brain, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	buildSystemPrompt,
	deleteConversation,
	deleteMemory,
	loadConversations,
	loadMemories,
	saveConversation,
	saveMemory,
	sendMessage,
} from "@/lib/ai/service";
import type { Conversation, Memory, Message } from "@/lib/ai/types";
import { logger } from "@/lib/errorLogger";
import { hexToRgba, useTheme } from "@/lib/palette";
import { agentTaskManager } from "@/services/agentTaskManager";
import { AgentTaskPanel } from "./AgentTaskPanel";
import { ChatArea } from "./ChatArea";
import { ConversationSidebar } from "./ConversationSidebar";
import { MemoryPanel } from "./MemoryPanel";
import { WelcomeScreen } from "./WelcomeScreen";

function generateId(): string {
	// Fallback for environments without crypto.randomUUID (older browsers)
	try {
		return crypto.randomUUID();
	} catch {
		// Fallback using crypto.getRandomValues if available, otherwise Math.random
		try {
			if (
				typeof window !== "undefined" &&
				window.crypto &&
				window.crypto.getRandomValues
			) {
				const arr = new Uint8Array(16);
				window.crypto.getRandomValues(arr);
				arr[6] = (arr[6] & 0x0f) | 0x40; // version 4
				arr[8] = (arr[8] & 0x3f) | 0x80; // variant 1
				return [
					Array.from(arr.slice(0, 4))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join(""),
					Array.from(arr.slice(4, 6))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join(""),
					Array.from(arr.slice(6, 8))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join(""),
					Array.from(arr.slice(8, 10))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join(""),
					Array.from(arr.slice(10, 16))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join(""),
				].join("-");
			}
		} catch {
			// continue to Math.random fallback
		}
		// Ultimate fallback: timestamp + random suffix
		return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
	}
}

export function AIPanel() {
	const { palette } = useTheme();
	const initialConversationRef = useRef<Conversation | null>(null);
	if (!initialConversationRef.current) {
		const now = new Date().toISOString();
		initialConversationRef.current = {
			id: generateId(),
			title: "New Chat",
			messages: [],
			created_at: now,
			updated_at: now,
		};
	}

	const [conversations, setConversations] = useState<Conversation[]>(() => [
		initialConversationRef.current!,
	]);
	const [selectedId, setSelectedId] = useState<string | null>(
		() => initialConversationRef.current!.id,
	);
	const [memories, setMemories] = useState<Memory[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
	const [taskPanelOpen, setTaskPanelOpen] = useState(false);
	const [isExecutingTask, setIsExecutingTask] = useState(false);

	const selectedConversation =
		conversations.find((c) => c.id === selectedId) ?? null;

	useEffect(() => {
		loadConversations()
			.then((loaded) => {
				if (loaded.length > 0) {
					setConversations(loaded);
					setSelectedId((current) => current ?? loaded[0].id);
				}
			})
			.catch((err) => {
				logger.error("AIPanel", "Failed to load conversations", { error: err });
			});

		loadMemories()
			.then(setMemories)
			.catch((err) => {
				logger.error("AIPanel", "Failed to load memories", { error: err });
			});
	}, []);

	const createNewConversation = useCallback((): Conversation => {
		const now = new Date().toISOString();
		const conv: Conversation = {
			id: generateId(),
			title: "New Chat",
			messages: [],
			created_at: now,
			updated_at: now,
		};
		setConversations((prev) => [conv, ...prev]);
		setSelectedId(conv.id);
		return conv;
	}, []);

	const handleSend = useCallback(
		async (text: string) => {
			let conv = selectedConversation;
			if (!conv) {
				conv = createNewConversation();
			}

			const userMsg: Message = {
				id: generateId(),
				role: "user",
				content: text,
				timestamp: new Date(),
			};

			const assistantMsg: Message = {
				id: generateId(),
				role: "assistant",
				content: "",
				timestamp: new Date(),
			};

			const updatedMessages = [...conv.messages, userMsg];
			const title =
				conv.messages.length === 0
					? text.slice(0, 50) + (text.length > 50 ? "..." : "")
					: conv.title;

			setConversations((prev) =>
				prev.map((c) =>
					c.id === conv!.id
						? {
								...c,
								messages: [...updatedMessages, assistantMsg],
								title,
								updated_at: new Date().toISOString(),
							}
						: c,
				),
			);
			if (!selectedId) setSelectedId(conv.id);

			setIsStreaming(true);

			const systemMsg: Message = {
				id: "system",
				role: "system",
				content: buildSystemPrompt(memories),
				timestamp: new Date(),
			};

			try {
				const fullResponse = await sendMessage(
					[systemMsg, ...updatedMessages],
					(chunk) => {
						assistantMsg.content += chunk;
						setConversations((prev) =>
							prev.map((c) =>
								c.id === conv!.id
									? {
											...c,
											messages: [...updatedMessages, { ...assistantMsg }],
											title,
											updated_at: new Date().toISOString(),
										}
									: c,
							),
						);
					},
				);

				assistantMsg.content = fullResponse;
				const finalConv: Conversation = {
					...conv,
					title,
					messages: [...updatedMessages, { ...assistantMsg }],
					updated_at: new Date().toISOString(),
				};

				setConversations((prev) =>
					prev.map((c) => (c.id === conv!.id ? finalConv : c)),
				);

				await saveConversation(finalConv);
			} catch (err) {
				logger.error("AIPanel", "Failed to send message", { error: err });
				setConversations((prev) =>
					prev.map((c) =>
						c.id === conv!.id ? { ...c, messages: [...updatedMessages] } : c,
					),
				);
			} finally {
				setIsStreaming(false);
			}
		},
		[selectedConversation, selectedId, createNewConversation, memories],
	);

	const handleDeleteConversation = useCallback(
		async (id: string) => {
			setConversations((prev) => prev.filter((c) => c.id !== id));
			if (selectedId === id) setSelectedId(null);
			await deleteConversation(id);
		},
		[selectedId],
	);

	const handleAddMemory = useCallback(async () => {
		const content = window.prompt("Enter memory content:");
		if (!content?.trim()) return;
		const mem = await saveMemory({
			memory_type: "knowledge",
			content: content.trim(),
			connections: [],
			strength: 50,
		});
		if (mem) setMemories((prev) => [mem, ...prev]);
	}, []);

	const handleDeleteMemory = useCallback(async (id: string) => {
		setMemories((prev) => prev.filter((m) => m.id !== id));
		await deleteMemory(id);
	}, []);

	const handleSuggestionClick = useCallback(
		async (text: string) => {
			const conv = createNewConversation();
			const userMsg: Message = {
				id: generateId(),
				role: "user",
				content: text,
				timestamp: new Date(),
			};
			const assistantMsg: Message = {
				id: generateId(),
				role: "assistant",
				content: "",
				timestamp: new Date(),
			};
			const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");

			setConversations((prev) =>
				prev.map((c) =>
					c.id === conv.id
						? {
								...c,
								messages: [userMsg, assistantMsg],
								title,
								updated_at: new Date().toISOString(),
							}
						: c,
				),
			);

			setIsStreaming(true);
			const systemMsg: Message = {
				id: "system",
				role: "system",
				content: buildSystemPrompt(memories),
				timestamp: new Date(),
			};

			try {
				const fullResponse = await sendMessage(
					[systemMsg, userMsg],
					(chunk) => {
						assistantMsg.content += chunk;
						setConversations((prev) =>
							prev.map((c) =>
								c.id === conv.id
									? {
											...c,
											messages: [userMsg, { ...assistantMsg }],
											title,
											updated_at: new Date().toISOString(),
										}
									: c,
							),
						);
					},
				);
				assistantMsg.content = fullResponse;
				const finalConv: Conversation = {
					...conv,
					title,
					messages: [userMsg, { ...assistantMsg }],
					updated_at: new Date().toISOString(),
				};
				setConversations((prev) =>
					prev.map((c) => (c.id === conv.id ? finalConv : c)),
				);
				await saveConversation(finalConv);
			} catch (err) {
				logger.error("AIPanel", "Failed to run suggestion", { error: err });
				setConversations((prev) =>
					prev.map((c) =>
						c.id === conv.id ? { ...c, messages: [userMsg] } : c,
					),
				);
			} finally {
				setIsStreaming(false);
			}
		},
		[createNewConversation, memories],
	);

	const handleExecuteAgentTask = useCallback(
		async (prompt: string, taskName: string) => {
			let conv = selectedConversation;
			if (!conv) {
				conv = createNewConversation();
			}

			// Create task record
			const taskRecord = agentTaskManager.createTaskRecord(
				"agent-task",
				prompt,
			);

			// User message with agent task marker
			const userMsg: Message = {
				id: generateId(),
				role: "user",
				content: `[Agent Task] ${taskName}\n\n${prompt}`,
				timestamp: new Date(),
			};

			const assistantMsg: Message = {
				id: generateId(),
				role: "assistant",
				content: "",
				timestamp: new Date(),
			};

			const updatedMessages = [...conv.messages, userMsg];
			const title = conv.messages.length === 0 ? taskName : conv.title;

			setConversations((prev) =>
				prev.map((c) =>
					c.id === conv!.id
						? {
								...c,
								messages: [...updatedMessages, assistantMsg],
								title,
								updated_at: new Date().toISOString(),
							}
						: c,
				),
			);
			if (!selectedId) setSelectedId(conv.id);

			setIsExecutingTask(true);
			setIsStreaming(true);

			const systemMsg: Message = {
				id: "system",
				role: "system",
				content: buildSystemPrompt(memories),
				timestamp: new Date(),
			};

			try {
				const fullResponse = await sendMessage(
					[systemMsg, ...updatedMessages],
					(chunk) => {
						assistantMsg.content += chunk;
						setConversations((prev) =>
							prev.map((c) =>
								c.id === conv!.id
									? {
											...c,
											messages: [...updatedMessages, { ...assistantMsg }],
											title,
											updated_at: new Date().toISOString(),
										}
									: c,
							),
						);
					},
				);

				assistantMsg.content = fullResponse;
				const finalConv: Conversation = {
					...conv,
					title,
					messages: [...updatedMessages, { ...assistantMsg }],
					updated_at: new Date().toISOString(),
				};

				setConversations((prev) =>
					prev.map((c) => (c.id === conv!.id ? finalConv : c)),
				);

				// Save conversation and task
				await saveConversation(finalConv);
				agentTaskManager.updateTaskResult(
					taskRecord.id,
					fullResponse,
					"complete",
				);
			} catch (err) {
				logger.error("AIPanel", "Failed to execute agent task", { error: err });
				setConversations((prev) =>
					prev.map((c) =>
						c.id === conv!.id ? { ...c, messages: [...updatedMessages] } : c,
					),
				);
				agentTaskManager.updateTaskResult(
					taskRecord.id,
					"",
					"failed",
					err instanceof Error ? err.message : "Unknown error",
				);
			} finally {
				setIsExecutingTask(false);
				setIsStreaming(false);
			}
		},
		[selectedConversation, selectedId, createNewConversation, memories],
	);

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				background: palette.background,
				color: palette.text,
			}}
		>
			<div
				style={{
					height: 48,
					minHeight: 48,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "0 16px",
					borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
					background: palette.surface,
				}}
			>
				<span style={{ fontSize: 14, fontWeight: 600 }}>
					{selectedConversation ? selectedConversation.title : "AI Assistant"}
				</span>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						onClick={() => setTaskPanelOpen((v) => !v)}
						style={{
							background: taskPanelOpen
								? hexToRgba(palette.primary, 0.15)
								: "transparent",
							border: taskPanelOpen
								? `1px solid ${hexToRgba(palette.primary, 0.25)}`
								: "1px solid transparent",
							borderRadius: 8,
							padding: "6px 10px",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: 6,
							color: taskPanelOpen ? palette.primary : palette.textMuted,
							fontSize: 12,
							fontWeight: 500,
							transition: "all 0.2s ease",
						}}
						title="Open agent task menu"
					>
						<Zap size={15} />
						Agent
					</button>
					<button
						onClick={() => setMemoryPanelOpen((v) => !v)}
						style={{
							background: memoryPanelOpen
								? hexToRgba(palette.primary, 0.15)
								: "transparent",
							border: memoryPanelOpen
								? `1px solid ${hexToRgba(palette.primary, 0.25)}`
								: "1px solid transparent",
							borderRadius: 8,
							padding: "6px 10px",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: 6,
							color: memoryPanelOpen ? palette.primary : palette.textMuted,
							fontSize: 12,
							fontWeight: 500,
							transition: "all 0.2s ease",
						}}
					>
						<Brain size={15} />
						Memory
					</button>
				</div>
			</div>

			<div style={{ flex: 1, display: "flex", minHeight: 0 }}>
				<ConversationSidebar
					conversations={conversations}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onNew={createNewConversation}
					onDelete={handleDeleteConversation}
				/>

				{selectedConversation ? (
					<ChatArea
						messages={selectedConversation.messages}
						onSend={handleSend}
						isStreaming={isStreaming}
					/>
				) : (
					<WelcomeScreen onSuggestionClick={handleSuggestionClick} />
				)}

				{taskPanelOpen && (
					<div
						style={{
							width: 320,
							borderLeft: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
							display: "flex",
							flexDirection: "column",
						}}
					>
						<AgentTaskPanel
							onExecuteTask={handleExecuteAgentTask}
							isExecuting={isExecutingTask}
						/>
					</div>
				)}

				{memoryPanelOpen && (
					<MemoryPanel
						memories={memories}
						onAdd={handleAddMemory}
						onDelete={handleDeleteMemory}
					/>
				)}
			</div>
		</div>
	);
}

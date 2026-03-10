// src/components/agent/AgentChatComposer.tsx
import { ArrowUp, Mic, Paperclip, Sparkles, Square } from "lucide-react";
import { useId, useRef, useState } from "react";
// Primitives
import { Button, IconButton } from "@/components/primitives/Button";
import { HStack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import styles from "./AgentChatComposer.module.css";
import type { TaskTemplate } from "./agentTaskTemplates";

export type AgentComposerMode = "direct" | "run";

interface AgentChatComposerProps {
	onSend: (message: string) => void;
	disabled?: boolean;
	isStreaming?: boolean;
	onCancel?: () => void;
	templates?: TaskTemplate[];
	mode?: AgentComposerMode;
	onModeChange?: (mode: AgentComposerMode) => void;
	runModeDisabled?: boolean;
}

export function AgentChatComposer({
	onSend,
	disabled = false,
	isStreaming = false,
	onCancel,
	templates = [],
	mode = "direct",
	onModeChange,
	runModeDisabled = false,
}: AgentChatComposerProps) {
	const [value, setValue] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const messageInputId = useId();

	const handleSubmit = () => {
		const msg = value.trim();
		if (!msg || disabled) return;
		onSend(msg);
		setValue("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleInput = () => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	};

	const handleTemplateClick = (prompt: string) => {
		setValue(prompt);
		textareaRef.current?.focus();
	};

	const canSend = value.trim().length > 0 && !disabled;
	const showTemplates = mode === "direct" && templates.length > 0 && !value;
	const isDirectMode = mode === "direct";
	const runModeBlocked = runModeDisabled && mode === "run";

	return (
		<div className={styles.root}>
			<div className={styles.modeRow}>
				<button
					type="button"
					className={cn(
						styles.modeButton,
						isDirectMode ? styles.modeButtonActive : styles.modeButtonIdle,
					)}
					onClick={() => onModeChange?.("direct")}
				>
					Direct chat
				</button>
				<button
					type="button"
					className={cn(
						styles.modeButton,
						!isDirectMode ? styles.modeButtonActive : styles.modeButtonIdle,
					)}
					onClick={() => onModeChange?.("run")}
					disabled={runModeDisabled}
				>
					Run objective
				</button>
			</div>

			{/* Template suggestions */}
			{showTemplates && (
				<div className={styles.templatesWrap}>
					<Text size="xs" color="muted" className={styles.templatesLabel}>
						Quick prompts
					</Text>
					<div className={styles.templatesRow}>
						{templates.map((t) => (
							<Button
								key={t.label}
								variant="outline"
								size="sm"
								onClick={() => handleTemplateClick(t.prompt)}
								iconLeft={<Sparkles size={12} />}
								className={styles.templateButton}
							>
								{t.label}
							</Button>
						))}
					</div>
				</div>
			)}

			{/* Input area */}
			<div
				className={cn(
					styles.composerCard,
					isFocused ? styles.composerCardFocused : styles.composerCardIdle,
					disabled && styles.composerCardDisabled,
				)}
			>
				{/* Textarea */}
				<div className={styles.textareaWrap}>
					<textarea
						id={messageInputId}
						name="agent_message"
						ref={textareaRef}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onInput={handleInput}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						placeholder={
							disabled
								? isStreaming
									? "Generating response..."
									: "Connecting to agent..."
								: isDirectMode
									? "Message the agent..."
									: "Describe the objective for your multi-agent run..."
						}
						disabled={disabled}
						rows={1}
						className={styles.textarea}
						style={{ maxHeight: 160 }}
					/>
				</div>

				{/* Bottom toolbar */}
				<div className={styles.toolbar}>
					{/* Left actions */}
					<HStack gap={1}>
						<IconButton
							icon={<Paperclip size={16} />}
							aria-label="Attach file"
							variant="ghost"
							size="sm"
							disabled={disabled}
							className={styles.toolbarIconButton}
						/>
						<IconButton
							icon={<Mic size={16} />}
							aria-label="Voice input"
							variant="ghost"
							size="sm"
							disabled={disabled}
							className={styles.toolbarIconButton}
						/>
					</HStack>

					{/* Right actions */}
					<HStack gap={2} align="center">
						{value.length > 0 && (
							<Text size="xs" color="muted">
								{value.length} chars
							</Text>
						)}

						{isStreaming && isDirectMode ? (
							<button
								type="button"
								onClick={() => onCancel?.()}
								disabled={!onCancel}
								className={cn(styles.sendButton, styles.stopButtonReady)}
							>
								<Square size={14} strokeWidth={2.2} />
							</button>
						) : (
							<button
								type="button"
								onClick={handleSubmit}
								disabled={!canSend || runModeBlocked}
								className={cn(
									styles.sendButton,
									canSend && !runModeBlocked
										? styles.sendButtonReady
										: styles.sendButtonDisabled,
								)}
							>
								<ArrowUp size={16} strokeWidth={2.5} />
							</button>
						)}
					</HStack>
				</div>
			</div>

			{/* Hint text */}
			<Text size="xs" color="muted" align="center" className={styles.hint}>
				Press <kbd className={styles.hintKey}>Enter</kbd> to{" "}
				{isDirectMode ? "send chat" : "start run"},{" "}
				<kbd className={styles.hintKey}>Shift + Enter</kbd> for new line
			</Text>
		</div>
	);
}

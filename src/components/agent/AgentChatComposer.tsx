// src/components/agent/AgentChatComposer.tsx
import { ArrowUp, Mic, Paperclip, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
// Primitives
import { Button, IconButton } from "@/components/primitives/Button";
import { HStack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import styles from "./AgentChatComposer.module.css";
import type { TaskTemplate } from "./agentTaskTemplates";

interface AgentChatComposerProps {
	onSend: (message: string) => void;
	disabled?: boolean;
	templates?: TaskTemplate[];
}

export function AgentChatComposer({
	onSend,
	disabled = false,
	templates = [],
}: AgentChatComposerProps) {
	const [value, setValue] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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

	return (
		<div className={styles.root}>
			{/* Template suggestions */}
			{templates.length > 0 && !value && (
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
						ref={textareaRef}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onInput={handleInput}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						placeholder={
							disabled ? "Connecting to agent..." : "Message the agent..."
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

						<button
							type="button"
							onClick={handleSubmit}
							disabled={!canSend}
							className={cn(
								styles.sendButton,
								canSend ? styles.sendButtonReady : styles.sendButtonDisabled,
							)}
						>
							<ArrowUp size={16} strokeWidth={2.5} />
						</button>
					</HStack>
				</div>
			</div>

			{/* Hint text */}
			<Text size="xs" color="muted" align="center" className={styles.hint}>
				Press <kbd className={styles.hintKey}>Enter</kbd> to send,{" "}
				<kbd className={styles.hintKey}>Shift + Enter</kbd> for new line
			</Text>
		</div>
	);
}

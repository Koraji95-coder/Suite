import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
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
	const { palette } = useTheme();
	const [value, setValue] = useState("");
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
		<div
			className="border-t px-4 py-3"
			style={{
				borderColor: hexToRgba(palette.text, 0.06),
				background: hexToRgba(palette.background, 0.8),
				backdropFilter: "blur(20px)",
				WebkitBackdropFilter: "blur(20px)",
			}}
		>
			{templates.length > 0 && !value && (
				<div className="mb-2 flex gap-2 overflow-x-auto pb-1">
					{templates.map((t) => (
						<button
							key={t.label}
							type="button"
							onClick={() => handleTemplateClick(t.prompt)}
							className="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
							style={{
								background: hexToRgba(palette.primary, 0.08),
								color: palette.primary,
								border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = hexToRgba(palette.primary, 0.16);
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = hexToRgba(palette.primary, 0.08);
							}}
						>
							{t.label}
						</button>
					))}
				</div>
			)}

			<div className="flex items-end gap-2">
				<div
					className="flex-1 rounded-2xl border px-4 py-2.5"
					style={{
						background: palette.surface,
						borderColor: hexToRgba(palette.text, 0.08),
					}}
				>
					<textarea
						ref={textareaRef}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onInput={handleInput}
						placeholder="Send a message..."
						disabled={disabled}
						rows={1}
						className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
						style={{
							color: palette.text,
							maxHeight: 160,
						}}
					/>
				</div>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!canSend}
					className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all"
					style={{
						background: canSend ? palette.primary : hexToRgba(palette.text, 0.08),
						color: canSend ? palette.background : hexToRgba(palette.text, 0.3),
						opacity: canSend ? 1 : 0.6,
					}}
				>
					<ArrowUp size={18} strokeWidth={2.5} />
				</button>
			</div>
		</div>
	);
}

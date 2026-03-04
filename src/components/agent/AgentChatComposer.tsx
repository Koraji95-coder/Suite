// src/components/agent/AgentChatComposer.tsx
import { ArrowUp, Paperclip, Sparkles, Mic } from "lucide-react";
import { useRef, useState } from "react";
import type { TaskTemplate } from "./agentTaskTemplates";

// Primitives
import { Button, IconButton } from "@/components/primitives/Button";
import { HStack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";

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
    <div className="border-t border-border bg-linear-to-t from-bg to-bg/80 backdrop-blur-xl px-4 py-4">
      {/* Template suggestions */}
      {templates.length > 0 && !value && (
        <div className="mb-3">
          <Text size="xs" color="muted" className="mb-2 px-1">
            Quick prompts
          </Text>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {templates.map((t) => (
              <Button
                key={t.label}
                variant="outline"
                size="sm"
                onClick={() => handleTemplateClick(t.prompt)}
                iconLeft={<Sparkles size={12} />}
                className="shrink-0 whitespace-nowrap"
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div 
        className={`
          relative rounded-2xl border bg-surface transition-all duration-200
          ${isFocused 
            ? "border-primary shadow-[0_0_0_3px_var(--primary)/15]" 
            : "border-border hover:border-border-strong"
          }
          ${disabled ? "opacity-60" : ""}
        `}
      >
        {/* Textarea */}
        <div className="px-4 py-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={disabled ? "Connecting to agent..." : "Message the agent..."}
            disabled={disabled}
            rows={1}
            className="
              w-full resize-none bg-transparent text-sm leading-relaxed 
              text-text placeholder:text-text-muted/50 outline-none 
              disabled:cursor-not-allowed
            "
            style={{ maxHeight: 160 }}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between border-t border-border/50 px-2 py-2">
          {/* Left actions */}
          <HStack gap={1}>
            <IconButton
              icon={<Paperclip size={16} />}
              aria-label="Attach file"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="text-text-muted hover:text-text"
            />
            <IconButton
              icon={<Mic size={16} />}
              aria-label="Voice input"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="text-text-muted hover:text-text"
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
              className={`
                flex h-8 w-8 items-center justify-center rounded-xl
                transition-all duration-150
                ${canSend 
                  ? "bg-primary text-primary-contrast hover:brightness-110 active:scale-95 shadow-md shadow-primary/25" 
                  : "bg-surface-2 text-text-muted cursor-not-allowed"
                }
              `}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </HStack>
        </div>
      </div>

      {/* Hint text */}
      <Text size="xs" color="muted" align="center" className="mt-2">
        Press <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-text-muted font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-text-muted font-mono text-[10px]">Shift + Enter</kbd> for new line
      </Text>
    </div>
  );
}
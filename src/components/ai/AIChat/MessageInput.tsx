import { Send } from 'lucide-react';
import { useRef, useEffect } from 'react';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "Ask me anything about electrical engineering...",
}: MessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-4 border-t border-orange-500/30">
      <div className="flex items-end space-x-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-black/50 border border-orange-500/30 rounded-lg px-4 py-3 text-white/90 placeholder-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className="p-3 bg-gradient-to-br from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:from-gray-600 disabled:to-gray-700 rounded-lg transition-all disabled:opacity-50"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
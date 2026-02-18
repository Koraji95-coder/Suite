import { Bot } from 'lucide-react';
import { Message } from '../aitypes';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg p-4 ${
          isUser
            ? 'bg-gradient-to-br from-cyan-600/30 to-teal-600/30 border border-orange-500/40'
            : 'bg-black/40 border border-orange-500/30'
        }`}
      >
        <div className="flex items-start space-x-2">
          {!isUser && (
            <Bot className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="text-white/90 whitespace-pre-wrap">{message.content}</p>
            {message.timestamp && !isStreaming && (
              <p className="text-xs text-orange-400/50 mt-2">
                {new Date(message.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
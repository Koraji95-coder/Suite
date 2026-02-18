import { useRef, useEffect } from 'react';
import { Message } from '../aitypes';
import { MessageBubble } from './MessageBubble';
import { Bot, Loader } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  streamingMessage: string;
}

export function MessageList({ messages, isTyping, streamingMessage }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  if (messages.length === 0 && !isTyping) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Bot className="w-16 h-16 text-orange-400 mx-auto" />
          <h4 className="text-xl font-bold text-white/80">How can I help you today?</h4>
          <p className="text-white/50 max-w-md">
            I'm an AI assistant specialized in electrical engineering. Ask me about power systems,
            calculations, standards, or anything related to your work!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <MessageBubble key={index} message={message} />
      ))}

      {isTyping && streamingMessage && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-lg p-4 bg-black/40 border border-orange-500/30">
            <div className="flex items-start space-x-2">
              <Bot className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-white/90 whitespace-pre-wrap">{streamingMessage}</p>
                <Loader className="w-4 h-4 text-orange-400 animate-spin mt-2" />
              </div>
            </div>
          </div>
        </div>
      )}

      {isTyping && !streamingMessage && (
        <div className="flex justify-start">
          <div className="rounded-lg p-4 bg-black/40 border border-orange-500/30">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-orange-400" />
              <Loader className="w-4 h-4 text-orange-400 animate-spin" />
              <span className="text-orange-300 text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
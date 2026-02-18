import { useState, useEffect } from 'react';
import { aiService } from '../aiService';
import { Message, ConversationContext, SavedConversation } from '../aitypes';
import { AIChatHeader } from './AIChatHeader';
import { AIChatSettings } from './AIChatSettings';
import { AIChatConversationList } from './AIChatConversationList';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  context: ConversationContext;
}

export function AIChat({ isOpen, onClose, context }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('llama3.2');
  const [showSettings, setShowSettings] = useState(false);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [showConversations, setShowConversations] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkConnection();
      loadConversations();
    }
  }, [isOpen]);

  const checkConnection = async () => {
    setIsConnected(null);
    const connected = await aiService.checkOllamaConnection();
    setIsConnected(connected);

    if (connected) {
      const models = await aiService.listAvailableModels();
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(selectedModel)) {
        setSelectedModel(models[0]);
        aiService.setModel(models[0]);
      }
    }
  };

  const loadConversations = async () => {
    const convs = await aiService.listConversations();
    setConversations(convs);
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping || !isConnected) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);
    setStreamingMessage('');

    try {
      let fullResponse = '';
      await aiService.chat(
        newMessages,
        context,
        (chunk) => {
          fullResponse += chunk;
          setStreamingMessage(fullResponse);
        }
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);
      setStreamingMessage('');

      await aiService.saveConversation(finalMessages, context);
      await loadConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please make sure Ollama is running on your local machine (http://localhost:11434).',
        timestamp: new Date().toISOString(),
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setIsTyping(false);
      setStreamingMessage('');
    }
  };

  const clearConversation = () => {
    if (confirm('Clear current conversation?')) {
      setMessages([]);
      aiService.newConversation();
    }
  };

  const loadConversation = async (id: string) => {
    const msgs = await aiService.loadConversation(id);
    setMessages(msgs);
    setShowConversations(false);
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      await aiService.deleteConversation(id);
      await loadConversations();
    }
  };

  const changeModel = (model: string) => {
    setSelectedModel(model);
    aiService.setModel(model);
    setShowSettings(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] backdrop-blur-xl border border-orange-500/30 rounded-lg w-full max-w-6xl h-[90vh] flex flex-col">
        <AIChatHeader
          panelContext={context.panelContext}
          isConnected={isConnected}
          onClose={onClose}
          onToggleConversations={() => setShowConversations(!showConversations)}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onNewConversation={clearConversation}
          showConversations={showConversations}
          showSettings={showSettings}
        />

        {showSettings && (
          <AIChatSettings
            availableModels={availableModels}
            selectedModel={selectedModel}
            onModelChange={changeModel}
            onRefresh={checkConnection}
            isConnected={isConnected}
          />
        )}

        {showConversations && (
          <AIChatConversationList
            conversations={conversations}
            onLoad={loadConversation}
            onDelete={deleteConversation}
          />
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <MessageList
            messages={messages}
            isTyping={isTyping}
            streamingMessage={streamingMessage}
          />
        </div>

        <MessageInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={!isConnected || isTyping}
        />
      </div>
    </div>
  );
}
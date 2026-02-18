import { Bot, X, MessageSquare, Settings as SettingsIcon, Plus } from 'lucide-react';

interface AIChatHeaderProps {
  panelContext: string;
  isConnected: boolean | null;
  onClose: () => void;
  onToggleConversations: () => void;
  onToggleSettings: () => void;
  onNewConversation: () => void;
  showConversations: boolean;
  showSettings: boolean;
}

export function AIChatHeader({
  panelContext,
  isConnected,
  onClose,
  onToggleConversations,
  onToggleSettings,
  onNewConversation,
  showConversations,
  showSettings,
}: AIChatHeaderProps) {
  return (
    <div className="flex items-center justify-between p-6 border-b border-orange-500/30">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-lg">
            <Bot className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white/80">AI Assistant</h3>
            <p className="text-sm text-orange-400/70">{panelContext}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg border ${
            isConnected === true
              ? 'bg-green-500/20 border-green-500/40'
              : isConnected === false
              ? 'bg-red-500/20 border-red-500/40'
              : 'bg-yellow-500/20 border-yellow-500/40'
          }`}>
            {isConnected === true && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
            {isConnected === false && <span className="w-2 h-2 bg-red-400 rounded-full" />}
            {isConnected === null && <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />}
            <span className="text-xs font-medium">
              {isConnected === true ? 'Connected' : isConnected === false ? 'Disconnected' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={onToggleConversations}
          className={`p-2 rounded-lg transition-all ${
            showConversations ? 'bg-orange-500/30' : 'hover:bg-orange-500/20'
          }`}
          title="Conversation History"
        >
          <MessageSquare className="w-5 h-5 text-orange-400" />
        </button>

        <button
          onClick={onToggleSettings}
          className={`p-2 rounded-lg transition-all ${
            showSettings ? 'bg-orange-500/30' : 'hover:bg-orange-500/20'
          }`}
          title="Settings"
        >
          <SettingsIcon className="w-5 h-5 text-orange-400" />
        </button>

        <button
          onClick={onNewConversation}
          className="p-2 hover:bg-orange-500/20 rounded-lg transition-all"
          title="New Conversation"
        >
          <Plus className="w-5 h-5 text-orange-400" />
        </button>

        <button
          onClick={onClose}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
        >
          <X className="w-5 h-5 text-red-400" />
        </button>
      </div>
    </div>
  );
}
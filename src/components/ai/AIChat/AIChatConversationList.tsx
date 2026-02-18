import { Trash2 } from 'lucide-react';
import { SavedConversation } from '../aitypes';
import { formatDate } from '../aiutils';

interface AIChatConversationListProps {
  conversations: SavedConversation[];
  onLoad: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export function AIChatConversationList({
  conversations,
  onLoad,
  onDelete,
}: AIChatConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="p-4 border-b border-orange-500/30 bg-black/30">
        <h4 className="text-orange-300 font-semibold mb-2">Recent Conversations</h4>
        <p className="text-orange-400/50 text-sm">No saved conversations</p>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-orange-500/30 bg-black/30 max-h-48 overflow-y-auto">
      <h4 className="text-orange-300 font-semibold mb-2">Recent Conversations</h4>
      <div className="space-y-2">
        {conversations.map(conv => (
          <div
            key={conv.id}
            onClick={() => onLoad(conv.id)}
            className="flex items-center justify-between p-2 bg-black/40 border border-orange-500/20 rounded-lg hover:border-orange-500/40 cursor-pointer transition-all"
          >
            <div className="flex-1">
              <p className="text-white/80 text-sm">{conv.panel_context}</p>
              <p className="text-orange-400/60 text-xs">{formatDate(conv.updated_at)}</p>
            </div>
            <button
              onClick={(e) => onDelete(conv.id, e)}
              className="p-1 hover:bg-red-500/20 rounded transition-all"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
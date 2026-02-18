import { Calendar, Eye, Trash2, Tag } from 'lucide-react';
import { SavedWhiteboard } from '../whiteboardtypes';
import { formatDate, getInitials } from '../whiteboardutils';

interface WhiteboardCardProps {
  whiteboard: SavedWhiteboard;
  onView: (whiteboard: SavedWhiteboard) => void;
  onDelete: (id: string) => void;
}

export function WhiteboardCard({ whiteboard, onView, onDelete }: WhiteboardCardProps) {
  return (
    <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg overflow-hidden hover:border-orange-400/50 transition-all">
      <div className="relative group">
        {whiteboard.thumbnail_url ? (
          <img
            src={whiteboard.thumbnail_url}
            alt={whiteboard.title}
            className="w-full h-48 object-cover bg-black"
          />
        ) : (
          <div className="w-full h-48 bg-black flex items-center justify-center">
            <span className="text-4xl font-bold text-orange-400/30">
              {getInitials(whiteboard.title)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
          <button
            onClick={() => onView(whiteboard)}
            className="p-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
            title="View"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button
            onClick={() => onDelete(whiteboard.id)}
            className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-100 transition-all"
            title="Delete"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-lg font-bold text-white/90 mb-2 truncate">{whiteboard.title}</h3>

        <div className="flex items-center space-x-2 text-xs text-white/50 mb-3">
          <Calendar className="w-3 h-3" />
          <span>{formatDate(whiteboard.created_at)}</span>
          <span>•</span>
          <span className="px-2 py-0.5 bg-orange-500/20 rounded">{whiteboard.panel_context}</span>
        </div>

        {whiteboard.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {whiteboard.tags.map((tag, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 bg-orange-500/10 text-orange-300 rounded-full border border-orange-500/30 flex items-center space-x-1"
              >
                <Tag className="w-3 h-3" />
                <span>{tag}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
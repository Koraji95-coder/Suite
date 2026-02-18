import { Trash2 } from 'lucide-react';
import { Memory } from '../aitypes';
import { formatDate, getMemoryTypeBgClass } from '../aiutils';

interface MemoryDetailProps {
  memory: Memory;
  onDelete: (id: string) => void;
}

export function MemoryDetail({ memory, onDelete }: MemoryDetailProps) {
  return (
    <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-lg font-bold text-white/80">Selected Memory</h4>
        <button
          onClick={() => onDelete(memory.id)}
          className="p-1 hover:bg-red-500/20 rounded transition-all"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-0.5 text-xs rounded-full ${getMemoryTypeBgClass(memory.memory_type)}`}>
            {memory.memory_type}
          </span>
          <span className="text-sm text-white/90">Strength: {memory.strength}/100</span>
        </div>
        {memory.content?.title && (
          <p className="text-sm">
            <span className="text-white/60 font-semibold">Title:</span>{' '}
            <span className="text-white/90">{memory.content.title}</span>
          </p>
        )}
        {memory.content?.description && (
          <p className="text-sm text-white/80">{memory.content.description}</p>
        )}
        <p className="text-xs text-white/40">
          Created: {formatDate(memory.created_at)}
        </p>
        {memory.connections.length > 0 && (
          <p className="text-xs text-white/40">
            Connections: {memory.connections.length}
          </p>
        )}
      </div>
    </div>
  );
}
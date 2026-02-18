import { Memory } from '../aitypes';
import { getMemoryTypeBgClass } from '../aiutils';

interface MemoryListProps {
  memories: Memory[];
  selectedMemory: Memory | null;
  onSelect: (memory: Memory) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: string;
  onFilterChange: (value: string) => void;
}

export function MemoryList({
  memories,
  selectedMemory,
  onSelect,
  searchTerm,
  onSearchChange,
  filterType,
  onFilterChange,
}: MemoryListProps) {
  const filteredMemories = memories.filter(m =>
    (filterType === 'all' || m.memory_type === filterType) &&
    (m.content?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     m.content?.description?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-4 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-lg font-bold text-white/80">All Memories</h4>
        <div className="flex items-center space-x-2">
          <select
            value={filterType}
            onChange={(e) => onFilterChange(e.target.value)}
            className="px-2 py-1 text-xs bg-black/50 border border-orange-500/30 rounded text-white/90"
          >
            <option value="all">All</option>
            <option value="preference">Preference</option>
            <option value="knowledge">Knowledge</option>
            <option value="pattern">Pattern</option>
            <option value="relationship">Relationship</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {filteredMemories.map(memory => (
          <div
            key={memory.id}
            onClick={() => onSelect(memory)}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedMemory?.id === memory.id
                ? 'bg-orange-500/20 border-orange-500/50'
                : 'bg-black/30 border-orange-500/20 hover:border-orange-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${getMemoryTypeBgClass(memory.memory_type)}`} />
                <span className="text-white/90 text-sm font-medium">
                  {memory.content?.title || memory.memory_type}
                </span>
              </div>
              <span className="text-orange-400/60 text-xs">{memory.strength}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
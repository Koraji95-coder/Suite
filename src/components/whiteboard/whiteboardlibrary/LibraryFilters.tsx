import { Search, Filter, Tag } from 'lucide-react';

interface LibraryFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedPanel: string;
  onPanelChange: (panel: string) => void;
  panels: string[];
  selectedTag: string;
  onTagChange: (tag: string) => void;
  tags: string[];
  totalCount: number;
  filteredCount: number;
  hidePanelFilter?: boolean;
}

export function LibraryFilters({
  searchTerm,
  onSearchChange,
  selectedPanel,
  onPanelChange,
  panels,
  selectedTag,
  onTagChange,
  tags,
  totalCount,
  filteredCount,
  hidePanelFilter = false,
}: LibraryFiltersProps) {
  return (
    <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search whiteboards..."
            className="w-full pl-10 bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {!hidePanelFilter && (
          <div>
            <select
              value={selectedPanel}
              onChange={(e) => onPanelChange(e.target.value)}
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {panels.map(panel => (
                <option key={panel} value={panel}>
                  {panel === 'all' ? 'All Panels' : panel}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <select
            value={selectedTag}
            onChange={(e) => onTagChange(e.target.value)}
            className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {tags.map(tag => (
              <option key={tag} value={tag}>
                {tag === 'all' ? 'All Tags' : tag}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-orange-300 text-sm flex items-center space-x-4">
        <span>Total: {totalCount}</span>
        <span>Filtered: {filteredCount}</span>
        {!hidePanelFilter && selectedPanel !== 'all' && (
          <span className="flex items-center space-x-1">
            <Filter className="w-3 h-3" /> Panel: {selectedPanel}
          </span>
        )}
        {selectedTag !== 'all' && (
          <span className="flex items-center space-x-1">
            <Tag className="w-3 h-3" /> Tag: {selectedTag}
          </span>
        )}
      </div>
    </div>
  );
}
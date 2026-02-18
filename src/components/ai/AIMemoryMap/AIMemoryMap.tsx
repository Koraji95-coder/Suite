import { useState, useEffect } from 'react';
import { Brain, Plus, Search } from 'lucide-react';
import { aiService } from '../aiService';
import { supabase } from '../../../lib/supabase';
import { Memory } from '../aitypes';
import { MemoryCanvas } from './MemoryCanvas';
import { MemoryList } from './MemoryList';
import { MemoryDetail } from './MemoryDetail';
import { AddMemoryModal } from './AddMemoryModal';

export function AIMemoryMap() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadMemories();
  }, [filterType]);

  const loadMemories = async () => {
    const type = filterType === 'all' ? undefined : filterType as any;
    const mems = await aiService.getMemories(type);
    setMemories(mems);
  };

  const addMemory = async (formData: any) => {
    await aiService.saveMemory(
      formData.type,
      { title: formData.title, description: formData.description },
      [],
      parseInt(formData.strength)
    );
    setShowAddModal(false);
    loadMemories();
  };

  const deleteMemory = async (id: string) => {
    if (!confirm('Delete this memory?')) return;
    const { error } = await supabase.from('ai_memory').delete().eq('id', id);
    if (!error) {
      loadMemories();
      if (selectedMemory?.id === id) setSelectedMemory(null);
    }
  };

  const filteredCount = memories.filter(m =>
    (filterType === 'all' || m.memory_type === filterType) &&
    (m.content?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     m.content?.description?.toLowerCase().includes(searchTerm.toLowerCase()))
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-lg">
            <Brain className="w-8 h-8 text-orange-400" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white/80">AI Memory Map</h2>
            <p className="text-orange-400/70">Visualize and manage AI learned memories</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-orange-500/50 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>Add Memory</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white/80">Mind Map</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-orange-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search memories..."
                className="pl-10 pr-4 py-2 bg-black/50 border border-orange-500/30 rounded-lg text-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <MemoryCanvas
            memories={memories}
            selectedMemory={selectedMemory}
            onNodeClick={setSelectedMemory}
          />

          <div className="mt-4 flex items-center justify-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-orange-300">Preference</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-blue-500"></div>
              <span className="text-orange-300">Knowledge</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
              <span className="text-orange-300">Pattern</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-pink-500"></div>
              <span className="text-orange-300">Relationship</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-4">
            <div className="text-orange-300 text-sm mb-4">
              <p>Total Memories: {memories.length}</p>
              <p>Filtered: {filteredCount}</p>
            </div>

            {selectedMemory && (
              <MemoryDetail memory={selectedMemory} onDelete={deleteMemory} />
            )}
          </div>

          <MemoryList
            memories={memories}
            selectedMemory={selectedMemory}
            onSelect={setSelectedMemory}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filterType={filterType}
            onFilterChange={setFilterType}
          />
        </div>
      </div>

      <AddMemoryModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addMemory}
      />
    </div>
  );
}
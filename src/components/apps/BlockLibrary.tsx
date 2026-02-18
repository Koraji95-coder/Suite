import { useState, useEffect } from 'react';
import { Package, Upload, Search, Star, Grid, List, Eye, Trash2, Download, Tag, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BlockFile {
  id: string;
  name: string;
  file_path: string;
  thumbnail_url: string | null;
  category: string;
  tags: string[];
  is_dynamic: boolean;
  dynamic_variations: any[];
  attributes: any;
  views: any;
  file_size: number;
  usage_count: number;
  is_favorite: boolean;
  created_at: string;
  last_used: string | null;
}

export function BlockLibrary() {
  const [blocks, setBlocks] = useState<BlockFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<BlockFile | null>(null);
  const [uploadForm, setUploadForm] = useState({
    name: '',
    category: 'electrical',
    tags: '',
    is_dynamic: false,
  });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['electrical']));

  useEffect(() => {
    loadBlocks();
  }, []);

  const loadBlocks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('block_library')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setBlocks(data);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;
    setIsUploading(true);

    try {
      const { error } = await supabase
        .from('block_library')
        .insert({
          name: uploadForm.name,
          file_path: `/blocks/${uploadForm.name}.dwg`,
          category: uploadForm.category,
          tags: uploadForm.tags.split(',').map(t => t.trim()).filter(t => t),
          is_dynamic: uploadForm.is_dynamic,
          file_size: Math.floor(Math.random() * 1000000) + 50000,
          usage_count: 0,
          is_favorite: false,
        });

      if (!error) {
        await loadBlocks();
        setShowUploadModal(false);
        setUploadForm({ name: '', category: 'electrical', tags: '', is_dynamic: false });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const deleteBlock = async (id: string) => {
    if (!confirm('Delete this block?')) return;

    const { error } = await supabase.from('block_library').delete().eq('id', id);

    if (!error) {
      setBlocks(blocks.filter(b => b.id !== id));
      if (selectedBlock?.id === id) {
        setSelectedBlock(null);
      }
    }
  };

  const toggleFavorite = async (block: BlockFile) => {
    const { error } = await supabase
      .from('block_library')
      .update({ is_favorite: !block.is_favorite })
      .eq('id', block.id);

    if (!error) {
      setBlocks(blocks.map(b => b.id === block.id ? { ...b, is_favorite: !b.is_favorite } : b));
    }
  };

  const categories = ['all', ...Array.from(new Set(blocks.map(b => b.category)))];
  const allTags = ['all', ...Array.from(new Set(blocks.flatMap(b => b.tags)))];

  const filteredBlocks = blocks.filter(block => {
    const matchesSearch = block.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      block.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || block.category === selectedCategory;
    const matchesTag = selectedTag === 'all' || block.tags.includes(selectedTag);

    return matchesSearch && matchesCategory && matchesTag;
  });

  const blocksByCategory = filteredBlocks.reduce((acc, block) => {
    if (!acc[block.category]) {
      acc[block.category] = [];
    }
    acc[block.category].push(block);
    return acc;
  }, {} as Record<string, BlockFile[]>);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-lg">
            <Package className="w-8 h-8 text-orange-400" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white/80">Block Library</h2>
            <p className="text-orange-400/70">Manage your CAD block collection</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 bg-black/30 border border-orange-500/30 hover:border-orange-500/50 rounded-lg transition-all"
            title={viewMode === 'grid' ? 'List View' : 'Grid View'}
          >
            {viewMode === 'grid' ? <List className="w-5 h-5 text-orange-400" /> : <Grid className="w-5 h-5 text-orange-400" />}
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-orange-500/30 transition-all"
          >
            <Upload className="w-5 h-5" />
            <span>Upload Block</span>
          </button>
        </div>
      </div>

      <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search blocks..."
              className="w-full pl-10 bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {allTags.map(tag => (
                <option key={tag} value={tag}>{tag === 'all' ? 'All Tags' : tag}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-orange-300">
          <div className="flex items-center space-x-4">
            <span>Total: {blocks.length}</span>
            <span>Filtered: {filteredBlocks.length}</span>
            <span>Favorites: {blocks.filter(b => b.is_favorite).length}</span>
          </div>
          {(selectedCategory !== 'all' || selectedTag !== 'all') && (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedTag('all');
              }}
              className="text-orange-400 hover:text-orange-300 transition-all"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-orange-300 py-12">Loading blocks...</div>
      ) : filteredBlocks.length === 0 ? (
        <div className="text-center text-white/50 py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-orange-400/30" />
          {searchTerm || selectedCategory !== 'all' || selectedTag !== 'all'
            ? 'No blocks match your filters'
            : 'No blocks uploaded yet. Upload your first block to get started!'}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(blocksByCategory).map(([category, categoryBlocks]) => (
            <div key={category} className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-4 hover:bg-orange-500/5 transition-all"
              >
                <div className="flex items-center space-x-3">
                  {expandedCategories.has(category) ? (
                    <ChevronDown className="w-5 h-5 text-orange-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-orange-400" />
                  )}
                  <Layers className="w-5 h-5 text-orange-400" />
                  <h3 className="text-lg font-bold text-white/80 capitalize">{category}</h3>
                  <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded-full text-xs">
                    {categoryBlocks.length}
                  </span>
                </div>
              </button>

              {expandedCategories.has(category) && (
                <div className={`p-4 border-t border-orange-500/20 ${
                  viewMode === 'grid'
                    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                    : 'space-y-2'
                }`}>
                  {categoryBlocks.map(block => (
                    <div
                      key={block.id}
                      className={`bg-black/40 border border-orange-500/30 rounded-lg overflow-hidden hover:border-orange-400/50 transition-all ${
                        viewMode === 'list' ? 'flex items-center' : ''
                      }`}
                    >
                      <div className={`relative group ${viewMode === 'list' ? 'w-24 h-24' : 'w-full aspect-square'}`}>
                        {block.thumbnail_url ? (
                          <img
                            src={block.thumbnail_url}
                            alt={block.name}
                            className="w-full h-full object-cover bg-black"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-cyan-900/40 to-amber-900/40 flex items-center justify-center">
                            <Package className="w-12 h-12 text-orange-400/30" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                          <button
                            onClick={() => setSelectedBlock(block)}
                            className="p-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleFavorite(block)}
                            className={`p-2 border rounded-lg transition-all ${
                              block.is_favorite
                                ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-200'
                                : 'bg-gray-500/20 border-gray-500/40 text-gray-300 hover:bg-yellow-500/20'
                            }`}
                            title="Toggle Favorite"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteBlock(block.id)}
                            className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-100 transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {block.is_dynamic && (
                          <div className="absolute top-2 right-2 px-2 py-1 bg-orange-500/80 text-white text-xs rounded-full font-semibold">
                            Dynamic
                          </div>
                        )}
                      </div>

                      <div className={`p-3 ${viewMode === 'list' ? 'flex-1' : ''}`}>
                        <h4 className="text-sm font-bold text-white/90 truncate mb-1">{block.name}</h4>
                        <div className="flex items-center justify-between text-xs text-orange-400/70 mb-2">
                          <span>{(block.file_size / 1024).toFixed(1)} KB</span>
                          <span>Used: {block.usage_count}x</span>
                        </div>
                        {block.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {block.tags.slice(0, 3).map((tag, idx) => (
                              <span
                                key={idx}
                                className="text-xs px-2 py-0.5 bg-orange-500/10 text-orange-300 rounded-full border border-orange-500/30"
                              >
                                {tag}
                              </span>
                            ))}
                            {block.tags.length > 3 && (
                              <span className="text-xs px-2 py-0.5 text-orange-400/50">
                                +{block.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] backdrop-blur-xl border border-orange-500/30 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-2xl font-bold text-white/80 mb-4">Upload Block</h3>
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Block Name *</label>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                  required
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., Transformer-3Phase"
                />
              </div>

              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Category *</label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="electrical">Electrical</option>
                  <option value="mechanical">Mechanical</option>
                  <option value="structural">Structural</option>
                  <option value="instrumentation">Instrumentation</option>
                  <option value="symbols">Symbols</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Tags (comma separated)</label>
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., transformer, 3phase, 480v"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_dynamic"
                  checked={uploadForm.is_dynamic}
                  onChange={(e) => setUploadForm({ ...uploadForm, is_dynamic: e.target.checked })}
                  className="w-4 h-4 rounded border-orange-500/30 bg-black/50"
                />
                <label htmlFor="is_dynamic" className="text-orange-300 text-sm">
                  Dynamic Block (with variations)
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
                >
                  {isUploading ? 'Uploading...' : 'Upload Block'}
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadForm({ name: '', category: 'electrical', tags: '', is_dynamic: false });
                  }}
                  className="bg-black/50 border border-orange-500/30 text-orange-300 hover:bg-orange-500/10 px-6 py-2 rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedBlock && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] backdrop-blur-xl border border-orange-500/30 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-6 border-b border-orange-500/30 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
              <div>
                <h3 className="text-2xl font-bold text-white/80">{selectedBlock.name}</h3>
                <div className="flex items-center space-x-4 mt-2 text-sm text-white/50">
                  <span className="capitalize">{selectedBlock.category}</span>
                  <span>•</span>
                  <span>{(selectedBlock.file_size / 1024).toFixed(1)} KB</span>
                  <span>•</span>
                  <span>Used {selectedBlock.usage_count}x</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
              >
                <span className="text-red-400 text-2xl">×</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="aspect-video bg-gradient-to-br from-cyan-900/40 to-amber-900/40 rounded-lg border border-orange-500/30 flex items-center justify-center">
                {selectedBlock.thumbnail_url ? (
                  <img
                    src={selectedBlock.thumbnail_url}
                    alt={selectedBlock.name}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <Package className="w-24 h-24 mx-auto mb-4 text-orange-400/30" />
                    <p className="text-orange-300/50">Preview not available</p>
                  </div>
                )}
              </div>

              {selectedBlock.tags.length > 0 && (
                <div>
                  <h4 className="text-lg font-bold text-white/80 mb-3">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedBlock.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="flex items-center space-x-1 px-3 py-1 bg-orange-500/10 text-orange-300 rounded-full border border-orange-500/30"
                      >
                        <Tag className="w-3 h-3" />
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedBlock.is_dynamic && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                  <h4 className="text-lg font-bold text-white/80 mb-2">Dynamic Block</h4>
                  <p className="text-white/50 text-sm">
                    This block includes dynamic variations and can be customized with different parameters.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button className="flex-1 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-white/90 px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2">
                  <Download className="w-5 h-5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => toggleFavorite(selectedBlock)}
                  className={`px-6 py-3 border rounded-lg transition-all flex items-center space-x-2 ${
                    selectedBlock.is_favorite
                      ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-200'
                      : 'bg-gray-500/20 border-gray-500/40 text-gray-300 hover:bg-yellow-500/20'
                  }`}
                >
                  <Star className="w-5 h-5" />
                  <span>{selectedBlock.is_favorite ? 'Favorited' : 'Favorite'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

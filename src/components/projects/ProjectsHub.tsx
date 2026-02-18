import { useState, useEffect } from 'react';
import { FolderOpen, FolderCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project, PROJECT_CATEGORIES } from './projectmanagertypes';
import { categoryColor, getDeadlineStatus, formatDateOnly } from './projectmanagerutils';
import { ProjectList } from './ProjectList';

interface ProjectsHubProps {
  onSelectProject?: (projectId: string) => void;
}

export function ProjectsHub({ onSelectProject }: ProjectsHubProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProjects(data);
    }
    setIsLoading(false);
  };

  const filteredProjects = projects.filter(p => {
    const matchesTab = activeTab === 'active'
      ? p.status !== 'completed'
      : p.status === 'completed';
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesTab && matchesSearch && matchesCategory;
  });

  const categorized = PROJECT_CATEGORIES
    .map(cat => ({
      cat,
      items: filteredProjects.filter(p => p.category === cat.key),
    }))
    .filter(group => group.items.length > 0);

  const uncategorized = filteredProjects.filter(p => !p.category);

  const activeCount = projects.filter(p => p.status !== 'completed').length;
  const completedCount = projects.filter(p => p.status === 'completed').length;

  // For ProjectList, we need to adapt: it expects a filter prop, but we have separate tabs.
  // We'll map the activeTab to a filter that ProjectList understands.
  const projectListFilter = activeTab === 'active' ? 'active' : 'archived'; // 'archived' corresponds to 'completed'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-lg">
            <FolderOpen className="w-8 h-8 text-orange-400" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white/80">All Projects</h2>
            <p className="text-orange-400/70 text-sm">View and manage all your projects</p>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold transition-all ${
            activeTab === 'active'
              ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg shadow-orange-500/30'
              : 'bg-black/30 border border-orange-500/30 text-white/60 hover:border-orange-500/50'
          }`}
        >
          <FolderOpen className="w-5 h-5" />
          <span>Active ({activeCount})</span>
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold transition-all ${
            activeTab === 'completed'
              ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white shadow-lg shadow-green-500/30'
              : 'bg-black/30 border border-orange-500/30 text-white/60 hover:border-orange-500/50'
          }`}
        >
          <FolderCheck className="w-5 h-5" />
          <span>Completed ({completedCount})</span>
        </button>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-4 pr-4 py-3 bg-black/30 border border-orange-500/30 rounded-lg text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="relative">
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="pl-4 pr-8 py-3 bg-black/30 border border-orange-500/30 rounded-lg text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer"
          >
            <option value="">All Categories</option>
            {PROJECT_CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.key}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-12 flex flex-col items-center justify-center">
          <AlertCircle className="w-16 h-16 text-orange-400/50 mb-4" />
          <p className="text-white/50 text-lg">
            {searchQuery || selectedCategory
              ? 'No projects match your filters'
              : activeTab === 'active'
                ? 'No active projects'
                : 'No completed projects'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categorized.map(group => (
            <div key={group.cat.key}>
              <div className="flex items-center space-x-2 px-2 py-3">
                <span
                  className="text-sm px-3 py-1 rounded border font-semibold"
                  style={{
                    borderColor: group.cat.color,
                    color: group.cat.color,
                    backgroundColor: `${group.cat.color}15`,
                  }}
                >
                  {group.cat.key}
                </span>
                <span className="text-white/50 text-sm">
                  ({group.items.length} {group.items.length === 1 ? 'project' : 'projects'})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map(project => {
                  const deadlineStatus = getDeadlineStatus(project.deadline);
                  return (
                    <div
                      key={project.id}
                      onClick={() => onSelectProject?.(project.id)}
                      className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-5 hover:border-orange-400/50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: categoryColor(project.category) }}
                          />
                          <h4 className="text-white/90 font-semibold group-hover:text-orange-50">{project.name}</h4>
                        </div>
                      </div>
                      {project.description && (
                        <p className="text-white/40 text-sm mb-3 line-clamp-2">{project.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {project.status === 'completed' && (
                            <span className="text-xs text-white/35">Archived</span>
                          )}
                        </div>
                        {project.deadline && (
                          <div className={`flex items-center space-x-1 text-sm ${deadlineStatus.color}`}>
                            <span>{formatDateOnly(project.deadline)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {uncategorized.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 px-2 py-3">
                <span
                  className="text-sm px-3 py-1 rounded border font-semibold"
                  style={{
                    borderColor: '#a855f7',
                    color: '#a855f7',
                    backgroundColor: '#a855f715',
                  }}
                >
                  Uncategorized
                </span>
                <span className="text-white/50 text-sm">
                  ({uncategorized.length} {uncategorized.length === 1 ? 'project' : 'projects'})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {uncategorized.map(project => {
                  const deadlineStatus = getDeadlineStatus(project.deadline);
                  return (
                    <div
                      key={project.id}
                      onClick={() => onSelectProject?.(project.id)}
                      className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-5 hover:border-orange-400/50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: categoryColor(project.category) }}
                          />
                          <h4 className="text-white/90 font-semibold group-hover:text-orange-50">{project.name}</h4>
                        </div>
                      </div>
                      {project.description && (
                        <p className="text-white/40 text-sm mb-3 line-clamp-2">{project.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {project.status === 'completed' && (
                            <span className="text-xs text-white/35">Archived</span>
                          )}
                        </div>
                        {project.deadline && (
                          <div className={`flex items-center space-x-1 text-sm ${deadlineStatus.color}`}>
                            <span>{formatDateOnly(project.deadline)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
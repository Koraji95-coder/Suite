import { useState } from 'react';
import { Search } from 'lucide-react';
import { Project, TaskCount, PROJECT_CATEGORIES } from './projectmanagertypes';
import { ProjectCard } from './ProjectCard';

interface ProjectListProps {
  projects: Project[];
  selectedProject: Project | null;
  projectTaskCounts: Map<string, TaskCount>;
  onSelectProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  filter?: 'active' | 'all' | 'on-hold' | 'archived';
  onFilterChange?: (filter: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function ProjectList({
  projects,
  selectedProject,
  projectTaskCounts,
  onSelectProject,
  onEditProject,
  onDeleteProject,
  filter = 'active',
  onFilterChange,
  searchQuery: externalSearch,
  onSearchChange,
}: ProjectListProps) {
  const [internalSearch, setInternalSearch] = useState('');

  const searchQuery = externalSearch !== undefined ? externalSearch : internalSearch;
  const handleSearchChange = (value: string) => {
    if (onSearchChange) onSearchChange(value);
    else setInternalSearch(value);
  };

  const filteredProjects = projects.filter(p => {
    // Filter by status
    if (filter !== 'all') {
      if (filter === 'archived') {
        if (p.status !== 'completed') return false;
      } else {
        if (p.status === 'completed') return false;
        if (filter !== p.status) return false;
      }
    }
    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
    }
    return true;
  });

  const categorizedProjects = PROJECT_CATEGORIES.map(cat => ({
    cat,
    items: filteredProjects.filter(p => p.category === cat.key),
  })).filter(group => group.items.length > 0);

  const uncategorizedProjects = filteredProjects.filter(p => !p.category);

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-white/80 mb-3">Projects</h3>
      {onFilterChange && (
        <div className="flex space-x-2 mb-3">
          {['active', 'all', 'on-hold', 'archived'].map((s) => (
            <button
              key={s}
              onClick={() => onFilterChange(s)}
              className={`px-3 py-1 text-xs rounded-full transition-all ${
                filter === s
                  ? 'bg-orange-600 text-white'
                  : 'bg-black/40 text-white/60 hover:bg-orange-900/40'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>
      )}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search projects..."
          className="w-full pl-10 pr-4 py-2 bg-black/50 border border-orange-500/30 rounded-lg text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div className="space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        {categorizedProjects.map(group => (
          <div key={group.cat.key}>
            <div className="flex items-center space-x-2 mb-2 px-2 py-2">
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
              <span className="text-white/50 text-xs">
                ({group.items.length} {group.items.length === 1 ? 'project' : 'projects'})
              </span>
            </div>
            <div className="space-y-2">
              {group.items.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={selectedProject?.id === project.id}
                  taskInfo={projectTaskCounts.get(project.id)}
                  onSelect={onSelectProject}
                  onEdit={onEditProject}
                  onDelete={onDeleteProject}
                />
              ))}
            </div>
          </div>
        ))}

        {uncategorizedProjects.length > 0 && (
          <div>
            <div className="flex items-center space-x-2 mb-2 px-2 py-2">
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
              <span className="text-white/50 text-xs">
                ({uncategorizedProjects.length} {uncategorizedProjects.length === 1 ? 'project' : 'projects'})
              </span>
            </div>
            <div className="space-y-2">
              {uncategorizedProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={selectedProject?.id === project.id}
                  taskInfo={projectTaskCounts.get(project.id)}
                  onSelect={onSelectProject}
                  onEdit={onEditProject}
                  onDelete={onDeleteProject}
                />
              ))}
            </div>
          </div>
        )}

        {filteredProjects.length === 0 && (
          <div className="text-center py-12 text-orange-400/60">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">
              {searchQuery ? 'No projects match your search' : 'No projects match your filters'}
            </p>
            <p className="text-sm mt-1">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `Try changing the status filter or create a new project`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
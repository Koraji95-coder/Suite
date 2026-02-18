import { PROJECT_CATEGORIES, ProjectFormData } from './projectmanagertypes';
import { categoryColor } from './projectmanagerutils';

interface ProjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  formData: ProjectFormData;
  setFormData: (data: ProjectFormData) => void;
  isEditing: boolean;
}

export function ProjectFormModal({
  isOpen,
  onClose,
  onSubmit,
  formData,
  setFormData,
  isEditing,
}: ProjectFormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] backdrop-blur-xl border border-orange-500/30 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold text-white/80 mb-4">
          {isEditing ? 'Edit Project' : 'Create New Project'}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm font-medium mb-2">Project Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Enter project name"
            />
          </div>
          <div>
            <label className="block text-white/60 text-sm font-medium mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500 h-24"
              placeholder="Project description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/60 text-sm font-medium mb-2">Deadline</label>
              <input
                type="date"
                value={formData.deadline ? formData.deadline.split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-white/60 text-sm font-medium mb-2">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/60 text-sm font-medium mb-2">Category</label>
              <select
                value={formData.category ?? ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">No Category</option>
                {PROJECT_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.key}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-white/60 text-sm font-medium mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="active">Active</option>
                <option value="on-hold">On Hold</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          {formData.category && (
            <div className="flex items-center space-x-2 mt-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: categoryColor(formData.category || null) }}
              />
              <span className="text-xs text-white/50">Color auto-assigned from category</span>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onSubmit}
            className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
          >
            {isEditing ? 'Update Project' : 'Create Project'}
          </button>
          <button
            onClick={onClose}
            className="bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10 px-6 py-2 rounded-lg transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
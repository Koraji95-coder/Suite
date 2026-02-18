import { X } from 'lucide-react';

interface AddMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (formData: any) => void;
}

export function AddMemoryModal({ isOpen, onClose, onAdd }: AddMemoryModalProps) {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onAdd({
      type: formData.get('type'),
      title: formData.get('title'),
      description: formData.get('description'),
      strength: formData.get('strength'),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] backdrop-blur-xl border border-orange-500/30 rounded-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-white/80">Add Memory</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
          >
            <X className="w-5 h-5 text-red-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm font-medium mb-2">Type</label>
            <select
              name="type"
              required
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="preference">Preference</option>
              <option value="knowledge">Knowledge</option>
              <option value="pattern">Pattern</option>
              <option value="relationship">Relationship</option>
            </select>
          </div>

          <div>
            <label className="block text-white/60 text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              name="title"
              required
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Memory title"
            />
          </div>

          <div>
            <label className="block text-white/60 text-sm font-medium mb-2">Description</label>
            <textarea
              name="description"
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500 h-20"
              placeholder="Memory description"
            />
          </div>

          <div>
            <label className="block text-white/60 text-sm font-medium mb-2">
              Strength (1-100)
            </label>
            <input
              type="number"
              name="strength"
              min="1"
              max="100"
              defaultValue="50"
              required
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
            >
              Add Memory
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10 px-6 py-2 rounded-lg transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
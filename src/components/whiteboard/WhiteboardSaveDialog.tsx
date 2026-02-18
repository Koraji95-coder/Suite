import { useState } from 'react';

interface WhiteboardSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, tags: string) => void;
  panelContext: string;
}

export function WhiteboardSaveDialog({
  isOpen,
  onClose,
  onSave,
  panelContext,
}: WhiteboardSaveDialogProps) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }
    onSave(title.trim(), tags);
  };

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-[#0a0a0a] backdrop-blur-xl border border-white/[0.06] rounded-lg p-6 max-w-md w-full m-4">
        <h4 className="text-xl font-bold text-white/80 mb-4">Save Whiteboard</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-orange-300 text-sm font-medium mb-2">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Enter whiteboard title"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-orange-300 text-sm font-medium mb-2">Tags (comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g., calculations, circuit, notes"
            />
          </div>
          <p className="text-white/50 text-sm">
            Panel Context: <span className="font-semibold text-white/80">{panelContext}</span>
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
          >
            Save Whiteboard
          </button>
          <button
            onClick={onClose}
            className="bg-black/50 border border-orange-500/30 text-orange-300 hover:bg-orange-500/10 px-6 py-2 rounded-lg transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
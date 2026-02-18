import { Upload } from 'lucide-react';
import { useState } from 'react';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploadCategory: string;
  onUpload: (data: {
    category: string;
    subcategory: string;
    name: string;
    description: string;
    file: File | null;
  }) => void;
}

export function FileUploadModal({
  isOpen,
  onClose,
  uploadCategory,
  onUpload,
}: FileUploadModalProps) {
  const [subcategory, setSubcategory] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpload({ category: uploadCategory, subcategory, name, description, file });
    onClose();
  };

  const equipmentOptions = [
    'transformers', 'transmission-lines', 'shunt-reactor', 'shunt-capacitor',
    'generators', 'motors', 'wind-machines'
  ];
  const standardsOptions = [
    'nec', 'ieee', 'iec', 'ansi', 'nema', 'other'
  ];

  const options = uploadCategory === 'equipment' ? equipmentOptions : standardsOptions;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] backdrop-blur-xl border border-white/[0.06] rounded-xl p-8 max-w-2xl w-full shadow-2xl shadow-orange-900/30">
        <h3 className="text-2xl font-bold text-white/90 mb-6">
          Upload Document to {uploadCategory === 'equipment' ? 'Equipment Library' : 'Standards & Codes'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">Select Subcategory</label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              className="w-full bg-black/60 border border-orange-500/40 rounded-lg px-4 py-3 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-400"
              required
            >
              <option value="">Select a subcategory</option>
              {options.map(opt => (
                <option key={opt} value={opt}>{opt.replace(/-/g, ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">Document Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/60 border border-orange-500/40 rounded-lg px-4 py-3 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Enter document name"
              required
            />
          </div>
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-black/60 border border-orange-500/40 rounded-lg px-4 py-3 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-400 h-24"
              placeholder="Brief description"
            />
          </div>
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">Select File</label>
            <div className="border-2 border-dashed border-orange-500/40 rounded-lg p-8 text-center hover:border-orange-500/60 transition-all duration-300 cursor-pointer bg-black/50">
              <Upload className="w-12 h-12 text-orange-300 mx-auto mb-2" />
              <p className="text-white/80 mb-1">Click to upload or drag and drop</p>
              <p className="text-white/80/60 text-sm">PDF, DOC, DOCX, XLS, XLSX (Max 50MB)</p>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="flex gap-4 mt-8">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-300 shadow-md shadow-orange-900/20"
            >
              Upload Document
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-black/60 border border-orange-500/40 text-white/80 hover:bg-orange-500/20 px-6 py-3 rounded-lg transition-all duration-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
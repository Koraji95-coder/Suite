import { useState } from 'react';
import { CircuitDesign } from '../aitypes';
import { Send, Loader } from 'lucide-react';

interface CircuitDesignerProps {
  onDesign: (input: string) => Promise<void>;
  designs: CircuitDesign[];
  loading: boolean;
}

export function CircuitDesigner({ onDesign, designs, loading }: CircuitDesignerProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onDesign(input);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the circuit you want to design (e.g., '3-phase 480V panel with ground fault protection')..."
          className="w-full bg-black/50 border border-yellow-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 h-32 resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-semibold px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              <span>Designing...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Design Circuit</span>
            </>
          )}
        </button>
      </form>

      {designs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-white">Circuit Designs</h3>
          {designs.map(design => (
            <div key={design.id} className="bg-black/30 backdrop-blur-md border border-yellow-500/30 rounded-lg p-6">
              <h4 className="text-lg font-bold text-yellow-200 mb-3">Design Request</h4>
              <p className="text-gray-300 mb-4">{design.description}</p>

              <h4 className="text-lg font-bold text-yellow-200 mb-2">Components</h4>
              <ul className="list-disc list-inside text-gray-300 mb-4 space-y-1">
                {design.components.map((component, idx) => (
                  <li key={idx}>{component}</li>
                ))}
              </ul>

              <h4 className="text-lg font-bold text-yellow-200 mb-2">Schematic</h4>
              <pre className="bg-black/50 border border-yellow-500/30 rounded p-4 text-yellow-100 text-sm mb-4 overflow-x-auto">
                {design.schematic}
              </pre>

              <h4 className="text-lg font-bold text-yellow-200 mb-2">Notes</h4>
              <p className="text-gray-300">{design.notes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
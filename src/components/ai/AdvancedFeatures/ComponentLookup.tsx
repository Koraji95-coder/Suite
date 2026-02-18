import { useState } from 'react';
import { ComponentSpec } from '../aitypes';
import { Send, Loader } from 'lucide-react';

interface ComponentLookupProps {
  onLookup: (input: string) => Promise<void>;
  specs: ComponentSpec[];
  loading: boolean;
}

export function ComponentLookup({ onLookup, specs, loading }: ComponentLookupProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onLookup(input);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the component you're looking for (e.g., '20A 3-pole circuit breaker 240V')..."
          className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              <span>Searching...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Find Components</span>
            </>
          )}
        </button>
      </form>

      {specs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-white">Component Specifications</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {specs.map(spec => (
              <div key={spec.id} className="bg-black/30 backdrop-blur-md border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-lg font-bold text-blue-200">{spec.name}</h4>
                    <p className="text-gray-400 text-sm">{spec.manufacturer}</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                    {spec.partNumber}
                  </span>
                </div>

                <div className="space-y-2">
                  {Object.entries(spec.specs).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{key}:</span>
                      <span className="text-white font-semibold">{value}</span>
                    </div>
                  ))}
                </div>

                {spec.datasheetUrl && (
                  <button className="mt-3 w-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-100 px-4 py-2 rounded-lg transition-all text-sm">
                    View Datasheet
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
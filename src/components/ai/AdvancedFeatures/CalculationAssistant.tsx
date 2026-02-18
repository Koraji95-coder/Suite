import { useState } from 'react';
import { Calculation } from '../aitypes';
import { Send, Loader } from 'lucide-react';

interface CalculationAssistantProps {
  onCalculate: (input: string) => Promise<void>;
  calculations: Calculation[];
  loading: boolean;
}

export function CalculationAssistant({ onCalculate, calculations, loading }: CalculationAssistantProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onCalculate(input);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your calculation (e.g., 'Calculate transformer size for 100kVA load with 20% growth')..."
          className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 h-32 resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              <span>Calculating...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Calculate</span>
            </>
          )}
        </button>
      </form>

      {calculations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-white">Calculations</h3>
          {calculations.map(calc => (
            <div key={calc.id} className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
              <h4 className="text-lg font-bold text-orange-200 mb-2">Query</h4>
              <p className="text-gray-300 mb-4">{calc.query}</p>

              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-orange-300 mb-1">Result</p>
                <p className="text-3xl font-bold text-orange-100">{calc.result}</p>
              </div>

              <h4 className="text-lg font-bold text-orange-200 mb-2">Calculation Steps</h4>
              <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-1">
                {calc.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>

              <h4 className="text-lg font-bold text-orange-200 mb-2">Formula Used</h4>
              <code className="block bg-black/50 border border-orange-500/30 rounded p-3 text-orange-100 text-sm mb-4">
                {calc.formula}
              </code>

              <h4 className="text-lg font-bold text-orange-200 mb-2">Engineering Notes</h4>
              <p className="text-gray-300">{calc.notes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
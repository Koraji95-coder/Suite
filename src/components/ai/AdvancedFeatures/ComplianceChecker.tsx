import { useState } from 'react';
import { ComplianceCheck } from '../aitypes';
import { getResultColor, getResultIcon } from '../aiutils';
import { CheckCircle, XCircle, AlertTriangle, Send, Loader } from 'lucide-react';

interface ComplianceCheckerProps {
  onCheck: (input: string) => Promise<void>;
  results: ComplianceCheck[];
  loading: boolean;
}

export function ComplianceChecker({ onCheck, results, loading }: ComplianceCheckerProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onCheck(input);
  };

  const getIcon = (result: string) => {
    switch (result) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your design for compliance checking (e.g., '200A service with 4 AWG ground conductor')..."
          className="w-full bg-black/50 border border-green-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500 h-32 resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              <span>Checking...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Check Compliance</span>
            </>
          )}
        </button>
      </form>

      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-white">Compliance Results</h3>
          {results.map(result => (
            <div key={result.id} className={`bg-gradient-to-br ${getResultColor(result.result)} backdrop-blur-md border rounded-lg p-4`}>
              <div className="flex items-start space-x-3">
                {getIcon(result.result)}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-lg font-bold text-white">{result.title}</h4>
                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                      {result.standard}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{result.description}</p>
                  <p className="text-gray-400 text-sm">{result.details}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
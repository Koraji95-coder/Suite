interface AIChatSettingsProps {
  availableModels: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onRefresh: () => void;
  isConnected: boolean | null;
}

export function AIChatSettings({
  availableModels,
  selectedModel,
  onModelChange,
  onRefresh,
  isConnected,
}: AIChatSettingsProps) {
  return (
    <div className="p-4 border-b border-orange-500/30 bg-black/30">
      <div className="flex items-center justify-between mb-2">
        <label className="text-orange-300 text-sm font-medium">Model:</label>
        <button
          onClick={onRefresh}
          className="text-xs text-orange-400 hover:text-orange-300"
        >
          Refresh
        </button>
      </div>
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
        disabled={!isConnected}
      >
        {availableModels.map(model => (
          <option key={model} value={model}>{model}</option>
        ))}
      </select>
      {availableModels.length === 0 && isConnected && (
        <p className="text-xs text-orange-400/70 mt-2">
          Run: <code className="bg-black/50 px-1 py-0.5 rounded">ollama pull llama3.2</code>
        </p>
      )}
    </div>
  );
}
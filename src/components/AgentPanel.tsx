/**
 * Agent Integration Panel
 * Demonstrates real-world agent automation for Suite
 */
import { useState } from 'react';
import { agentService, AgentResponse } from '../services/agentService';

export function AgentPanel() {
  const [isPaired, setIsPaired] = useState(agentService.checkPairing());
  const [pairingCode, setPairingCode] = useState('');
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    setLoading(true);
    const success = await agentService.pair(pairingCode);
    setIsPaired(success);
    setLoading(false);
    if (success) {
      setResult({ success: true, data: 'Successfully paired with agent!' });
    }
  };

  const runTask = async (taskFn: () => Promise<AgentResponse>) => {
    setLoading(true);
    setResult(null);
    try {
      const response = await taskFn();
      setResult(response);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isPaired) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Pair with Suite Agent</h2>
        <p className="text-gray-600 mb-4">
          Start your agent with: <code className="bg-gray-100 px-2 py-1 rounded">zeroclaw gateway</code>
        </p>
        <p className="text-gray-600 mb-4">
          Enter the 6-digit pairing code shown at startup:
        </p>
        <input
          type="text"
          value={pairingCode}
          onChange={(e) => setPairingCode(e.target.value)}
          placeholder="123456"
          className="border rounded px-4 py-2 mb-4 w-full"
          maxLength={6}
        />
        <button
          onClick={handlePair}
          disabled={loading || pairingCode.length !== 6}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Pairing...' : 'Pair Agent'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">🤖 Suite Agent Automation</h2>
        <p className="text-sm text-green-600 mb-4">✓ Connected to agent</p>

        {/* AutoCAD Automation */}
        <section className="mb-6">
          <h3 className="text-xl font-semibold mb-3">🏗️ AutoCAD Automation</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => runTask(() =>
                agentService.generateFloorPlan({
                  width: 100,
                  height: 80,
                  rooms: 4,
                })
              )}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
              disabled={loading}
            >
              Generate Floor Plan
            </button>
            <button
              onClick={() => runTask(() =>
                agentService.calculateElectricalGrid({
                  grid_spacing: 10,
                  soil_resistivity: 100,
                  fault_current: 10000,
                })
              )}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
              disabled={loading}
            >
              Calculate Grounding Grid
            </button>
            <button
              onClick={() => runTask(() =>
                agentService.calculateVoltageDrop({
                  length: 200,
                  current: 100,
                  voltage: 480,
                  conductor: 'Copper',
                })
              )}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
              disabled={loading}
            >
              Calculate Voltage Drop
            </button>
          </div>
        </section>

        {/* AI Analysis */}
        <section className="mb-6">
          <h3 className="text-xl font-semibold mb-3">🧠 AI Analysis</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => runTask(() =>
                agentService.analyzeProject({
                  name: 'Substation Upgrade',
                  type: 'electrical_grid',
                  voltage: '230kV',
                  location: 'Urban area',
                })
              )}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              disabled={loading}
            >
              Analyze Project
            </button>
            <button
              onClick={() => runTask(() =>
                agentService.forecastTimeline({
                  type: 'electrical_grid',
                  complexity: 'high',
                  team_size: 5,
                })
              )}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              disabled={loading}
            >
              Forecast Timeline
            </button>
          </div>
        </section>

        {/* Research */}
        <section className="mb-6">
          <h3 className="text-xl font-semibold mb-3">📚 Research & Standards</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => runTask(() =>
                agentService.researchStandard('IEEE 80')
              )}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              disabled={loading}
            >
              Research IEEE 80
            </button>
            <button
              onClick={() => runTask(() =>
                agentService.researchStandard('NEC Article 250')
              )}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              disabled={loading}
            >
              Research NEC 250
            </button>
          </div>
        </section>

        {/* Memory */}
        <section className="mb-6">
          <h3 className="text-xl font-semibold mb-3">💾 Project Memory</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => runTask(() =>
                agentService.rememberProjectPattern(
                  'High voltage projects in urban areas typically require 30% more time for permits'
                )
              )}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
              disabled={loading}
            >
              Store Pattern
            </button>
            <button
              onClick={() => runTask(() =>
                agentService.recallSimilarProjects('urban high voltage substation')
              )}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
              disabled={loading}
            >
              Recall Similar Projects
            </button>
          </div>
        </section>
      </div>

      {/* Results Display */}
      {loading && (
        <div className="bg-gray-100 rounded-lg p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Agent is working...</p>
        </div>
      )}

      {result && !loading && (
        <div className={`rounded-lg p-6 ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
          <h4 className="font-semibold mb-2">
            {result.success ? '✅ Success' : '❌ Error'}
            {result.execution_time && (
              <span className="text-sm text-gray-600 ml-2">
                ({result.execution_time}ms)
              </span>
            )}
          </h4>
          <pre className="bg-white p-4 rounded overflow-auto max-h-96">
            {result.error || JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

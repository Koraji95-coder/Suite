import { useState } from 'react';
import { CircuitBoard, Calculator, Download, Save, Zap, AlertTriangle } from 'lucide-react';

interface GridConfig {
  name: string;
  area_length: number;
  area_width: number;
  grid_spacing: number;
  conductor_diameter: number;
  burial_depth: number;
  soil_resistivity: number;
  fault_current: number;
  fault_duration: number;
  ground_rods: number;
  conductor_material: 'copper' | 'aluminum';
}

export function GroundGridGenerator() {
  const [config, setConfig] = useState<GridConfig>({
    name: 'Substation Ground Grid',
    area_length: 50,
    area_width: 40,
    grid_spacing: 5,
    conductor_diameter: 0.5,
    burial_depth: 0.6,
    soil_resistivity: 100,
    fault_current: 10000,
    fault_duration: 0.5,
    ground_rods: 12,
    conductor_material: 'copper',
  });

  const [results, setResults] = useState<any>(null);
  const [showResults, setShowResults] = useState(false);

  const calculateGrid = () => {
    const { area_length, area_width, grid_spacing, conductor_diameter: _conductor_diameter, burial_depth, soil_resistivity, fault_current, fault_duration, ground_rods } = config;

    const area = area_length * area_width;
    const perimeter = 2 * (area_length + area_width);

    const num_conductors_length = Math.floor(area_length / grid_spacing) + 1;
    const num_conductors_width = Math.floor(area_width / grid_spacing) + 1;
    const total_conductors = num_conductors_length + num_conductors_width;

    const conductor_length = (num_conductors_length * area_width) + (num_conductors_width * area_length);
    const total_length = conductor_length + ground_rods * 3;

    const grid_resistance = (soil_resistivity / (4 * Math.sqrt(area))) * (1 + (1 / (1 + burial_depth * Math.sqrt(20 / area))));

    const ground_potential_rise = fault_current * grid_resistance;

    const touch_voltage_limit = (1000 + 1.5 * soil_resistivity) * Math.sqrt(fault_duration);
    const step_voltage_limit = (1000 + 6 * soil_resistivity) * Math.sqrt(fault_duration);

    const touch_voltage_actual = ground_potential_rise * 0.65;
    const step_voltage_actual = ground_potential_rise * 0.4;

    const touch_voltage_safe = touch_voltage_actual < touch_voltage_limit;
    const step_voltage_safe = step_voltage_actual < step_voltage_limit;

    setResults({
      area,
      perimeter,
      num_conductors_length,
      num_conductors_width,
      total_conductors,
      conductor_length: conductor_length.toFixed(1),
      total_length: total_length.toFixed(1),
      grid_resistance: grid_resistance.toFixed(3),
      ground_potential_rise: ground_potential_rise.toFixed(0),
      touch_voltage_limit: touch_voltage_limit.toFixed(0),
      step_voltage_limit: step_voltage_limit.toFixed(0),
      touch_voltage_actual: touch_voltage_actual.toFixed(0),
      step_voltage_actual: step_voltage_actual.toFixed(0),
      touch_voltage_safe,
      step_voltage_safe,
      overall_safe: touch_voltage_safe && step_voltage_safe,
    });
    setShowResults(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-orange-500/20 to-yellow-500/20 rounded-lg">
            <CircuitBoard className="w-8 h-8 text-orange-400" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-orange-200">Ground Grid Generator</h2>
            <p className="text-orange-400/70">Design and calculate ground grid systems</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={calculateGrid}
            className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-500 hover:to-yellow-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-orange-500/30 transition-all"
          >
            <Calculator className="w-5 h-5" />
            <span>Calculate</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
            <h3 className="text-xl font-bold text-orange-200 mb-4 flex items-center space-x-2">
              <CircuitBoard className="w-5 h-5" />
              <span>Grid Configuration</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Project Name</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-orange-300 text-sm font-medium mb-2">Area Length (m)</label>
                  <input
                    type="number"
                    value={config.area_length}
                    onChange={(e) => setConfig({ ...config, area_length: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-orange-300 text-sm font-medium mb-2">Area Width (m)</label>
                  <input
                    type="number"
                    value={config.area_width}
                    onChange={(e) => setConfig({ ...config, area_width: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-orange-300 text-sm font-medium mb-2">Grid Spacing (m)</label>
                  <input
                    type="number"
                    value={config.grid_spacing}
                    onChange={(e) => setConfig({ ...config, grid_spacing: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-orange-300 text-sm font-medium mb-2">Burial Depth (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.burial_depth}
                    onChange={(e) => setConfig({ ...config, burial_depth: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Conductor Material</label>
                <select
                  value={config.conductor_material}
                  onChange={(e) => setConfig({ ...config, conductor_material: e.target.value as 'copper' | 'aluminum' })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="copper">Copper</option>
                  <option value="aluminum">Aluminum</option>
                </select>
              </div>

              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Conductor Diameter (in)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.conductor_diameter}
                  onChange={(e) => setConfig({ ...config, conductor_diameter: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Number of Ground Rods</label>
                <input
                  type="number"
                  value={config.ground_rods}
                  onChange={(e) => setConfig({ ...config, ground_rods: parseInt(e.target.value) || 0 })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
            <h3 className="text-xl font-bold text-orange-200 mb-4 flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>Electrical Parameters</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Soil Resistivity (Ω·m)</label>
                <input
                  type="number"
                  value={config.soil_resistivity}
                  onChange={(e) => setConfig({ ...config, soil_resistivity: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Fault Current (A)</label>
                <input
                  type="number"
                  value={config.fault_current}
                  onChange={(e) => setConfig({ ...config, fault_current: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-orange-300 text-sm font-medium mb-2">Fault Duration (s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.fault_duration}
                  onChange={(e) => setConfig({ ...config, fault_duration: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {showResults && results ? (
            <>
              <div className={`bg-gradient-to-br ${results.overall_safe ? 'from-green-500/20 to-emerald-500/20 border-green-500/40' : 'from-red-500/20 to-rose-500/20 border-red-500/40'} backdrop-blur-md border rounded-lg p-6`}>
                <div className="flex items-center space-x-3 mb-4">
                  {results.overall_safe ? (
                    <div className="p-3 bg-green-500/20 rounded-full">
                      <Zap className="w-6 h-6 text-green-400" />
                    </div>
                  ) : (
                    <div className="p-3 bg-red-500/20 rounded-full">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      {results.overall_safe ? 'Design is Safe ✓' : 'Design Needs Review ⚠'}
                    </h3>
                    <p className={results.overall_safe ? 'text-green-300' : 'text-red-300'}>
                      {results.overall_safe ? 'All safety criteria met' : 'Safety limits exceeded'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
                <h3 className="text-xl font-bold text-orange-200 mb-4">Grid Layout</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-orange-300/70">Total Area</p>
                    <p className="text-orange-100 font-semibold text-lg">{results.area} m²</p>
                  </div>
                  <div>
                    <p className="text-orange-300/70">Perimeter</p>
                    <p className="text-orange-100 font-semibold text-lg">{results.perimeter} m</p>
                  </div>
                  <div>
                    <p className="text-orange-300/70">Conductors (Length)</p>
                    <p className="text-orange-100 font-semibold text-lg">{results.num_conductors_length}</p>
                  </div>
                  <div>
                    <p className="text-orange-300/70">Conductors (Width)</p>
                    <p className="text-orange-100 font-semibold text-lg">{results.num_conductors_width}</p>
                  </div>
                  <div>
                    <p className="text-orange-300/70">Total Conductors</p>
                    <p className="text-orange-100 font-semibold text-lg">{results.total_conductors}</p>
                  </div>
                  <div>
                    <p className="text-orange-300/70">Total Length</p>
                    <p className="text-orange-100 font-semibold text-lg">{results.total_length} m</p>
                  </div>
                </div>
              </div>

              <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
                <h3 className="text-xl font-bold text-orange-200 mb-4">Electrical Characteristics</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-orange-300/70">Grid Resistance</span>
                    <span className="text-orange-100 font-semibold">{results.grid_resistance} Ω</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-orange-300/70">Ground Potential Rise</span>
                    <span className="text-orange-100 font-semibold">{results.ground_potential_rise} V</span>
                  </div>
                </div>
              </div>

              <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
                <h3 className="text-xl font-bold text-orange-200 mb-4">Safety Analysis</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-orange-300/70">Touch Voltage</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${results.touch_voltage_safe ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                        {results.touch_voltage_safe ? 'SAFE' : 'EXCEEDED'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-orange-300/60">Actual / Limit</span>
                      <span className="text-orange-100 font-mono">{results.touch_voltage_actual} V / {results.touch_voltage_limit} V</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-orange-300/70">Step Voltage</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${results.step_voltage_safe ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                        {results.step_voltage_safe ? 'SAFE' : 'EXCEEDED'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-orange-300/60">Actual / Limit</span>
                      <span className="text-orange-100 font-mono">{results.step_voltage_actual} V / {results.step_voltage_limit} V</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button className="flex-1 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-100 px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2">
                  <Download className="w-5 h-5" />
                  <span>Export Report</span>
                </button>
                <button className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-lg transition-all flex items-center space-x-2">
                  <Save className="w-5 h-5" />
                  <span>Save Design</span>
                </button>
              </div>
            </>
          ) : (
            <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-12 text-center">
              <CircuitBoard className="w-16 h-16 mx-auto mb-4 text-orange-400/30" />
              <p className="text-orange-300/70">Configure parameters and click Calculate to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { CircuitBoard, Shuffle, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FrameSection } from './ui/PageFrame';

interface Component {
  type: string;
  value: string;
  x: number;
  y: number;
  label: string;
}

export function CircuitGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [circuitName, setCircuitName] = useState('');

  const componentTypes = [
    { type: 'resistor', symbol: 'R', values: ['1kΩ', '10kΩ', '100kΩ', '1MΩ'] },
    { type: 'capacitor', symbol: 'C', values: ['1µF', '10µF', '100µF', '1000µF'] },
    { type: 'inductor', symbol: 'L', values: ['1mH', '10mH', '100mH', '1H'] },
    { type: 'voltage', symbol: 'V', values: ['5V', '9V', '12V', '24V'] },
  ];

  useEffect(() => {
    drawCircuit();
  }, [components]);

  const generateRandomCircuit = () => {
    const numComponents = Math.floor(Math.random() * 4) + 3;
    const newComponents: Component[] = [];

    newComponents.push({
      type: 'voltage',
      value: '12V',
      x: 50,
      y: 200,
      label: 'V1',
    });

    for (let i = 0; i < numComponents - 1; i++) {
      const compType = componentTypes[Math.floor(Math.random() * 3)];
      const value = compType.values[Math.floor(Math.random() * compType.values.length)];

      newComponents.push({
        type: compType.type,
        value: value,
        x: 150 + i * 120,
        y: 100 + (i % 2) * 100,
        label: `${compType.symbol}${i + 1}`,
      });
    }

    setComponents(newComponents);
  };

  const drawCircuit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
    ctx.lineWidth = 2;

    components.forEach((comp, index) => {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(comp.label, comp.x - 15, comp.y - 25);

      ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
      ctx.font = '12px monospace';
      ctx.fillText(comp.value, comp.x - 20, comp.y + 45);

      switch (comp.type) {
        case 'resistor':
          ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(comp.x - 30, comp.y);
          ctx.lineTo(comp.x - 20, comp.y - 10);
          ctx.lineTo(comp.x - 10, comp.y + 10);
          ctx.lineTo(comp.x, comp.y - 10);
          ctx.lineTo(comp.x + 10, comp.y + 10);
          ctx.lineTo(comp.x + 20, comp.y - 10);
          ctx.lineTo(comp.x + 30, comp.y);
          ctx.stroke();
          break;

        case 'capacitor':
          ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(comp.x - 30, comp.y);
          ctx.lineTo(comp.x - 5, comp.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(comp.x - 5, comp.y - 15);
          ctx.lineTo(comp.x - 5, comp.y + 15);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(comp.x + 5, comp.y - 15);
          ctx.lineTo(comp.x + 5, comp.y + 15);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(comp.x + 5, comp.y);
          ctx.lineTo(comp.x + 30, comp.y);
          ctx.stroke();
          break;

        case 'inductor':
          ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(comp.x - 30, comp.y);
          ctx.lineTo(comp.x - 20, comp.y);
          for (let i = 0; i < 4; i++) {
            ctx.arc(comp.x - 15 + i * 10, comp.y - 5, 5, 0, Math.PI, true);
          }
          ctx.lineTo(comp.x + 30, comp.y);
          ctx.stroke();
          break;

        case 'voltage':
          ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(comp.x, comp.y, 20, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(0, 255, 255, 1)';
          ctx.font = 'bold 16px monospace';
          ctx.fillText('+', comp.x - 6, comp.y - 8);
          ctx.fillText('-', comp.x - 5, comp.y + 16);
          break;
      }

      if (index < components.length - 1) {
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(comp.x + 30, comp.y);
        ctx.lineTo(components[index + 1].x - 30, components[index + 1].y);
        ctx.stroke();
      }
    });

    if (components.length > 1) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      const last = components[components.length - 1];
      ctx.moveTo(last.x, last.y + 20);
      ctx.lineTo(last.x, 350);
      ctx.lineTo(components[0].x, 350);
      ctx.lineTo(components[0].x, components[0].y + 20);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const saveCircuit = async () => {
    if (!circuitName.trim()) {
      alert('Please enter a circuit name');
      return;
    }

    const { error } = await supabase.from('saved_circuits').insert({
      name: circuitName,
      circuit_data: {
        components: components,
      },
    } as any);

    if (!error) {
      alert('Circuit saved successfully!');
      setCircuitName('');
    } else {
      alert('Error saving circuit');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <CircuitBoard className="w-8 h-8 text-orange-400" />
        <h2 className="text-3xl font-bold text-white/90">Circuit Generator</h2>
      </div>

      <FrameSection title="Generated Circuit" actions={
        <button
          onClick={generateRandomCircuit}
          className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-lg shadow-orange-500/30 flex items-center space-x-2"
        >
          <Shuffle className="w-5 h-5" />
          <span>Generate Random Circuit</span>
        </button>
      }>

        <canvas
          ref={canvasRef}
          width={800}
          height={400}
          className="w-full rounded-lg border border-orange-500/20"
        />

        {components.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="bg-black/50 rounded-lg p-4 border border-orange-500/20">
              <h4 className="text-orange-300 font-semibold mb-3">Components:</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {components.map((comp, index) => (
                  <div key={index} className="bg-black/50 rounded px-3 py-2 border border-orange-500/10">
                    <div className="text-white/90 font-medium">{comp.label}</div>
                    <div className="text-orange-400 text-sm">{comp.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <input
                type="text"
                value={circuitName}
                onChange={(e) => setCircuitName(e.target.value)}
                placeholder="Enter circuit name..."
                className="flex-1 bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={saveCircuit}
                className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-lg shadow-orange-500/30 flex items-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>Save Circuit</span>
              </button>
            </div>
          </div>
        )}
      </FrameSection>

      <FrameSection title="About Circuit Generator">
        <p className="text-orange-300 text-sm">
          Click "Generate Random Circuit" to create a random circuit with various components.
          Each circuit includes a voltage source and random combinations of resistors, capacitors,
          and inductors. Save your favorite circuits to the database for future reference.
        </p>
      </FrameSection>
    </div>
  );
}

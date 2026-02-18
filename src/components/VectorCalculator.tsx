import { useState } from 'react';
import { Compass, Plus, Minus, X, Divide } from 'lucide-react';
import { FrameSection } from './ui/PageFrame';

export function VectorCalculator() {
  const [rectangular, setRectangular] = useState({ x: 3, y: 4 });
  const [polar, setPolar] = useState({ r: 5, theta: 53.13 });
  const [showWork, setShowWork] = useState(true);

  const [vector1, setVector1] = useState({ x: 3, y: 4 });
  const [vector2, setVector2] = useState({ x: 2, y: -1 });
  const [operation, setOperation] = useState<'add' | 'subtract' | 'multiply' | 'divide'>('add');

  const rectangularToPolar = (x: number, y: number) => {
    const r = Math.sqrt(x * x + y * y);
    const thetaRad = Math.atan2(y, x);
    const thetaDeg = (thetaRad * 180) / Math.PI;
    return { r: parseFloat(r.toFixed(4)), theta: parseFloat(thetaDeg.toFixed(2)) };
  };

  const polarToRectangular = (r: number, thetaDeg: number) => {
    const thetaRad = (thetaDeg * Math.PI) / 180;
    const x = r * Math.cos(thetaRad);
    const y = r * Math.sin(thetaRad);
    return { x: parseFloat(x.toFixed(4)), y: parseFloat(y.toFixed(4)) };
  };

  const handleRectangularChange = (field: 'x' | 'y', value: string) => {
    const numValue = parseFloat(value) || 0;
    const newRect = { ...rectangular, [field]: numValue };
    setRectangular(newRect);
    const newPolar = rectangularToPolar(newRect.x, newRect.y);
    setPolar(newPolar);
  };

  const handlePolarChange = (field: 'r' | 'theta', value: string) => {
    const numValue = parseFloat(value) || 0;
    const newPolar = { ...polar, [field]: numValue };
    setPolar(newPolar);
    const newRect = polarToRectangular(newPolar.r, newPolar.theta);
    setRectangular(newRect);
  };

  const performOperation = () => {
    const { x: x1, y: y1 } = vector1;
    const { x: x2, y: y2 } = vector2;

    switch (operation) {
      case 'add':
        return { x: x1 + x2, y: y1 + y2 };
      case 'subtract':
        return { x: x1 - x2, y: y1 - y2 };
      case 'multiply':
        return { x: x1 * x2 - y1 * y2, y: x1 * y2 + y1 * x2 };
      case 'divide':
        const denom = x2 * x2 + y2 * y2;
        if (denom === 0) return { x: 0, y: 0 };
        return {
          x: (x1 * x2 + y1 * y2) / denom,
          y: (y1 * x2 - x1 * y2) / denom,
        };
    }
  };

  const result = performOperation();
  const resultPolar = rectangularToPolar(result.x, result.y);
  const v1Polar = rectangularToPolar(vector1.x, vector1.y);
  const v2Polar = rectangularToPolar(vector2.x, vector2.y);

  const { r, theta } = polar;
  const { x, y } = rectangular;
  const thetaRad = ((theta * Math.PI) / 180).toFixed(4);

  const getSteps = () => {
    const { x: x1, y: y1 } = vector1;
    const { x: x2, y: y2 } = vector2;

    switch (operation) {
      case 'add':
        return [
          `Given: Z₁ = ${x1} + j${y1}, Z₂ = ${x2} + j${y2}`,
          `Addition formula: Z = (x₁ + x₂) + j(y₁ + y₂)`,
          `Real part: ${x1} + ${x2} = ${x1 + x2}`,
          `Imaginary part: ${y1} + ${y2} = ${y1 + y2}`,
          `Result: Z = ${result.x.toFixed(4)} + j${result.y.toFixed(4)}`,
        ];
      case 'subtract':
        return [
          `Given: Z₁ = ${x1} + j${y1}, Z₂ = ${x2} + j${y2}`,
          `Subtraction formula: Z = (x₁ - x₂) + j(y₁ - y₂)`,
          `Real part: ${x1} - ${x2} = ${x1 - x2}`,
          `Imaginary part: ${y1} - ${y2} = ${y1 - y2}`,
          `Result: Z = ${result.x.toFixed(4)} + j${result.y.toFixed(4)}`,
        ];
      case 'multiply':
        return [
          `Given: Z₁ = ${x1} + j${y1}, Z₂ = ${x2} + j${y2}`,
          `Multiplication formula: Z = (x₁x₂ - y₁y₂) + j(x₁y₂ + y₁x₂)`,
          `Real part: (${x1})(${x2}) - (${y1})(${y2}) = ${x1 * x2} - ${y1 * y2} = ${x1 * x2 - y1 * y2}`,
          `Imaginary part: (${x1})(${y2}) + (${y1})(${x2}) = ${x1 * y2} + ${y1 * x2} = ${x1 * y2 + y1 * x2}`,
          `Result: Z = ${result.x.toFixed(4)} + j${result.y.toFixed(4)}`,
          ``,
          `Alternative (Polar): Z₁ = ${v1Polar.r.toFixed(4)}∠${v1Polar.theta.toFixed(2)}°, Z₂ = ${v2Polar.r.toFixed(4)}∠${v2Polar.theta.toFixed(2)}°`,
          `Multiply magnitudes: r = ${v1Polar.r.toFixed(4)} × ${v2Polar.r.toFixed(4)} = ${resultPolar.r.toFixed(4)}`,
          `Add angles: θ = ${v1Polar.theta.toFixed(2)}° + ${v2Polar.theta.toFixed(2)}° = ${resultPolar.theta.toFixed(2)}°`,
          `Result: Z = ${resultPolar.r.toFixed(4)}∠${resultPolar.theta.toFixed(2)}°`,
        ];
      case 'divide':
        const denom = x2 * x2 + y2 * y2;
        return [
          `Given: Z₁ = ${x1} + j${y1}, Z₂ = ${x2} + j${y2}`,
          `Division formula: Z = [(x₁x₂ + y₁y₂) + j(y₁x₂ - x₁y₂)] / (x₂² + y₂²)`,
          `Denominator: ${x2}² + ${y2}² = ${x2 * x2} + ${y2 * y2} = ${denom}`,
          `Real numerator: (${x1})(${x2}) + (${y1})(${y2}) = ${x1 * x2 + y1 * y2}`,
          `Imaginary numerator: (${y1})(${x2}) - (${x1})(${y2}) = ${y1 * x2 - x1 * y2}`,
          `Real part: ${x1 * x2 + y1 * y2} / ${denom} = ${result.x.toFixed(4)}`,
          `Imaginary part: ${y1 * x2 - x1 * y2} / ${denom} = ${result.y.toFixed(4)}`,
          `Result: Z = ${result.x.toFixed(4)} + j${result.y.toFixed(4)}`,
          ``,
          `Alternative (Polar): Z₁ = ${v1Polar.r.toFixed(4)}∠${v1Polar.theta.toFixed(2)}°, Z₂ = ${v2Polar.r.toFixed(4)}∠${v2Polar.theta.toFixed(2)}°`,
          `Divide magnitudes: r = ${v1Polar.r.toFixed(4)} / ${v2Polar.r.toFixed(4)} = ${resultPolar.r.toFixed(4)}`,
          `Subtract angles: θ = ${v1Polar.theta.toFixed(2)}° - ${v2Polar.theta.toFixed(2)}° = ${resultPolar.theta.toFixed(2)}°`,
          `Result: Z = ${resultPolar.r.toFixed(4)}∠${resultPolar.theta.toFixed(2)}°`,
        ];
    }
  };

  const getConversionSteps = () => {
    return [
      `Given: Z = ${x} + j${y} (Rectangular form)`,
      ``,
      `Step 1: Calculate magnitude using r = √(x² + y²)`,
      `r = √(${x}² + ${y}²)`,
      `r = √(${x * x} + ${y * y})`,
      `r = √${(x * x + y * y).toFixed(4)}`,
      `r = ${r}`,
      ``,
      `Step 2: Calculate angle using θ = tan⁻¹(y/x)`,
      `θ = tan⁻¹(${y}/${x})`,
      `θ = tan⁻¹(${(y / x).toFixed(4)})`,
      `θ = ${theta}°`,
      ``,
      `Step 3: Express in different forms`,
      `Polar: Z = ${r}∠${theta}°`,
      `Trigonometric: Z = ${r}(cos(${theta}°) + j·sin(${theta}°))`,
      `Exponential: Z = ${r} · e^(j·${thetaRad} rad)`,
    ];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <Compass className="w-8 h-8 text-orange-400" />
        <h2 className="text-3xl font-bold text-white/90">Vector Representation & Operations</h2>
      </div>

      <FrameSection title="Vector Converter">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white/60">Rectangular Form (x + jy)</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-white/60 text-sm mb-1">Real Part (x)</label>
                <input
                  type="number"
                  step="0.01"
                  value={x}
                  onChange={(e) => handleRectangularChange('x', e.target.value)}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-1">Imaginary Part (y)</label>
                <input
                  type="number"
                  step="0.01"
                  value={y}
                  onChange={(e) => handleRectangularChange('y', e.target.value)}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                <p className="text-white/90 font-mono text-lg">
                  Z = {x} {y >= 0 ? '+' : ''} j{y}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white/60">Polar Form (r∠θ)</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-white/60 text-sm mb-1">Magnitude (r)</label>
                <input
                  type="number"
                  step="0.01"
                  value={r}
                  onChange={(e) => handlePolarChange('r', e.target.value)}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-1">Angle θ (degrees)</label>
                <input
                  type="number"
                  step="0.01"
                  value={theta}
                  onChange={(e) => handlePolarChange('theta', e.target.value)}
                  className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                <p className="text-white/90 font-mono text-lg">
                  Z = {r}∠{theta}°
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <h4 className="text-lg font-semibold text-white/60">All Representations</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black/50 border border-white/10 rounded-lg p-4">
              <p className="text-orange-400 text-sm font-semibold mb-2">Rectangular</p>
              <p className="text-white/90 font-mono">Z = {x} {y >= 0 ? '+' : ''} j{y}</p>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-4">
              <p className="text-orange-400 text-sm font-semibold mb-2">Polar</p>
              <p className="text-white/90 font-mono">Z = {r}∠{theta}°</p>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-4">
              <p className="text-orange-400 text-sm font-semibold mb-2">Trigonometric</p>
              <p className="text-white/90 font-mono text-sm">
                Z = {r}(cos({theta}°) + j·sin({theta}°))
              </p>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-4">
              <p className="text-orange-400 text-sm font-semibold mb-2">Exponential</p>
              <p className="text-white/90 font-mono text-sm">
                Z = {r} · e^(j·{thetaRad} rad)
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={() => setShowWork(!showWork)}
            className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-white/90 px-4 py-2 rounded-lg transition-all"
          >
            {showWork ? 'Hide' : 'Show'} Step-by-Step Work
          </button>

          {showWork && (
            <div className="mt-4 bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-lg p-5">
              <h4 className="text-white/60 font-semibold mb-3">Step-by-Step Conversion</h4>
              <div className="space-y-1 text-white/80 font-mono text-sm">
                {getConversionSteps().map((step, i) => (
                  <p key={i} className={step === '' ? 'h-2' : ''}>
                    {step}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </FrameSection>

      <FrameSection title="Vector Operations">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white/60">Vector 1 (Z₁)</h4>
            <div>
              <label className="block text-white/60 text-sm mb-1">Real (x₁)</label>
              <input
                type="number"
                step="0.01"
                value={vector1.x}
                onChange={(e) => setVector1({ ...vector1, x: parseFloat(e.target.value) || 0 })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-1">Imaginary (y₁)</label>
              <input
                type="number"
                step="0.01"
                value={vector1.y}
                onChange={(e) => setVector1({ ...vector1, y: parseFloat(e.target.value) || 0 })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <p className="text-white/90 font-mono text-sm">
                Z₁ = {vector1.x} {vector1.y >= 0 ? '+' : ''} j{vector1.y}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white/60">Operation</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOperation('add')}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
                  operation === 'add'
                    ? 'bg-orange-500/30 border-2 border-orange-400 text-white/90'
                    : 'bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
              <button
                onClick={() => setOperation('subtract')}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
                  operation === 'subtract'
                    ? 'bg-orange-500/30 border-2 border-orange-400 text-white/90'
                    : 'bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10'
                }`}
              >
                <Minus className="w-4 h-4" />
                <span>Subtract</span>
              </button>
              <button
                onClick={() => setOperation('multiply')}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
                  operation === 'multiply'
                    ? 'bg-orange-500/30 border-2 border-orange-400 text-white/90'
                    : 'bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10'
                }`}
              >
                <X className="w-4 h-4" />
                <span>Multiply</span>
              </button>
              <button
                onClick={() => setOperation('divide')}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
                  operation === 'divide'
                    ? 'bg-orange-500/30 border-2 border-orange-400 text-white/90'
                    : 'bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10'
                }`}
              >
                <Divide className="w-4 h-4" />
                <span>Divide</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white/60">Vector 2 (Z₂)</h4>
            <div>
              <label className="block text-white/60 text-sm mb-1">Real (x₂)</label>
              <input
                type="number"
                step="0.01"
                value={vector2.x}
                onChange={(e) => setVector2({ ...vector2, x: parseFloat(e.target.value) || 0 })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-1">Imaginary (y₂)</label>
              <input
                type="number"
                step="0.01"
                value={vector2.y}
                onChange={(e) => setVector2({ ...vector2, y: parseFloat(e.target.value) || 0 })}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <p className="text-white/90 font-mono text-sm">
                Z₂ = {vector2.x} {vector2.y >= 0 ? '+' : ''} j{vector2.y}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <h4 className="text-lg font-semibold text-white/60">Result</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-green-400 text-sm font-semibold mb-2">Rectangular Form</p>
              <p className="text-white/90 font-mono text-lg">
                Z = {result.x.toFixed(4)} {result.y >= 0 ? '+' : ''} j{result.y.toFixed(4)}
              </p>
            </div>

            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-green-400 text-sm font-semibold mb-2">Polar Form</p>
              <p className="text-white/90 font-mono text-lg">
                Z = {resultPolar.r.toFixed(4)}∠{resultPolar.theta.toFixed(2)}°
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-lg p-5">
            <h4 className="text-white/60 font-semibold mb-3">Step-by-Step Solution</h4>
            <div className="space-y-1 text-white/80 font-mono text-sm">
              {getSteps().map((step, i) => (
                <p key={i} className={step === '' ? 'h-2' : ''}>
                  {step}
                </p>
              ))}
            </div>
          </div>
        </div>
      </FrameSection>

      <FrameSection title="Formulas">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-black/50 border border-white/10 rounded-lg p-4">
            <h4 className="text-white/60 font-semibold mb-2">Addition & Subtraction</h4>
            <div className="space-y-2 text-white/90 font-mono text-sm">
              <p>Z₁ ± Z₂ = (x₁ ± x₂) + j(y₁ ± y₂)</p>
            </div>
          </div>

          <div className="bg-black/50 border border-white/10 rounded-lg p-4">
            <h4 className="text-white/60 font-semibold mb-2">Multiplication</h4>
            <div className="space-y-2 text-white/90 font-mono text-sm">
              <p>Z₁ × Z₂ = (x₁x₂ - y₁y₂) + j(x₁y₂ + y₁x₂)</p>
              <p className="text-white/60">Polar: r₁r₂∠(θ₁ + θ₂)</p>
            </div>
          </div>

          <div className="bg-black/50 border border-white/10 rounded-lg p-4">
            <h4 className="text-white/60 font-semibold mb-2">Division</h4>
            <div className="space-y-2 text-white/90 font-mono text-xs">
              <p>Z₁ / Z₂ = [(x₁x₂ + y₁y₂) + j(y₁x₂ - x₁y₂)] / (x₂² + y₂²)</p>
              <p className="text-white/60">Polar: (r₁/r₂)∠(θ₁ - θ₂)</p>
            </div>
          </div>

          <div className="bg-black/50 border border-white/10 rounded-lg p-4">
            <h4 className="text-white/60 font-semibold mb-2">Conversion</h4>
            <div className="space-y-2 text-white/90 font-mono text-sm">
              <p>r = √(x² + y²)</p>
              <p>θ = tan⁻¹(y/x)</p>
            </div>
          </div>
        </div>
      </FrameSection>

      <FrameSection title="Example: Vector Multiplication">
        <div className="space-y-2 text-white/80">
          <p>Given: Z₁ = 3 + j4, Z₂ = 2 - j1</p>
          <p className="pl-4">• Method 1 (Rectangular): (3)(2) - (4)(-1) + j[(3)(-1) + (4)(2)] = 10 + j5</p>
          <p className="pl-4">• Method 2 (Polar): Z₁ = 5∠53.13°, Z₂ = 2.236∠-26.57°</p>
          <p className="pl-4">• Multiply magnitudes: 5 × 2.236 = 11.18</p>
          <p className="pl-4">• Add angles: 53.13° + (-26.57°) = 26.56°</p>
          <p className="pl-4">• Result: Z = 11.18∠26.56° = 10 + j5</p>
        </div>
      </FrameSection>
    </div>
  );
}

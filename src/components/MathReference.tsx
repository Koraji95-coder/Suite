import { useState } from 'react';
import { BookOpen, Calculator, TrendingUp } from 'lucide-react';
import { FrameSection } from './ui/PageFrame';

export function MathReference() {
  const [activeTab, setActiveTab] = useState<'algebra' | 'trig' | 'complex'>('algebra');

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <BookOpen className="w-8 h-8 text-orange-400" />
        <h2 className="text-3xl font-bold text-white/90">Mathematical Reference</h2>
      </div>

      <FrameSection>
        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setActiveTab('algebra')}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition-all ${
              activeTab === 'algebra'
                ? 'bg-orange-500/30 border-2 border-orange-400 text-white/90'
                : 'bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Algebra & Trig</span>
          </button>
          <button
            onClick={() => setActiveTab('trig')}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition-all ${
              activeTab === 'trig'
                ? 'bg-orange-500/30 border-2 border-orange-400 text-white/90'
                : 'bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>Trigonometry</span>
          </button>
          <button
            onClick={() => setActiveTab('complex')}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition-all ${
              activeTab === 'complex'
                ? 'bg-orange-500/30 border-2 border-orange-400 text-white/90'
                : 'bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Complex Numbers</span>
          </button>
        </div>

        {activeTab === 'algebra' && (
          <div className="space-y-6">
            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Line Equations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-white/60 text-sm font-semibold mb-1">Slope-Intercept Form</p>
                    <p className="text-white/90 font-mono">y = mx + b</p>
                    <p className="text-white/60 text-xs">m = slope, b = y-intercept</p>
                  </div>
                  <div>
                    <p className="text-white/60 text-sm font-semibold mb-1">Point-Slope Form</p>
                    <p className="text-white/90 font-mono">y - y₁ = m(x - x₁)</p>
                    <p className="text-white/60 text-xs">Point (x₁, y₁) with slope m</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-white/60 text-sm font-semibold mb-1">Two-Point Form</p>
                    <p className="text-white/90 font-mono text-sm">m = (y₂ - y₁)/(x₂ - x₁)</p>
                    <p className="text-white/60 text-xs">Slope between two points</p>
                  </div>
                  <div>
                    <p className="text-white/60 text-sm font-semibold mb-1">Standard Form</p>
                    <p className="text-white/90 font-mono">Ax + By = C</p>
                    <p className="text-white/60 text-xs">A, B, C are constants</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Law of Sines</h3>
              <div className="space-y-3">
                <p className="text-white/90 font-mono text-lg text-center">
                  a/sin(A) = b/sin(B) = c/sin(C)
                </p>
                <p className="text-white/60 text-sm">
                  Used for solving triangles when you know: two angles and one side, or two sides and a non-included angle
                </p>
                <div className="bg-orange-500/10 border border-white/10 rounded p-3 mt-3">
                  <p className="text-white/80 text-sm">
                    <strong>Example:</strong> If a = 10, A = 30°, B = 45°, find b<br />
                    b = a × sin(B) / sin(A) = 10 × sin(45°) / sin(30°) = 14.14
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Law of Cosines</h3>
              <div className="space-y-3">
                <div className="font-mono text-white/90 space-y-1">
                  <p>c² = a² + b² - 2ab·cos(C)</p>
                  <p>cos(C) = (a² + b² - c²) / (2ab)</p>
                </div>
                <p className="text-white/60 text-sm">
                  Used for solving triangles when you know: three sides, or two sides and the included angle
                </p>
                <div className="bg-orange-500/10 border border-white/10 rounded p-3 mt-3">
                  <p className="text-white/80 text-sm">
                    <strong>Example:</strong> If a = 5, b = 7, C = 60°, find c<br />
                    c² = 5² + 7² - 2(5)(7)cos(60°) = 25 + 49 - 35 = 39<br />
                    c = √39 ≈ 6.24
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trig' && (
          <div className="space-y-6">
            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Right Triangle Relationships</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-white/60 font-semibold mb-2">Basic Definitions</p>
                  <div className="font-mono text-white/90 text-sm space-y-1">
                    <p>sin(θ) = opposite / hypotenuse</p>
                    <p>cos(θ) = adjacent / hypotenuse</p>
                    <p>tan(θ) = opposite / adjacent</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-white/60 font-semibold mb-2">Reciprocal Functions</p>
                  <div className="font-mono text-white/90 text-sm space-y-1">
                    <p>csc(θ) = 1 / sin(θ)</p>
                    <p>sec(θ) = 1 / cos(θ)</p>
                    <p>cot(θ) = 1 / tan(θ)</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 bg-orange-500/10 border border-white/10 rounded p-3">
                <p className="text-white/90 font-mono text-sm">Pythagorean Theorem: a² + b² = c²</p>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Unit Circle Values</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-orange-500/30">
                      <th className="text-white/60 text-left p-2">Angle</th>
                      <th className="text-white/60 text-left p-2">Radians</th>
                      <th className="text-white/60 text-left p-2">sin(θ)</th>
                      <th className="text-white/60 text-left p-2">cos(θ)</th>
                      <th className="text-white/60 text-left p-2">tan(θ)</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-white/90">
                    <tr className="border-b border-white/\[0.06\]">
                      <td className="p-2">0°</td>
                      <td className="p-2">0</td>
                      <td className="p-2">0</td>
                      <td className="p-2">1</td>
                      <td className="p-2">0</td>
                    </tr>
                    <tr className="border-b border-white/\[0.06\]">
                      <td className="p-2">30°</td>
                      <td className="p-2">π/6</td>
                      <td className="p-2">1/2</td>
                      <td className="p-2">√3/2</td>
                      <td className="p-2">√3/3</td>
                    </tr>
                    <tr className="border-b border-white/\[0.06\]">
                      <td className="p-2">45°</td>
                      <td className="p-2">π/4</td>
                      <td className="p-2">√2/2</td>
                      <td className="p-2">√2/2</td>
                      <td className="p-2">1</td>
                    </tr>
                    <tr className="border-b border-white/\[0.06\]">
                      <td className="p-2">60°</td>
                      <td className="p-2">π/3</td>
                      <td className="p-2">√3/2</td>
                      <td className="p-2">1/2</td>
                      <td className="p-2">√3</td>
                    </tr>
                    <tr>
                      <td className="p-2">90°</td>
                      <td className="p-2">π/2</td>
                      <td className="p-2">1</td>
                      <td className="p-2">0</td>
                      <td className="p-2">undefined</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Trigonometric Identities</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-white/60 font-semibold mb-2">Pythagorean Identities</p>
                  <div className="font-mono text-white/90 text-sm space-y-1">
                    <p>sin²(θ) + cos²(θ) = 1</p>
                    <p>1 + tan²(θ) = sec²(θ)</p>
                    <p>1 + cot²(θ) = csc²(θ)</p>
                  </div>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Angle Sum/Difference</p>
                  <div className="font-mono text-white/90 text-sm space-y-1">
                    <p>sin(α ± β) = sin(α)cos(β) ± cos(α)sin(β)</p>
                    <p>cos(α ± β) = cos(α)cos(β) ∓ sin(α)sin(β)</p>
                  </div>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Double Angle</p>
                  <div className="font-mono text-white/90 text-sm space-y-1">
                    <p>sin(2θ) = 2sin(θ)cos(θ)</p>
                    <p>cos(2θ) = cos²(θ) - sin²(θ)</p>
                    <p>tan(2θ) = 2tan(θ) / (1 - tan²(θ))</p>
                  </div>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Half Angle</p>
                  <div className="font-mono text-white/90 text-sm space-y-1">
                    <p>sin(θ/2) = ±√[(1 - cos(θ))/2]</p>
                    <p>cos(θ/2) = ±√[(1 + cos(θ))/2]</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'complex' && (
          <div className="space-y-6">
            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Complex Number Forms</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-white/60 font-semibold mb-2">Rectangular Form</p>
                  <p className="text-white/90 font-mono text-lg">z = x + jy = a + jb</p>
                  <p className="text-white/60 text-sm">x = real part, y = imaginary part</p>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Polar Form</p>
                  <p className="text-white/90 font-mono text-lg">z = r∠θ = |z|∠arg(z)</p>
                  <p className="text-white/60 text-sm">r = magnitude, θ = angle (argument)</p>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Exponential Form</p>
                  <p className="text-white/90 font-mono text-lg">z = r·e^(jθ)</p>
                  <p className="text-white/60 text-sm">Using Euler's formula</p>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Arithmetic Operations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-white/60 font-semibold mb-2">Addition & Subtraction</p>
                  <div className="font-mono text-white/90 text-sm space-y-2">
                    <p>(a + jb) + (c + jd) = (a + c) + j(b + d)</p>
                    <p>(a + jb) - (c + jd) = (a - c) + j(b - d)</p>
                  </div>
                  <p className="text-white/60 text-xs mt-2">Add/subtract real and imaginary parts separately</p>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Multiplication (Rectangular)</p>
                  <div className="font-mono text-white/90 text-sm space-y-2">
                    <p>(a + jb)(c + jd) =</p>
                    <p>(ac - bd) + j(ad + bc)</p>
                  </div>
                  <p className="text-white/60 text-xs mt-2">Remember: j² = -1</p>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Multiplication (Polar)</p>
                  <div className="font-mono text-white/90 text-sm space-y-2">
                    <p>r₁∠θ₁ × r₂∠θ₂ = (r₁r₂)∠(θ₁ + θ₂)</p>
                  </div>
                  <p className="text-white/60 text-xs mt-2">Multiply magnitudes, add angles</p>
                </div>
                <div>
                  <p className="text-white/60 font-semibold mb-2">Division (Polar)</p>
                  <div className="font-mono text-white/90 text-sm space-y-2">
                    <p>r₁∠θ₁ / r₂∠θ₂ = (r₁/r₂)∠(θ₁ - θ₂)</p>
                  </div>
                  <p className="text-white/60 text-xs mt-2">Divide magnitudes, subtract angles</p>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Complex Conjugate</h3>
              <div className="space-y-3">
                <div className="font-mono text-white/90 space-y-1">
                  <p>If z = x + jy, then z* = x - jy</p>
                  <p>If z = r∠θ, then z* = r∠(-θ)</p>
                </div>
                <div className="bg-orange-500/10 border border-white/10 rounded p-3">
                  <p className="text-white/80 text-sm">
                    <strong>Properties:</strong><br />
                    • z × z* = |z|² = x² + y²<br />
                    • (z₁ + z₂)* = z₁* + z₂*<br />
                    • (z₁ × z₂)* = z₁* × z₂*
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Euler's Identity</h3>
              <div className="space-y-3">
                <p className="text-white/90 font-mono text-xl text-center">e^(jθ) = cos(θ) + j·sin(θ)</p>
                <p className="text-white/60 text-sm text-center">Euler's Formula</p>
                <div className="mt-4 space-y-2">
                  <p className="text-white/60 font-semibold">Special Cases:</p>
                  <div className="font-mono text-white/90 text-sm space-y-1">
                    <p>e^(jπ) + 1 = 0  (Euler's Identity)</p>
                    <p>e^(j·π/2) = j</p>
                    <p>e^(j·2π) = 1</p>
                  </div>
                </div>
                <div className="mt-4 bg-orange-500/10 border border-white/10 rounded p-3">
                  <p className="text-white/80 text-sm">
                    <strong>Usage in EE:</strong> Converts between time domain and phasor domain for AC circuit analysis
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Roots of Complex Numbers</h3>
              <div className="space-y-3">
                <p className="text-white/60 font-semibold">De Moivre's Theorem for nth roots:</p>
                <div className="font-mono text-white/90 text-sm space-y-2">
                  <p>If z = r∠θ, then the n roots are:</p>
                  <p>z_k = r^(1/n) ∠ [(θ + 2πk) / n]</p>
                  <p>where k = 0, 1, 2, ..., n-1</p>
                </div>
                <div className="mt-4 bg-orange-500/10 border border-white/10 rounded p-3">
                  <p className="text-white/80 text-sm">
                    <strong>Example:</strong> Find cube roots of 8<br />
                    z = 8 = 8∠0°<br />
                    z₀ = 2∠0° = 2<br />
                    z₁ = 2∠120° = -1 + j1.732<br />
                    z₂ = 2∠240° = -1 - j1.732
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-xl font-bold text-white/90 mb-4">Polar Coordinate System</h3>
              <div className="space-y-3">
                <p className="text-white/60 font-semibold">Conversion Formulas:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-white/60 text-sm mb-1">Rectangular to Polar:</p>
                    <div className="font-mono text-white/90 text-sm space-y-1">
                      <p>r = √(x² + y²)</p>
                      <p>θ = tan⁻¹(y/x)</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-white/60 text-sm mb-1">Polar to Rectangular:</p>
                    <div className="font-mono text-white/90 text-sm space-y-1">
                      <p>x = r·cos(θ)</p>
                      <p>y = r·sin(θ)</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-white/60 text-xs">
                  <p><strong>Quadrant Considerations:</strong></p>
                  <p>• Q1 (x&gt;0, y&gt;0): θ as calculated</p>
                  <p>• Q2 (x&lt;0, y&gt;0): θ = 180° - |θ|</p>
                  <p>• Q3 (x&lt;0, y&lt;0): θ = 180° + |θ|</p>
                  <p>• Q4 (x&gt;0, y&lt;0): θ = 360° - |θ|</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </FrameSection>
    </div>
  );
}

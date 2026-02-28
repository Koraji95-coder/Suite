import { BookOpen, Calculator, TrendingUp } from "lucide-react";
import { useState } from "react";
import { FrameSection } from "../../apps/ui/PageFrame";

export function MathReference() {
	const [activeTab, setActiveTab] = useState<"algebra" | "trig" | "complex">(
		"algebra",
	);
	const tabClass = (isActive: boolean) =>
		`flex items-center space-x-2 rounded-lg px-6 py-3 transition-all ${
			isActive
				? "border-2 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_28%,transparent)] [color:var(--text)]"
				: "border [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,var(--surface))]"
		}`;
	const cardClass =
		"rounded-lg border p-5 [border-color:var(--border)] [background:var(--surface)]";

	return (
		<div className="space-y-6">
			<div className="flex items-center space-x-3 mb-6">
				<BookOpen className="h-8 w-8 [color:var(--primary)]" />
				<h2 className="text-3xl font-bold [color:var(--text)]">
					Mathematical Reference
				</h2>
			</div>

			<FrameSection>
				<div className="flex space-x-2 mb-6">
					<button
						onClick={() => setActiveTab("algebra")}
						className={tabClass(activeTab === "algebra")}
					>
						<TrendingUp className="w-4 h-4" />
						<span>Algebra & Trig</span>
					</button>
					<button
						onClick={() => setActiveTab("trig")}
						className={tabClass(activeTab === "trig")}
					>
						<Calculator className="w-4 h-4" />
						<span>Trigonometry</span>
					</button>
					<button
						onClick={() => setActiveTab("complex")}
						className={tabClass(activeTab === "complex")}
					>
						<BookOpen className="w-4 h-4" />
						<span>Complex Numbers</span>
					</button>
				</div>

				{activeTab === "algebra" && (
					<div className="space-y-6">
						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Line Equations
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-3">
									<div>
										<p className="mb-1 text-sm font-semibold [color:var(--text-muted)]">
											Slope-Intercept Form
										</p>
										<p className="font-mono [color:var(--text)]">y = mx + b</p>
										<p className="text-xs [color:var(--text-muted)]">
											m = slope, b = y-intercept
										</p>
									</div>
									<div>
										<p className="mb-1 text-sm font-semibold [color:var(--text-muted)]">
											Point-Slope Form
										</p>
										<p className="font-mono [color:var(--text)]">
											y - y₁ = m(x - x₁)
										</p>
										<p className="text-xs [color:var(--text-muted)]">
											Point (x₁, y₁) with slope m
										</p>
									</div>
								</div>
								<div className="space-y-3">
									<div>
										<p className="mb-1 text-sm font-semibold [color:var(--text-muted)]">
											Two-Point Form
										</p>
										<p className="font-mono text-sm [color:var(--text)]">
											m = (y₂ - y₁)/(x₂ - x₁)
										</p>
										<p className="text-xs [color:var(--text-muted)]">
											Slope between two points
										</p>
									</div>
									<div>
										<p className="mb-1 text-sm font-semibold [color:var(--text-muted)]">
											Standard Form
										</p>
										<p className="font-mono [color:var(--text)]">Ax + By = C</p>
										<p className="text-xs [color:var(--text-muted)]">
											A, B, C are constants
										</p>
									</div>
								</div>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Law of Sines
							</h3>
							<div className="space-y-3">
								<p className="text-center font-mono text-lg [color:var(--text)]">
									a/sin(A) = b/sin(B) = c/sin(C)
								</p>
								<p className="text-sm [color:var(--text-muted)]">
									Used for solving triangles when you know: two angles and one
									side, or two sides and a non-included angle
								</p>
								<div className="mt-3 rounded border p-3 [border-color:var(--border)] [background:var(--surface-2)]">
									<p className="text-sm [color:var(--text)]">
										<strong>Example:</strong> If a = 10, A = 30°, B = 45°, find
										b<br />b = a × sin(B) / sin(A) = 10 × sin(45°) / sin(30°) =
										14.14
									</p>
								</div>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Law of Cosines
							</h3>
							<div className="space-y-3">
								<div className="space-y-1 font-mono [color:var(--text)]">
									<p>c² = a² + b² - 2ab·cos(C)</p>
									<p>cos(C) = (a² + b² - c²) / (2ab)</p>
								</div>
								<p className="text-sm [color:var(--text-muted)]">
									Used for solving triangles when you know: three sides, or two
									sides and the included angle
								</p>
								<div className="mt-3 rounded border p-3 [border-color:var(--border)] [background:var(--surface-2)]">
									<p className="text-sm [color:var(--text)]">
										<strong>Example:</strong> If a = 5, b = 7, C = 60°, find c
										<br />
										c² = 5² + 7² - 2(5)(7)cos(60°) = 25 + 49 - 35 = 39
										<br />c = √39 ≈ 6.24
									</p>
								</div>
							</div>
						</div>
					</div>
				)}

				{activeTab === "trig" && (
					<div className="space-y-6">
						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Right Triangle Relationships
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Basic Definitions
									</p>
									<div className="space-y-1 font-mono text-sm [color:var(--text)]">
										<p>sin(θ) = opposite / hypotenuse</p>
										<p>cos(θ) = adjacent / hypotenuse</p>
										<p>tan(θ) = opposite / adjacent</p>
									</div>
								</div>
								<div className="space-y-2">
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Reciprocal Functions
									</p>
									<div className="space-y-1 font-mono text-sm [color:var(--text)]">
										<p>csc(θ) = 1 / sin(θ)</p>
										<p>sec(θ) = 1 / cos(θ)</p>
										<p>cot(θ) = 1 / tan(θ)</p>
									</div>
								</div>
							</div>
							<div className="mt-4 rounded border p-3 [border-color:var(--border)] [background:var(--surface-2)]">
								<p className="font-mono text-sm [color:var(--text)]">
									Pythagorean Theorem: a² + b² = c²
								</p>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Unit Circle Values
							</h3>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b [border-color:var(--border)]">
											<th className="p-2 text-left [color:var(--text-muted)]">
												Angle
											</th>
											<th className="p-2 text-left [color:var(--text-muted)]">
												Radians
											</th>
											<th className="p-2 text-left [color:var(--text-muted)]">
												sin(θ)
											</th>
											<th className="p-2 text-left [color:var(--text-muted)]">
												cos(θ)
											</th>
											<th className="p-2 text-left [color:var(--text-muted)]">
												tan(θ)
											</th>
										</tr>
									</thead>
									<tbody className="font-mono [color:var(--text)]">
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

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Trigonometric Identities
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Pythagorean Identities
									</p>
									<div className="space-y-1 font-mono text-sm [color:var(--text)]">
										<p>sin²(θ) + cos²(θ) = 1</p>
										<p>1 + tan²(θ) = sec²(θ)</p>
										<p>1 + cot²(θ) = csc²(θ)</p>
									</div>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Angle Sum/Difference
									</p>
									<div className="space-y-1 font-mono text-sm [color:var(--text)]">
										<p>sin(α ± β) = sin(α)cos(β) ± cos(α)sin(β)</p>
										<p>cos(α ± β) = cos(α)cos(β) ∓ sin(α)sin(β)</p>
									</div>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Double Angle
									</p>
									<div className="space-y-1 font-mono text-sm [color:var(--text)]">
										<p>sin(2θ) = 2sin(θ)cos(θ)</p>
										<p>cos(2θ) = cos²(θ) - sin²(θ)</p>
										<p>tan(2θ) = 2tan(θ) / (1 - tan²(θ))</p>
									</div>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Half Angle
									</p>
									<div className="space-y-1 font-mono text-sm [color:var(--text)]">
										<p>sin(θ/2) = ±√[(1 - cos(θ))/2]</p>
										<p>cos(θ/2) = ±√[(1 + cos(θ))/2]</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{activeTab === "complex" && (
					<div className="space-y-6">
						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Complex Number Forms
							</h3>
							<div className="space-y-4">
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Rectangular Form
									</p>
									<p className="font-mono text-lg [color:var(--text)]">
										z = x + jy = a + jb
									</p>
									<p className="text-sm [color:var(--text-muted)]">
										x = real part, y = imaginary part
									</p>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Polar Form
									</p>
									<p className="font-mono text-lg [color:var(--text)]">
										z = r∠θ = |z|∠arg(z)
									</p>
									<p className="text-sm [color:var(--text-muted)]">
										r = magnitude, θ = angle (argument)
									</p>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Exponential Form
									</p>
									<p className="font-mono text-lg [color:var(--text)]">
										z = r·e^(jθ)
									</p>
									<p className="text-sm [color:var(--text-muted)]">
										Using Euler's formula
									</p>
								</div>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Arithmetic Operations
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Addition & Subtraction
									</p>
									<div className="space-y-2 font-mono text-sm [color:var(--text)]">
										<p>(a + jb) + (c + jd) = (a + c) + j(b + d)</p>
										<p>(a + jb) - (c + jd) = (a - c) + j(b - d)</p>
									</div>
									<p className="mt-2 text-xs [color:var(--text-muted)]">
										Add/subtract real and imaginary parts separately
									</p>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Multiplication (Rectangular)
									</p>
									<div className="space-y-2 font-mono text-sm [color:var(--text)]">
										<p>(a + jb)(c + jd) =</p>
										<p>(ac - bd) + j(ad + bc)</p>
									</div>
									<p className="mt-2 text-xs [color:var(--text-muted)]">
										Remember: j² = -1
									</p>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Multiplication (Polar)
									</p>
									<div className="space-y-2 font-mono text-sm [color:var(--text)]">
										<p>r₁∠θ₁ × r₂∠θ₂ = (r₁r₂)∠(θ₁ + θ₂)</p>
									</div>
									<p className="mt-2 text-xs [color:var(--text-muted)]">
										Multiply magnitudes, add angles
									</p>
								</div>
								<div>
									<p className="mb-2 font-semibold [color:var(--text-muted)]">
										Division (Polar)
									</p>
									<div className="space-y-2 font-mono text-sm [color:var(--text)]">
										<p>r₁∠θ₁ / r₂∠θ₂ = (r₁/r₂)∠(θ₁ - θ₂)</p>
									</div>
									<p className="mt-2 text-xs [color:var(--text-muted)]">
										Divide magnitudes, subtract angles
									</p>
								</div>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Complex Conjugate
							</h3>
							<div className="space-y-3">
								<div className="space-y-1 font-mono [color:var(--text)]">
									<p>If z = x + jy, then z* = x - jy</p>
									<p>If z = r∠θ, then z* = r∠(-θ)</p>
								</div>
								<div className="rounded border p-3 [border-color:var(--border)] [background:var(--surface-2)]">
									<p className="text-sm [color:var(--text)]">
										<strong>Properties:</strong>
										<br />• z × z* = |z|² = x² + y²
										<br />• (z₁ + z₂)* = z₁* + z₂*
										<br />• (z₁ × z₂)* = z₁* × z₂*
									</p>
								</div>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Euler's Identity
							</h3>
							<div className="space-y-3">
								<p className="text-center font-mono text-xl [color:var(--text)]">
									e^(jθ) = cos(θ) + j·sin(θ)
								</p>
								<p className="text-center text-sm [color:var(--text-muted)]">
									Euler's Formula
								</p>
								<div className="mt-4 space-y-2">
									<p className="font-semibold [color:var(--text-muted)]">
										Special Cases:
									</p>
									<div className="space-y-1 font-mono text-sm [color:var(--text)]">
										<p>e^(jπ) + 1 = 0 (Euler's Identity)</p>
										<p>e^(j·π/2) = j</p>
										<p>e^(j·2π) = 1</p>
									</div>
								</div>
								<div className="mt-4 rounded border p-3 [border-color:var(--border)] [background:var(--surface-2)]">
									<p className="text-sm [color:var(--text)]">
										<strong>Usage in EE:</strong> Converts between time domain
										and phasor domain for AC circuit analysis
									</p>
								</div>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Roots of Complex Numbers
							</h3>
							<div className="space-y-3">
								<p className="font-semibold [color:var(--text-muted)]">
									De Moivre's Theorem for nth roots:
								</p>
								<div className="space-y-2 font-mono text-sm [color:var(--text)]">
									<p>If z = r∠θ, then the n roots are:</p>
									<p>z_k = r^(1/n) ∠ [(θ + 2πk) / n]</p>
									<p>where k = 0, 1, 2, ..., n-1</p>
								</div>
								<div className="mt-4 rounded border p-3 [border-color:var(--border)] [background:var(--surface-2)]">
									<p className="text-sm [color:var(--text)]">
										<strong>Example:</strong> Find cube roots of 8<br />z = 8 =
										8∠0°
										<br />
										z₀ = 2∠0° = 2<br />
										z₁ = 2∠120° = -1 + j1.732
										<br />
										z₂ = 2∠240° = -1 - j1.732
									</p>
								</div>
							</div>
						</div>

						<div className={cardClass}>
							<h3 className="mb-4 text-xl font-bold [color:var(--text)]">
								Polar Coordinate System
							</h3>
							<div className="space-y-3">
								<p className="font-semibold [color:var(--text-muted)]">
									Conversion Formulas:
								</p>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<p className="mb-1 text-sm [color:var(--text-muted)]">
											Rectangular to Polar:
										</p>
										<div className="space-y-1 font-mono text-sm [color:var(--text)]">
											<p>r = √(x² + y²)</p>
											<p>θ = tan⁻¹(y/x)</p>
										</div>
									</div>
									<div>
										<p className="mb-1 text-sm [color:var(--text-muted)]">
											Polar to Rectangular:
										</p>
										<div className="space-y-1 font-mono text-sm [color:var(--text)]">
											<p>x = r·cos(θ)</p>
											<p>y = r·sin(θ)</p>
										</div>
									</div>
								</div>
								<div className="mt-3 text-xs [color:var(--text-muted)]">
									<p>
										<strong>Quadrant Considerations:</strong>
									</p>
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

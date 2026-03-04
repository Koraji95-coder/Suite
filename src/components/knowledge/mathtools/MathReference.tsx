import { BookOpen, Calculator, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/apps/ui/PageFrame";
import { cn } from "@/lib/utils";
import styles from "./MathReference.module.css";

export function MathReference() {
	const [activeTab, setActiveTab] = useState<"algebra" | "trig" | "complex">(
		"algebra",
	);
	const tabClass = (isActive: boolean) =>
		cn(
			styles.tabButton,
			isActive ? styles.tabButtonActive : styles.tabButtonInactive,
		);

	return (
		<div className={styles.root}>
			<div className={styles.headerRow}>
				<BookOpen className={styles.headerIcon} />
				<h2 className={styles.pageTitle}>Mathematical Reference</h2>
			</div>

			<Section>
				<div className={styles.tabsRow}>
					<button
						onClick={() => setActiveTab("algebra")}
						className={tabClass(activeTab === "algebra")}
					>
						<TrendingUp className={styles.icon16} />
						<span>Algebra & Trig</span>
					</button>
					<button
						onClick={() => setActiveTab("trig")}
						className={tabClass(activeTab === "trig")}
					>
						<Calculator className={styles.icon16} />
						<span>Trigonometry</span>
					</button>
					<button
						onClick={() => setActiveTab("complex")}
						className={tabClass(activeTab === "complex")}
					>
						<BookOpen className={styles.icon16} />
						<span>Complex Numbers</span>
					</button>
				</div>

				{activeTab === "algebra" && (
					<div className={styles.root}>
						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Line Equations</h3>
							<div className={styles.twoColGrid}>
								<div className={styles.stack3}>
									<div>
										<p className={styles.labelSmMuted}>Slope-Intercept Form</p>
										<p className={styles.monoText}>y = mx + b</p>
										<p className={styles.textXsMuted}>
											m = slope, b = y-intercept
										</p>
									</div>
									<div>
										<p className={styles.labelSmMuted}>Point-Slope Form</p>
										<p className={styles.monoText}>y - y₁ = m(x - x₁)</p>
										<p className={styles.textXsMuted}>
											Point (x₁, y₁) with slope m
										</p>
									</div>
								</div>
								<div className={styles.stack3}>
									<div>
										<p className={styles.labelSmMuted}>Two-Point Form</p>
										<p className={styles.monoSm}>m = (y₂ - y₁)/(x₂ - x₁)</p>
										<p className={styles.textXsMuted}>
											Slope between two points
										</p>
									</div>
									<div>
										<p className={styles.labelSmMuted}>Standard Form</p>
										<p className={styles.monoText}>Ax + By = C</p>
										<p className={styles.textXsMuted}>A, B, C are constants</p>
									</div>
								</div>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Law of Sines</h3>
							<div className={styles.stack3}>
								<p className={styles.centerMonoLg}>
									a/sin(A) = b/sin(B) = c/sin(C)
								</p>
								<p className={styles.textSmMuted}>
									Used for solving triangles when you know: two angles and one
									side, or two sides and a non-included angle
								</p>
								<div className={styles.panelMt3}>
									<p className={styles.textSm}>
										<strong>Example:</strong> If a = 10, A = 30°, B = 45°, find
										b<br />b = a × sin(B) / sin(A) = 10 × sin(45°) / sin(30°) =
										14.14
									</p>
								</div>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Law of Cosines</h3>
							<div className={styles.stack3}>
								<div className={styles.monoListNoSize}>
									<p>c² = a² + b² - 2ab·cos(C)</p>
									<p>cos(C) = (a² + b² - c²) / (2ab)</p>
								</div>
								<p className={styles.textSmMuted}>
									Used for solving triangles when you know: three sides, or two
									sides and the included angle
								</p>
								<div className={styles.panelMt3}>
									<p className={styles.textSm}>
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
					<div className={styles.root}>
						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>
								Right Triangle Relationships
							</h3>
							<div className={styles.twoColGrid}>
								<div className={styles.stack2}>
									<p className={styles.titleSmMuted}>Basic Definitions</p>
									<div className={styles.monoList}>
										<p>sin(θ) = opposite / hypotenuse</p>
										<p>cos(θ) = adjacent / hypotenuse</p>
										<p>tan(θ) = opposite / adjacent</p>
									</div>
								</div>
								<div className={styles.stack2}>
									<p className={styles.titleSmMuted}>Reciprocal Functions</p>
									<div className={styles.monoList}>
										<p>csc(θ) = 1 / sin(θ)</p>
										<p>sec(θ) = 1 / cos(θ)</p>
										<p>cot(θ) = 1 / tan(θ)</p>
									</div>
								</div>
							</div>
							<div className={styles.panelMt4}>
								<p className={styles.monoSm}>
									Pythagorean Theorem: a² + b² = c²
								</p>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Unit Circle Values</h3>
							<div className={styles.overflowX}>
								<table className={styles.table}>
									<thead>
										<tr className={styles.borderBottom}>
											<th className={styles.tableHeadCell}>Angle</th>
											<th className={styles.tableHeadCell}>Radians</th>
											<th className={styles.tableHeadCell}>sin(θ)</th>
											<th className={styles.tableHeadCell}>cos(θ)</th>
											<th className={styles.tableHeadCell}>tan(θ)</th>
										</tr>
									</thead>
									<tbody className={styles.monoText}>
										<tr className={styles.borderBottom}>
											<td className={styles.tableCell}>0°</td>
											<td className={styles.tableCell}>0</td>
											<td className={styles.tableCell}>0</td>
											<td className={styles.tableCell}>1</td>
											<td className={styles.tableCell}>0</td>
										</tr>
										<tr className={styles.borderBottom}>
											<td className={styles.tableCell}>30°</td>
											<td className={styles.tableCell}>π/6</td>
											<td className={styles.tableCell}>1/2</td>
											<td className={styles.tableCell}>√3/2</td>
											<td className={styles.tableCell}>√3/3</td>
										</tr>
										<tr className={styles.borderBottom}>
											<td className={styles.tableCell}>45°</td>
											<td className={styles.tableCell}>π/4</td>
											<td className={styles.tableCell}>√2/2</td>
											<td className={styles.tableCell}>√2/2</td>
											<td className={styles.tableCell}>1</td>
										</tr>
										<tr className={styles.borderBottom}>
											<td className={styles.tableCell}>60°</td>
											<td className={styles.tableCell}>π/3</td>
											<td className={styles.tableCell}>√3/2</td>
											<td className={styles.tableCell}>1/2</td>
											<td className={styles.tableCell}>√3</td>
										</tr>
										<tr>
											<td className={styles.tableCell}>90°</td>
											<td className={styles.tableCell}>π/2</td>
											<td className={styles.tableCell}>1</td>
											<td className={styles.tableCell}>0</td>
											<td className={styles.tableCell}>undefined</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Trigonometric Identities</h3>
							<div className={styles.twoColGrid}>
								<div>
									<p className={styles.titleSmMuted}>Pythagorean Identities</p>
									<div className={styles.monoList}>
										<p>sin²(θ) + cos²(θ) = 1</p>
										<p>1 + tan²(θ) = sec²(θ)</p>
										<p>1 + cot²(θ) = csc²(θ)</p>
									</div>
								</div>
								<div>
									<p className={styles.titleSmMuted}>Angle Sum/Difference</p>
									<div className={styles.monoList}>
										<p>sin(α ± β) = sin(α)cos(β) ± cos(α)sin(β)</p>
										<p>cos(α ± β) = cos(α)cos(β) ∓ sin(α)sin(β)</p>
									</div>
								</div>
								<div>
									<p className={styles.titleSmMuted}>Double Angle</p>
									<div className={styles.monoList}>
										<p>sin(2θ) = 2sin(θ)cos(θ)</p>
										<p>cos(2θ) = cos²(θ) - sin²(θ)</p>
										<p>tan(2θ) = 2tan(θ) / (1 - tan²(θ))</p>
									</div>
								</div>
								<div>
									<p className={styles.titleSmMuted}>Half Angle</p>
									<div className={styles.monoList}>
										<p>sin(θ/2) = ±√[(1 - cos(θ))/2]</p>
										<p>cos(θ/2) = ±√[(1 + cos(θ))/2]</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{activeTab === "complex" && (
					<div className={styles.root}>
						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Complex Number Forms</h3>
							<div className={styles.stack4}>
								<div>
									<p className={styles.titleSmMuted}>Rectangular Form</p>
									<p className={styles.monoLg}>z = x + jy = a + jb</p>
									<p className={styles.textSmMuted}>
										x = real part, y = imaginary part
									</p>
								</div>
								<div>
									<p className={styles.titleSmMuted}>Polar Form</p>
									<p className={styles.monoLg}>z = r∠θ = |z|∠arg(z)</p>
									<p className={styles.textSmMuted}>
										r = magnitude, θ = angle (argument)
									</p>
								</div>
								<div>
									<p className={styles.titleSmMuted}>Exponential Form</p>
									<p className={styles.monoLg}>z = r·e^(jθ)</p>
									<p className={styles.textSmMuted}>Using Euler's formula</p>
								</div>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Arithmetic Operations</h3>
							<div className={styles.twoColGrid}>
								<div>
									<p className={styles.titleSmMuted}>Addition & Subtraction</p>
									<div className={styles.monoListSpaced}>
										<p>(a + jb) + (c + jd) = (a + c) + j(b + d)</p>
										<p>(a + jb) - (c + jd) = (a - c) + j(b - d)</p>
									</div>
									<p className={styles.mt2TextXsMuted}>
										Add/subtract real and imaginary parts separately
									</p>
								</div>
								<div>
									<p className={styles.titleSmMuted}>
										Multiplication (Rectangular)
									</p>
									<div className={styles.monoListSpaced}>
										<p>(a + jb)(c + jd) =</p>
										<p>(ac - bd) + j(ad + bc)</p>
									</div>
									<p className={styles.mt2TextXsMuted}>Remember: j² = -1</p>
								</div>
								<div>
									<p className={styles.titleSmMuted}>Multiplication (Polar)</p>
									<div className={styles.monoListSpaced}>
										<p>r₁∠θ₁ × r₂∠θ₂ = (r₁r₂)∠(θ₁ + θ₂)</p>
									</div>
									<p className={styles.mt2TextXsMuted}>
										Multiply magnitudes, add angles
									</p>
								</div>
								<div>
									<p className={styles.titleSmMuted}>Division (Polar)</p>
									<div className={styles.monoListSpaced}>
										<p>r₁∠θ₁ / r₂∠θ₂ = (r₁/r₂)∠(θ₁ - θ₂)</p>
									</div>
									<p className={styles.mt2TextXsMuted}>
										Divide magnitudes, subtract angles
									</p>
								</div>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Complex Conjugate</h3>
							<div className={styles.stack3}>
								<div className={styles.monoListNoSize}>
									<p>If z = x + jy, then z* = x - jy</p>
									<p>If z = r∠θ, then z* = r∠(-θ)</p>
								</div>
								<div className={styles.panel}>
									<p className={styles.textSm}>
										<strong>Properties:</strong>
										<br />• z × z* = |z|² = x² + y²
										<br />• (z₁ + z₂)* = z₁* + z₂*
										<br />• (z₁ × z₂)* = z₁* × z₂*
									</p>
								</div>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Euler's Identity</h3>
							<div className={styles.stack3}>
								<p className={styles.centerMonoXl}>
									e^(jθ) = cos(θ) + j·sin(θ)
								</p>
								<p className={styles.centerTextSmMuted}>Euler's Formula</p>
								<div className={styles.mt4Stack2}>
									<p className={styles.fontSemiboldMuted}>Special Cases:</p>
									<div className={styles.monoList}>
										<p>e^(jπ) + 1 = 0 (Euler's Identity)</p>
										<p>e^(j·π/2) = j</p>
										<p>e^(j·2π) = 1</p>
									</div>
								</div>
								<div className={styles.panelMt4}>
									<p className={styles.textSm}>
										<strong>Usage in EE:</strong> Converts between time domain
										and phasor domain for AC circuit analysis
									</p>
								</div>
							</div>
						</div>

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Roots of Complex Numbers</h3>
							<div className={styles.stack3}>
								<p className={styles.fontSemiboldMuted}>
									De Moivre's Theorem for nth roots:
								</p>
								<div className={styles.monoListSpaced}>
									<p>If z = r∠θ, then the n roots are:</p>
									<p>z_k = r^(1/n) ∠ [(θ + 2πk) / n]</p>
									<p>where k = 0, 1, 2, ..., n-1</p>
								</div>
								<div className={styles.panelMt4}>
									<p className={styles.textSm}>
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

						<div className={styles.card}>
							<h3 className={styles.sectionTitle}>Polar Coordinate System</h3>
							<div className={styles.stack3}>
								<p className={styles.fontSemiboldMuted}>Conversion Formulas:</p>
								<div className={styles.twoColGrid}>
									<div>
										<p className={styles.mb1TextSmMuted}>
											Rectangular to Polar:
										</p>
										<div className={styles.monoList}>
											<p>r = √(x² + y²)</p>
											<p>θ = tan⁻¹(y/x)</p>
										</div>
									</div>
									<div>
										<p className={styles.mb1TextSmMuted}>
											Polar to Rectangular:
										</p>
										<div className={styles.monoList}>
											<p>x = r·cos(θ)</p>
											<p>y = r·sin(θ)</p>
										</div>
									</div>
								</div>
								<div className={styles.mt3TextXsMuted}>
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
			</Section>
		</div>
	);
}

import { Compass, Divide, Minus, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Section } from "@/components/apps/ui/PageFrame";
import { cn } from "@/lib/utils";
import styles from "./VectorCalculator.module.css";

export function VectorCalculator() {
	const fieldPrefix = useId().replace(/:/g, "");
	const [rectangular, setRectangular] = useState({ x: 3, y: 4 });
	const [polar, setPolar] = useState({ r: 5, theta: 53.13 });
	const [showWork, setShowWork] = useState(true);

	const [vector1, setVector1] = useState({ x: 3, y: 4 });
	const [vector2, setVector2] = useState({ x: 2, y: -1 });
	const [operation, setOperation] = useState<
		"add" | "subtract" | "multiply" | "divide"
	>("add");

	const rectangularToPolar = (x: number, y: number) => {
		const r = Math.sqrt(x * x + y * y);
		const thetaRad = Math.atan2(y, x);
		const thetaDeg = (thetaRad * 180) / Math.PI;
		return {
			r: parseFloat(r.toFixed(4)),
			theta: parseFloat(thetaDeg.toFixed(2)),
		};
	};

	const polarToRectangular = (r: number, thetaDeg: number) => {
		const thetaRad = (thetaDeg * Math.PI) / 180;
		const x = r * Math.cos(thetaRad);
		const y = r * Math.sin(thetaRad);
		return { x: parseFloat(x.toFixed(4)), y: parseFloat(y.toFixed(4)) };
	};

	const handleRectangularChange = (field: "x" | "y", value: string) => {
		const numValue = parseFloat(value) || 0;
		const newRect = { ...rectangular, [field]: numValue };
		setRectangular(newRect);
		const newPolar = rectangularToPolar(newRect.x, newRect.y);
		setPolar(newPolar);
	};

	const handlePolarChange = (field: "r" | "theta", value: string) => {
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
			case "add":
				return { x: x1 + x2, y: y1 + y2 };
			case "subtract":
				return { x: x1 - x2, y: y1 - y2 };
			case "multiply":
				return { x: x1 * x2 - y1 * y2, y: x1 * y2 + y1 * x2 };
			case "divide": {
				const denom = x2 * x2 + y2 * y2;
				if (denom === 0) return { x: 0, y: 0 };
				return {
					x: (x1 * x2 + y1 * y2) / denom,
					y: (y1 * x2 - x1 * y2) / denom,
				};
			}
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
			case "add":
				return [
					`Given: Z₁ = ${x1} + j${y1}, Z₂ = ${x2} + j${y2}`,
					`Addition formula: Z = (x₁ + x₂) + j(y₁ + y₂)`,
					`Real part: ${x1} + ${x2} = ${x1 + x2}`,
					`Imaginary part: ${y1} + ${y2} = ${y1 + y2}`,
					`Result: Z = ${result.x.toFixed(4)} + j${result.y.toFixed(4)}`,
				];
			case "subtract":
				return [
					`Given: Z₁ = ${x1} + j${y1}, Z₂ = ${x2} + j${y2}`,
					`Subtraction formula: Z = (x₁ - x₂) + j(y₁ - y₂)`,
					`Real part: ${x1} - ${x2} = ${x1 - x2}`,
					`Imaginary part: ${y1} - ${y2} = ${y1 - y2}`,
					`Result: Z = ${result.x.toFixed(4)} + j${result.y.toFixed(4)}`,
				];
			case "multiply":
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
			case "divide": {
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
		<div className={styles.root}>
			<div className={styles.header}>
				<Compass className={styles.headerIcon} />
				<h2 className={styles.title}>Vector Representation & Operations</h2>
			</div>

			<Section title="Vector Converter">
				<div className={styles.twoColumnLayout}>
					<div className={styles.stack}>
						<h4 className={styles.subheading}>Rectangular Form (x + jy)</h4>
						<div className={styles.stackTight}>
							<div>
								<label className={styles.label} htmlFor={`${fieldPrefix}-rect-x`}>
									Real Part (x)
								</label>
								<input
									id={`${fieldPrefix}-rect-x`}
									name="vector_rect_x"
									type="number"
									step="0.01"
									value={x}
									onChange={(e) => handleRectangularChange("x", e.target.value)}
									className={styles.inputControl}
								/>
							</div>
							<div>
								<label className={styles.label} htmlFor={`${fieldPrefix}-rect-y`}>
									Imaginary Part (y)
								</label>
								<input
									id={`${fieldPrefix}-rect-y`}
									name="vector_rect_y"
									type="number"
									step="0.01"
									value={y}
									onChange={(e) => handleRectangularChange("y", e.target.value)}
									className={styles.inputControl}
								/>
							</div>
							<div className={styles.valueCardPrimary}>
								<p className={styles.valueTextLarge}>
									Z = {x} {y >= 0 ? "+" : ""} j{y}
								</p>
							</div>
						</div>
					</div>

					<div className={styles.stack}>
						<h4 className={styles.subheading}>Polar Form (r∠θ)</h4>
						<div className={styles.stackTight}>
							<div>
								<label className={styles.label} htmlFor={`${fieldPrefix}-polar-r`}>
									Magnitude (r)
								</label>
								<input
									id={`${fieldPrefix}-polar-r`}
									name="vector_polar_r"
									type="number"
									step="0.01"
									value={r}
									onChange={(e) => handlePolarChange("r", e.target.value)}
									className={styles.inputControl}
								/>
							</div>
							<div>
								<label
									className={styles.label}
									htmlFor={`${fieldPrefix}-polar-theta`}
								>
									Angle θ (degrees)
								</label>
								<input
									id={`${fieldPrefix}-polar-theta`}
									name="vector_polar_theta"
									type="number"
									step="0.01"
									value={theta}
									onChange={(e) => handlePolarChange("theta", e.target.value)}
									className={styles.inputControl}
								/>
							</div>
							<div className={styles.valueCardPrimary}>
								<p className={styles.valueTextLarge}>
									Z = {r}∠{theta}°
								</p>
							</div>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<h4 className={styles.subheading}>All Representations</h4>

					<div className={styles.representationGrid}>
						<div className={styles.inlinePanel}>
							<p className={styles.primaryLabel}>Rectangular</p>
							<p className={styles.valueText}>
								Z = {x} {y >= 0 ? "+" : ""} j{y}
							</p>
						</div>

						<div className={styles.inlinePanel}>
							<p className={styles.primaryLabel}>Polar</p>
							<p className={styles.valueText}>
								Z = {r}∠{theta}°
							</p>
						</div>

						<div className={styles.inlinePanel}>
							<p className={styles.primaryLabel}>Trigonometric</p>
							<p className={styles.valueTextSm}>
								Z = {r}(cos({theta}°) + j·sin({theta}°))
							</p>
						</div>

						<div className={styles.inlinePanel}>
							<p className={styles.primaryLabel}>Exponential</p>
							<p className={styles.valueTextSm}>
								Z = {r} · e^(j·{thetaRad} rad)
							</p>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<button
						onClick={() => setShowWork(!showWork)}
						className={styles.toggleButton}
					>
						{showWork ? "Hide" : "Show"} Step-by-Step Work
					</button>

					{showWork && (
						<div className={styles.workPanel}>
							<h4 className={styles.panelTitle}>Step-by-Step Conversion</h4>
							<div className={styles.monoList}>
								{getConversionSteps().map((step, i) => (
									<p key={i} className={step === "" ? styles.spacer : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</Section>

			<Section title="Vector Operations">
				<div className={styles.operationLayout}>
					<div className={styles.stack}>
						<h4 className={styles.subheading}>Vector 1 (Z₁)</h4>
						<div>
							<label className={styles.label} htmlFor={`${fieldPrefix}-v1-x`}>
								Real (x₁)
							</label>
							<input
								id={`${fieldPrefix}-v1-x`}
								name="vector1_x"
								type="number"
								step="0.01"
								value={vector1.x}
								onChange={(e) =>
									setVector1({ ...vector1, x: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div>
							<label className={styles.label} htmlFor={`${fieldPrefix}-v1-y`}>
								Imaginary (y₁)
							</label>
							<input
								id={`${fieldPrefix}-v1-y`}
								name="vector1_y"
								type="number"
								step="0.01"
								value={vector1.y}
								onChange={(e) =>
									setVector1({ ...vector1, y: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div className={styles.valueCardPrimaryCompact}>
							<p className={styles.valueTextSm}>
								Z₁ = {vector1.x} {vector1.y >= 0 ? "+" : ""} j{vector1.y}
							</p>
						</div>
					</div>

					<div className={styles.stack}>
						<h4 className={styles.subheading}>Operation</h4>
						<div className={styles.operationGrid}>
							<button
								onClick={() => setOperation("add")}
								className={cn(
									styles.operationButton,
									operation === "add"
										? styles.operationButtonActive
										: styles.operationButtonInactive,
								)}
							>
								<Plus className={styles.operationIcon} />
								<span>Add</span>
							</button>
							<button
								onClick={() => setOperation("subtract")}
								className={cn(
									styles.operationButton,
									operation === "subtract"
										? styles.operationButtonActive
										: styles.operationButtonInactive,
								)}
							>
								<Minus className={styles.operationIcon} />
								<span>Subtract</span>
							</button>
							<button
								onClick={() => setOperation("multiply")}
								className={cn(
									styles.operationButton,
									operation === "multiply"
										? styles.operationButtonActive
										: styles.operationButtonInactive,
								)}
							>
								<X className={styles.operationIcon} />
								<span>Multiply</span>
							</button>
							<button
								onClick={() => setOperation("divide")}
								className={cn(
									styles.operationButton,
									operation === "divide"
										? styles.operationButtonActive
										: styles.operationButtonInactive,
								)}
							>
								<Divide className={styles.operationIcon} />
								<span>Divide</span>
							</button>
						</div>
					</div>

					<div className={styles.stack}>
						<h4 className={styles.subheading}>Vector 2 (Z₂)</h4>
						<div>
							<label className={styles.label} htmlFor={`${fieldPrefix}-v2-x`}>
								Real (x₂)
							</label>
							<input
								id={`${fieldPrefix}-v2-x`}
								name="vector2_x"
								type="number"
								step="0.01"
								value={vector2.x}
								onChange={(e) =>
									setVector2({ ...vector2, x: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div>
							<label className={styles.label} htmlFor={`${fieldPrefix}-v2-y`}>
								Imaginary (y₂)
							</label>
							<input
								id={`${fieldPrefix}-v2-y`}
								name="vector2_y"
								type="number"
								step="0.01"
								value={vector2.y}
								onChange={(e) =>
									setVector2({ ...vector2, y: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div className={styles.valueCardPrimaryCompact}>
							<p className={styles.valueTextSm}>
								Z₂ = {vector2.x} {vector2.y >= 0 ? "+" : ""} j{vector2.y}
							</p>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<h4 className={styles.subheading}>Result</h4>

					<div className={styles.representationGrid}>
						<div className={styles.accentPanel}>
							<p className={styles.accentLabel}>Rectangular Form</p>
							<p className={styles.valueTextLarge}>
								Z = {result.x.toFixed(4)} {result.y >= 0 ? "+" : ""} j
								{result.y.toFixed(4)}
							</p>
						</div>

						<div className={styles.accentPanel}>
							<p className={styles.accentLabel}>Polar Form</p>
							<p className={styles.valueTextLarge}>
								Z = {resultPolar.r.toFixed(4)}∠{resultPolar.theta.toFixed(2)}°
							</p>
						</div>
					</div>

					<div className={styles.workPanel}>
						<h4 className={styles.panelTitle}>Step-by-Step Solution</h4>
						<div className={styles.monoList}>
							{getSteps().map((step, i) => (
								<p key={i} className={step === "" ? styles.spacer : ""}>
									{step}
								</p>
							))}
						</div>
					</div>
				</div>
			</Section>

			<Section
				title="Formulas"
				description="Key formulas for vector operations in rectangular and polar forms."
			>
				<div className={styles.representationGrid}>
					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>Addition & Subtraction</h4>
						<div className={styles.monoListSpaced}>
							<p>Z₁ ± Z₂ = (x₁ ± x₂) + j(y₁ ± y₂)</p>
						</div>
					</div>

					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>Multiplication</h4>
						<div className={styles.monoListSpaced}>
							<p>Z₁ × Z₂ = (x₁x₂ - y₁y₂) + j(x₁y₂ + y₁x₂)</p>
							<p className={styles.mutedText}>Polar: r₁r₂∠(θ₁ + θ₂)</p>
						</div>
					</div>

					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>Division</h4>
						<div className={styles.monoListXs}>
							<p>Z₁ / Z₂ = [(x₁x₂ + y₁y₂) + j(y₁x₂ - x₁y₂)] / (x₂² + y₂²)</p>
							<p className={styles.mutedText}>Polar: (r₁/r₂)∠(θ₁ - θ₂)</p>
						</div>
					</div>

					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>Conversion</h4>
						<div className={styles.monoListSpaced}>
							<p>r = √(x² + y²)</p>
							<p>θ = tan⁻¹(y/x)</p>
						</div>
					</div>
				</div>
			</Section>

			<Section title="Example: Vector Multiplication">
				<div className={styles.exampleBlock}>
					<p>Given: Z₁ = 3 + j4, Z₂ = 2 - j1</p>
					<p className={styles.exampleIndented}>
						• Method 1 (Rectangular): (3)(2) - (4)(-1) + j[(3)(-1) + (4)(2)] =
						10 + j5
					</p>
					<p className={styles.exampleIndented}>
						• Method 2 (Polar): Z₁ = 5∠53.13°, Z₂ = 2.236∠-26.57°
					</p>
					<p className={styles.exampleIndented}>
						• Multiply magnitudes: 5 × 2.236 = 11.18
					</p>
					<p className={styles.exampleIndented}>
						• Add angles: 53.13° + (-26.57°) = 26.56°
					</p>
					<p className={styles.exampleIndented}>
						• Result: Z = 11.18∠26.56° = 10 + j5
					</p>
				</div>
			</Section>
		</div>
	);
}

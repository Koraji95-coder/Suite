import { Compass, Divide, Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { FrameSection } from "../../apps/ui/PageFrame";

export function VectorCalculator() {
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

	const cardClass =
		"rounded-lg border p-4 [border-color:var(--border)] [background:var(--surface)]";
	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";
	const labelClass = "mb-1 block text-sm [color:var(--text-muted)]";

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
		<div className="space-y-6">
			<div className="flex items-center space-x-3 mb-6">
				<Compass className="h-8 w-8 [color:var(--primary)]" />
				<h2 className="text-3xl font-bold [color:var(--text)]">
					Vector Representation & Operations
				</h2>
			</div>

			<FrameSection title="Vector Converter">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<h4 className="text-lg font-semibold [color:var(--text-muted)]">
							Rectangular Form (x + jy)
						</h4>
						<div className="space-y-3">
							<div>
								<label className={labelClass}>Real Part (x)</label>
								<input
									type="number"
									step="0.01"
									value={x}
									onChange={(e) => handleRectangularChange("x", e.target.value)}
									className={inputClass}
								/>
							</div>
							<div>
								<label className={labelClass}>Imaginary Part (y)</label>
								<input
									type="number"
									step="0.01"
									value={y}
									onChange={(e) => handleRectangularChange("y", e.target.value)}
									className={inputClass}
								/>
							</div>
							<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)]">
								<p className="font-mono text-lg [color:var(--text)]">
									Z = {x} {y >= 0 ? "+" : ""} j{y}
								</p>
							</div>
						</div>
					</div>

					<div className="space-y-4">
						<h4 className="text-lg font-semibold [color:var(--text-muted)]">
							Polar Form (r∠θ)
						</h4>
						<div className="space-y-3">
							<div>
								<label className={labelClass}>Magnitude (r)</label>
								<input
									type="number"
									step="0.01"
									value={r}
									onChange={(e) => handlePolarChange("r", e.target.value)}
									className={inputClass}
								/>
							</div>
							<div>
								<label className={labelClass}>Angle θ (degrees)</label>
								<input
									type="number"
									step="0.01"
									value={theta}
									onChange={(e) => handlePolarChange("theta", e.target.value)}
									className={inputClass}
								/>
							</div>
							<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)]">
								<p className="font-mono text-lg [color:var(--text)]">
									Z = {r}∠{theta}°
								</p>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-6 space-y-4">
					<h4 className="text-lg font-semibold [color:var(--text-muted)]">
						All Representations
					</h4>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Rectangular
							</p>
							<p className="font-mono [color:var(--text)]">
								Z = {x} {y >= 0 ? "+" : ""} j{y}
							</p>
						</div>

						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Polar
							</p>
							<p className="font-mono [color:var(--text)]">
								Z = {r}∠{theta}°
							</p>
						</div>

						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Trigonometric
							</p>
							<p className="font-mono text-sm [color:var(--text)]">
								Z = {r}(cos({theta}°) + j·sin({theta}°))
							</p>
						</div>

						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Exponential
							</p>
							<p className="font-mono text-sm [color:var(--text)]">
								Z = {r} · e^(j·{thetaRad} rad)
							</p>
						</div>
					</div>
				</div>

				<div className="mt-6">
					<button
						onClick={() => setShowWork(!showWork)}
						className="rounded-lg border px-4 py-2 text-sm font-medium transition [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)] hover:[background:color-mix(in_srgb,var(--primary)_26%,transparent)]"
					>
						{showWork ? "Hide" : "Show"} Step-by-Step Work
					</button>

					{showWork && (
						<div className="mt-4 rounded-lg border p-5 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,var(--surface))]">
							<h4 className="mb-3 font-semibold [color:var(--text-muted)]">
								Step-by-Step Conversion
							</h4>
							<div className="space-y-1 font-mono text-sm [color:var(--text)]">
								{getConversionSteps().map((step, i) => (
									<p key={i} className={step === "" ? "h-2" : ""}>
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
						<h4 className="text-lg font-semibold [color:var(--text-muted)]">
							Vector 1 (Z₁)
						</h4>
						<div>
							<label className={labelClass}>Real (x₁)</label>
							<input
								type="number"
								step="0.01"
								value={vector1.x}
								onChange={(e) =>
									setVector1({ ...vector1, x: parseFloat(e.target.value) || 0 })
								}
								className={inputClass}
							/>
						</div>
						<div>
							<label className={labelClass}>Imaginary (y₁)</label>
							<input
								type="number"
								step="0.01"
								value={vector1.y}
								onChange={(e) =>
									setVector1({ ...vector1, y: parseFloat(e.target.value) || 0 })
								}
								className={inputClass}
							/>
						</div>
						<div className="rounded-lg border p-3 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)]">
							<p className="font-mono text-sm [color:var(--text)]">
								Z₁ = {vector1.x} {vector1.y >= 0 ? "+" : ""} j{vector1.y}
							</p>
						</div>
					</div>

					<div className="space-y-4">
						<h4 className="text-lg font-semibold [color:var(--text-muted)]">
							Operation
						</h4>
						<div className="grid grid-cols-2 gap-2">
							<button
								onClick={() => setOperation("add")}
								className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
									operation === "add"
										? "border-2 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_28%,transparent)] [color:var(--text)]"
										: "border [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,var(--surface))]"
								}`}
							>
								<Plus className="w-4 h-4" />
								<span>Add</span>
							</button>
							<button
								onClick={() => setOperation("subtract")}
								className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
									operation === "subtract"
										? "border-2 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_28%,transparent)] [color:var(--text)]"
										: "border [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,var(--surface))]"
								}`}
							>
								<Minus className="w-4 h-4" />
								<span>Subtract</span>
							</button>
							<button
								onClick={() => setOperation("multiply")}
								className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
									operation === "multiply"
										? "border-2 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_28%,transparent)] [color:var(--text)]"
										: "border [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,var(--surface))]"
								}`}
							>
								<X className="w-4 h-4" />
								<span>Multiply</span>
							</button>
							<button
								onClick={() => setOperation("divide")}
								className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
									operation === "divide"
										? "border-2 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_28%,transparent)] [color:var(--text)]"
										: "border [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,var(--surface))]"
								}`}
							>
								<Divide className="w-4 h-4" />
								<span>Divide</span>
							</button>
						</div>
					</div>

					<div className="space-y-4">
						<h4 className="text-lg font-semibold [color:var(--text-muted)]">
							Vector 2 (Z₂)
						</h4>
						<div>
							<label className={labelClass}>Real (x₂)</label>
							<input
								type="number"
								step="0.01"
								value={vector2.x}
								onChange={(e) =>
									setVector2({ ...vector2, x: parseFloat(e.target.value) || 0 })
								}
								className={inputClass}
							/>
						</div>
						<div>
							<label className={labelClass}>Imaginary (y₂)</label>
							<input
								type="number"
								step="0.01"
								value={vector2.y}
								onChange={(e) =>
									setVector2({ ...vector2, y: parseFloat(e.target.value) || 0 })
								}
								className={inputClass}
							/>
						</div>
						<div className="rounded-lg border p-3 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)]">
							<p className="font-mono text-sm [color:var(--text)]">
								Z₂ = {vector2.x} {vector2.y >= 0 ? "+" : ""} j{vector2.y}
							</p>
						</div>
					</div>
				</div>

				<div className="mt-6 space-y-4">
					<h4 className="text-lg font-semibold [color:var(--text-muted)]">
						Result
					</h4>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="rounded-lg border p-4 [border-color:var(--accent)] [background:color-mix(in_srgb,var(--accent)_14%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--accent)]">
								Rectangular Form
							</p>
							<p className="font-mono text-lg [color:var(--text)]">
								Z = {result.x.toFixed(4)} {result.y >= 0 ? "+" : ""} j
								{result.y.toFixed(4)}
							</p>
						</div>

						<div className="rounded-lg border p-4 [border-color:var(--accent)] [background:color-mix(in_srgb,var(--accent)_14%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--accent)]">
								Polar Form
							</p>
							<p className="font-mono text-lg [color:var(--text)]">
								Z = {resultPolar.r.toFixed(4)}∠{resultPolar.theta.toFixed(2)}°
							</p>
						</div>
					</div>

					<div className="rounded-lg border p-5 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,var(--surface))]">
						<h4 className="mb-3 font-semibold [color:var(--text-muted)]">
							Step-by-Step Solution
						</h4>
						<div className="space-y-1 font-mono text-sm [color:var(--text)]">
							{getSteps().map((step, i) => (
								<p key={i} className={step === "" ? "h-2" : ""}>
									{step}
								</p>
							))}
						</div>
					</div>
				</div>
			</FrameSection>

			<FrameSection title="Formulas">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className={cardClass}>
						<h4 className="mb-2 font-semibold [color:var(--text-muted)]">
							Addition & Subtraction
						</h4>
						<div className="space-y-2 font-mono text-sm [color:var(--text)]">
							<p>Z₁ ± Z₂ = (x₁ ± x₂) + j(y₁ ± y₂)</p>
						</div>
					</div>

					<div className={cardClass}>
						<h4 className="mb-2 font-semibold [color:var(--text-muted)]">
							Multiplication
						</h4>
						<div className="space-y-2 font-mono text-sm [color:var(--text)]">
							<p>Z₁ × Z₂ = (x₁x₂ - y₁y₂) + j(x₁y₂ + y₁x₂)</p>
							<p className="[color:var(--text-muted)]">Polar: r₁r₂∠(θ₁ + θ₂)</p>
						</div>
					</div>

					<div className={cardClass}>
						<h4 className="mb-2 font-semibold [color:var(--text-muted)]">
							Division
						</h4>
						<div className="space-y-2 font-mono text-xs [color:var(--text)]">
							<p>Z₁ / Z₂ = [(x₁x₂ + y₁y₂) + j(y₁x₂ - x₁y₂)] / (x₂² + y₂²)</p>
							<p className="[color:var(--text-muted)]">
								Polar: (r₁/r₂)∠(θ₁ - θ₂)
							</p>
						</div>
					</div>

					<div className={cardClass}>
						<h4 className="mb-2 font-semibold [color:var(--text-muted)]">
							Conversion
						</h4>
						<div className="space-y-2 font-mono text-sm [color:var(--text)]">
							<p>r = √(x² + y²)</p>
							<p>θ = tan⁻¹(y/x)</p>
						</div>
					</div>
				</div>
			</FrameSection>

			<FrameSection title="Example: Vector Multiplication">
				<div className="space-y-2 [color:var(--text)]">
					<p>Given: Z₁ = 3 + j4, Z₂ = 2 - j1</p>
					<p className="pl-4">
						• Method 1 (Rectangular): (3)(2) - (4)(-1) + j[(3)(-1) + (4)(2)] =
						10 + j5
					</p>
					<p className="pl-4">
						• Method 2 (Polar): Z₁ = 5∠53.13°, Z₂ = 2.236∠-26.57°
					</p>
					<p className="pl-4">• Multiply magnitudes: 5 × 2.236 = 11.18</p>
					<p className="pl-4">• Add angles: 53.13° + (-26.57°) = 26.56°</p>
					<p className="pl-4">• Result: Z = 11.18∠26.56° = 10 + j5</p>
				</div>
			</FrameSection>
		</div>
	);
}

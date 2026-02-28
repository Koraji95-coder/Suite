import { Zap } from "lucide-react";
import { useState } from "react";
import { FrameSection } from "../../apps/ui/PageFrame";

export function ThreePhaseCalculator() {
	const [lineVoltage, setLineVoltage] = useState(415);
	const [lineCurrent, setLineCurrent] = useState(100);
	const [powerFactor, setPowerFactor] = useState(0.85);
	const [configuration, setConfiguration] = useState<"wye" | "delta">("wye");
	const [showWork, setShowWork] = useState(false);

	const phaseVoltage =
		configuration === "wye" ? lineVoltage / Math.sqrt(3) : lineVoltage;
	const phaseCurrent =
		configuration === "wye" ? lineCurrent : lineCurrent / Math.sqrt(3);

	const activePower =
		(Math.sqrt(3) * lineVoltage * lineCurrent * powerFactor) / 1000;
	const apparentPower = (Math.sqrt(3) * lineVoltage * lineCurrent) / 1000;
	const reactivePower = Math.sqrt(
		apparentPower * apparentPower - activePower * activePower,
	);
	const angle = Math.acos(powerFactor) * (180 / Math.PI);

	const [faultType, setFaultType] = useState<
		"3phase" | "line-line" | "line-ground"
	>("3phase");
	const [baseVoltage, setBaseVoltage] = useState(11);
	const [sourceImpedance, setSourceImpedance] = useState(0.1);

	const faultCurrent = (() => {
		const phaseV = (baseVoltage * 1000) / Math.sqrt(3);
		switch (faultType) {
			case "3phase":
				return phaseV / sourceImpedance;
			case "line-line":
				return (Math.sqrt(3) / 2) * (phaseV / sourceImpedance);
			case "line-ground":
				return phaseV / sourceImpedance;
			default:
				return 0;
		}
	})();

	const getPowerSteps = () => {
		const sqrt3 = Math.sqrt(3).toFixed(4);
		return [
			`Given: V_L = ${lineVoltage} V, I_L = ${lineCurrent} A, PF = ${powerFactor}, Configuration = ${configuration.toUpperCase()}`,
			``,
			`Step 1: Calculate phase values`,
			configuration === "wye"
				? `V_φ = V_L / √3 = ${lineVoltage} / ${sqrt3} = ${phaseVoltage.toFixed(2)} V`
				: `V_φ = V_L = ${lineVoltage} V`,
			configuration === "wye"
				? `I_φ = I_L = ${lineCurrent} A`
				: `I_φ = I_L / √3 = ${lineCurrent} / ${sqrt3} = ${phaseCurrent.toFixed(2)} A`,
			``,
			`Step 2: Calculate power angle`,
			`φ = cos⁻¹(PF) = cos⁻¹(${powerFactor}) = ${angle.toFixed(2)}°`,
			``,
			`Step 3: Calculate apparent power (S)`,
			`S = √3 × V_L × I_L`,
			`S = ${sqrt3} × ${lineVoltage} × ${lineCurrent}`,
			`S = ${apparentPower.toFixed(2)} kVA`,
			``,
			`Step 4: Calculate active power (P)`,
			`P = √3 × V_L × I_L × cos(φ)`,
			`P = ${sqrt3} × ${lineVoltage} × ${lineCurrent} × ${powerFactor}`,
			`P = ${activePower.toFixed(2)} kW`,
			``,
			`Step 5: Calculate reactive power (Q)`,
			`Q = √(S² - P²)`,
			`Q = √(${apparentPower.toFixed(2)}² - ${activePower.toFixed(2)}²)`,
			`Q = √${(apparentPower * apparentPower - activePower * activePower).toFixed(2)}`,
			`Q = ${reactivePower.toFixed(2)} kVAR`,
			``,
			`Alternative: Q = √3 × V_L × I_L × sin(φ)`,
			`Q = ${sqrt3} × ${lineVoltage} × ${lineCurrent} × sin(${angle.toFixed(2)}°)`,
			`Q = ${sqrt3} × ${lineVoltage} × ${lineCurrent} × ${Math.sin((angle * Math.PI) / 180).toFixed(4)}`,
			`Q = ${reactivePower.toFixed(2)} kVAR`,
		];
	};

	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";
	const labelClass = "mb-1 block text-sm [color:var(--text-muted)]";
	const cardClass =
		"rounded-lg border p-4 [border-color:var(--border)] [background:var(--surface)]";

	return (
		<div className="space-y-6">
			<div className="flex items-center space-x-3 mb-6">
				<Zap className="h-8 w-8 [color:var(--primary)]" />
				<h2 className="text-3xl font-bold [color:var(--text)]">
					Three-Phase Systems
				</h2>
			</div>

			<FrameSection title="Voltage Relationships in 3-Phase System">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<div>
							<label className={labelClass}>Configuration</label>
							<select
								value={configuration}
								onChange={(e) =>
									setConfiguration(e.target.value as "wye" | "delta")
								}
								className={inputClass}
							>
								<option value="wye">Wye (Y)</option>
								<option value="delta">Delta (Δ)</option>
							</select>
						</div>

						<div>
							<label className={labelClass}>
								Line Voltage (V<sub>L</sub>)
							</label>
							<input
								type="number"
								value={lineVoltage}
								onChange={(e) =>
									setLineVoltage(parseFloat(e.target.value) || 0)
								}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>
								Line Current (I<sub>L</sub>)
							</label>
							<input
								type="number"
								value={lineCurrent}
								onChange={(e) =>
									setLineCurrent(parseFloat(e.target.value) || 0)
								}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>Power Factor (cos φ)</label>
							<input
								type="number"
								step="0.01"
								min="0"
								max="1"
								value={powerFactor}
								onChange={(e) =>
									setPowerFactor(parseFloat(e.target.value) || 0)
								}
								className={inputClass}
							/>
						</div>
					</div>

					<div className="space-y-4">
						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Phase Voltage (V<sub>φ</sub>)
							</p>
							<p className="font-mono text-xl [color:var(--text)]">
								{phaseVoltage.toFixed(2)} V
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">
								{configuration === "wye" ? "V_φ = V_L / √3" : "V_φ = V_L"}
							</p>
						</div>

						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Phase Current (I<sub>φ</sub>)
							</p>
							<p className="font-mono text-xl [color:var(--text)]">
								{phaseCurrent.toFixed(2)} A
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">
								{configuration === "wye" ? "I_φ = I_L" : "I_φ = I_L / √3"}
							</p>
						</div>

						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Phase Angle (φ)
							</p>
							<p className="font-mono text-xl [color:var(--text)]">
								{angle.toFixed(2)}°
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">
								φ = cos⁻¹(PF)
							</p>
						</div>
					</div>
				</div>

				<div className="mt-6">
					<h4 className="mb-3 text-lg font-semibold [color:var(--text-muted)]">
						Phase Voltage Relationships
					</h4>
					<div className="space-y-2 rounded-lg border p-4 font-mono [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]">
						<p>
							V<sub>an</sub> = V<sub>φ</sub>∠0°
						</p>
						<p>
							V<sub>bn</sub> = V<sub>φ</sub>∠-120°
						</p>
						<p>
							V<sub>cn</sub> = V<sub>φ</sub>∠-240° (or +120°)
						</p>
						<p className="mt-2 text-sm [color:var(--text-muted)]">
							Balanced system: V<sub>an</sub> + V<sub>bn</sub> + V<sub>cn</sub>{" "}
							= 0
						</p>
					</div>
				</div>
			</FrameSection>

			<FrameSection title="Power Calculations">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div className="rounded-lg border p-4 [border-color:var(--accent)] [background:color-mix(in_srgb,var(--accent)_14%,transparent)]">
						<p className="mb-1 text-sm font-semibold [color:var(--accent)]">
							Active Power (P)
						</p>
						<p className="font-mono text-2xl [color:var(--text)]">
							{activePower.toFixed(2)} kW
						</p>
						<p className="mt-2 text-xs [color:var(--text-muted)]">
							P = √3 × V<sub>L</sub> × I<sub>L</sub> × cos(φ)
						</p>
					</div>

					<div className="rounded-lg border p-4 [border-color:var(--warning)] [background:color-mix(in_srgb,var(--warning)_14%,transparent)]">
						<p className="mb-1 text-sm font-semibold [color:var(--warning)]">
							Reactive Power (Q)
						</p>
						<p className="font-mono text-2xl [color:var(--text)]">
							{reactivePower.toFixed(2)} kVAR
						</p>
						<p className="mt-2 text-xs [color:var(--text-muted)]">
							Q = √3 × V<sub>L</sub> × I<sub>L</sub> × sin(φ)
						</p>
					</div>

					<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_14%,transparent)]">
						<p className="mb-1 text-sm font-semibold [color:var(--primary)]">
							Apparent Power (S)
						</p>
						<p className="font-mono text-2xl [color:var(--text)]">
							{apparentPower.toFixed(2)} kVA
						</p>
						<p className="mt-2 text-xs [color:var(--text-muted)]">
							S = √3 × V<sub>L</sub> × I<sub>L</sub>
						</p>
					</div>
				</div>

				<div className="mt-4 rounded-lg border p-4 [border-color:var(--border)] [background:var(--surface)]">
					<h4 className="mb-2 font-semibold [color:var(--text-muted)]">
						Power Triangle Relationships
					</h4>
					<div className="space-y-1 font-mono text-sm [color:var(--text)]">
						<p>S² = P² + Q²</p>
						<p>Power Factor (PF) = P / S = cos(φ)</p>
						<p>Q = P × tan(φ)</p>
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
								Step-by-Step Power Calculation
							</h4>
							<div className="space-y-1 font-mono text-sm [color:var(--text)]">
								{getPowerSteps().map((step, i) => (
									<p key={i} className={step === "" ? "h-2" : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</FrameSection>

			<FrameSection title="Fault Analysis">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<div>
							<label className={labelClass}>Base Voltage (kV)</label>
							<input
								type="number"
								value={baseVoltage}
								onChange={(e) =>
									setBaseVoltage(parseFloat(e.target.value) || 0)
								}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>Source Impedance (Ω)</label>
							<input
								type="number"
								step="0.01"
								value={sourceImpedance}
								onChange={(e) =>
									setSourceImpedance(parseFloat(e.target.value) || 0)
								}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>Fault Type</label>
							<select
								value={faultType}
								onChange={(e) =>
									setFaultType(
										e.target.value as "3phase" | "line-line" | "line-ground",
									)
								}
								className={inputClass}
							>
								<option value="3phase">Three-Phase (3φ)</option>
								<option value="line-line">Line-to-Line (L-L)</option>
								<option value="line-ground">Line-to-Ground (L-G)</option>
							</select>
						</div>
					</div>

					<div className="space-y-4">
						<div className="rounded-lg border p-4 [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_14%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--danger)]">
								Fault Current (I<sub>f</sub>)
							</p>
							<p className="font-mono text-2xl [color:var(--text)]">
								{(faultCurrent / 1000).toFixed(2)} kA
							</p>
						</div>

						<div className={cardClass}>
							<h4 className="mb-2 font-semibold [color:var(--text-muted)]">
								Fault Formulas
							</h4>
							<div className="space-y-1 font-mono text-sm [color:var(--text)]">
								<p>
									3φ Fault: I<sub>f</sub> = V<sub>φ</sub> / Z<sub>s</sub>
								</p>
								<p>
									L-L Fault: I<sub>f</sub> = (√3/2) × V<sub>φ</sub> / Z
									<sub>s</sub>
								</p>
								<p>
									L-G Fault: I<sub>f</sub> = V<sub>φ</sub> / (Z<sub>s</sub> + Z
									<sub>n</sub> + Z<sub>g</sub>)
								</p>
							</div>
						</div>
					</div>
				</div>
			</FrameSection>

			<FrameSection title="Δ-Y Transformation">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className={cardClass}>
						<h4 className="mb-3 font-semibold [color:var(--text-muted)]">
							Delta to Wye
						</h4>
						<div className="space-y-2 font-mono text-sm [color:var(--text)]">
							<p>
								R<sub>1</sub> = (R<sub>a</sub> × R<sub>c</sub>) / (R<sub>a</sub>{" "}
								+ R<sub>b</sub> + R<sub>c</sub>)
							</p>
							<p>
								R<sub>2</sub> = (R<sub>a</sub> × R<sub>b</sub>) / (R<sub>a</sub>{" "}
								+ R<sub>b</sub> + R<sub>c</sub>)
							</p>
							<p>
								R<sub>3</sub> = (R<sub>b</sub> × R<sub>c</sub>) / (R<sub>a</sub>{" "}
								+ R<sub>b</sub> + R<sub>c</sub>)
							</p>
						</div>
					</div>

					<div className={cardClass}>
						<h4 className="mb-3 font-semibold [color:var(--text-muted)]">
							Wye to Delta
						</h4>
						<div className="space-y-2 font-mono text-sm [color:var(--text)]">
							<p>
								R<sub>a</sub> = (R<sub>1</sub>R<sub>2</sub> + R<sub>2</sub>R
								<sub>3</sub> + R<sub>3</sub>R<sub>1</sub>) / R<sub>2</sub>
							</p>
							<p>
								R<sub>b</sub> = (R<sub>1</sub>R<sub>2</sub> + R<sub>2</sub>R
								<sub>3</sub> + R<sub>3</sub>R<sub>1</sub>) / R<sub>3</sub>
							</p>
							<p>
								R<sub>c</sub> = (R<sub>1</sub>R<sub>2</sub> + R<sub>2</sub>R
								<sub>3</sub> + R<sub>3</sub>R<sub>1</sub>) / R<sub>1</sub>
							</p>
						</div>
					</div>

					<div className={`${cardClass} md:col-span-2`}>
						<h4 className="mb-2 font-semibold [color:var(--text-muted)]">
							Balanced Systems
						</h4>
						<div className="space-y-1 font-mono text-sm [color:var(--text)]">
							<p>
								If R<sub>Δ</sub> = R in all branches: R<sub>Y</sub> = R
								<sub>Δ</sub> / 3
							</p>
							<p>
								If R<sub>Y</sub> = R in all branches: R<sub>Δ</sub> = 3 × R
								<sub>Y</sub>
							</p>
						</div>
					</div>
				</div>
			</FrameSection>
		</div>
	);
}

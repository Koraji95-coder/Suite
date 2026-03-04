import { Zap } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/apps/ui/PageFrame";
import { cn } from "@/lib/utils";
import styles from "./ThreePhaseCalculator.module.css";

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

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<Zap className={styles.headerIcon} />
				<h2 className={styles.title}>Three-Phase Systems</h2>
			</div>

			<Section title="Voltage Relationships in 3-Phase System">
				<div className={styles.twoColumnLayout}>
					<div className={styles.stack}>
						<div>
							<label className={styles.label}>Configuration</label>
							<select
								value={configuration}
								onChange={(e) =>
									setConfiguration(e.target.value as "wye" | "delta")
								}
								className={styles.inputControl}
							>
								<option value="wye">Wye (Y)</option>
								<option value="delta">Delta (Δ)</option>
							</select>
						</div>

						<div>
							<label className={styles.label}>
								Line Voltage (V<sub>L</sub>)
							</label>
							<input
								type="number"
								value={lineVoltage}
								onChange={(e) =>
									setLineVoltage(parseFloat(e.target.value) || 0)
								}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>
								Line Current (I<sub>L</sub>)
							</label>
							<input
								type="number"
								value={lineCurrent}
								onChange={(e) =>
									setLineCurrent(parseFloat(e.target.value) || 0)
								}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>Power Factor (cos φ)</label>
							<input
								type="number"
								step="0.01"
								min="0"
								max="1"
								value={powerFactor}
								onChange={(e) =>
									setPowerFactor(parseFloat(e.target.value) || 0)
								}
								className={styles.inputControl}
							/>
						</div>
					</div>

					<div className={styles.stack}>
						<div className={cn(styles.metricCard, styles.metricCardPrimary)}>
							<p className={styles.metricLabelPrimary}>
								Phase Voltage (V<sub>φ</sub>)
							</p>
							<p className={styles.metricValue}>{phaseVoltage.toFixed(2)} V</p>
							<p className={styles.metricHelp}>
								{configuration === "wye" ? "V_φ = V_L / √3" : "V_φ = V_L"}
							</p>
						</div>

						<div className={cn(styles.metricCard, styles.metricCardPrimary)}>
							<p className={styles.metricLabelPrimary}>
								Phase Current (I<sub>φ</sub>)
							</p>
							<p className={styles.metricValue}>{phaseCurrent.toFixed(2)} A</p>
							<p className={styles.metricHelp}>
								{configuration === "wye" ? "I_φ = I_L" : "I_φ = I_L / √3"}
							</p>
						</div>

						<div className={cn(styles.metricCard, styles.metricCardPrimary)}>
							<p className={styles.metricLabelPrimary}>Phase Angle (φ)</p>
							<p className={styles.metricValue}>{angle.toFixed(2)}°</p>
							<p className={styles.metricHelp}>φ = cos⁻¹(PF)</p>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<h4 className={styles.subheading}>Phase Voltage Relationships</h4>
					<div className={styles.formulaPanel}>
						<p>
							V<sub>an</sub> = V<sub>φ</sub>∠0°
						</p>
						<p>
							V<sub>bn</sub> = V<sub>φ</sub>∠-120°
						</p>
						<p>
							V<sub>cn</sub> = V<sub>φ</sub>∠-240° (or +120°)
						</p>
						<p className={styles.formulaNote}>
							Balanced system: V<sub>an</sub> + V<sub>bn</sub> + V<sub>cn</sub>{" "}
							= 0
						</p>
					</div>
				</div>
			</Section>

			<Section title="Power Calculations">
				<div className={styles.powerGrid}>
					<div className={cn(styles.metricCard, styles.metricCardAccent)}>
						<p className={styles.metricLabelAccent}>Active Power (P)</p>
						<p className={styles.metricValueLarge}>
							{activePower.toFixed(2)} kW
						</p>
						<p className={styles.metricHelpTop}>
							P = √3 × V<sub>L</sub> × I<sub>L</sub> × cos(φ)
						</p>
					</div>

					<div className={cn(styles.metricCard, styles.metricCardWarning)}>
						<p className={styles.metricLabelWarning}>Reactive Power (Q)</p>
						<p className={styles.metricValueLarge}>
							{reactivePower.toFixed(2)} kVAR
						</p>
						<p className={styles.metricHelpTop}>
							Q = √3 × V<sub>L</sub> × I<sub>L</sub> × sin(φ)
						</p>
					</div>

					<div
						className={cn(styles.metricCard, styles.metricCardPrimaryStrong)}
					>
						<p className={styles.metricLabelPrimary}>Apparent Power (S)</p>
						<p className={styles.metricValueLarge}>
							{apparentPower.toFixed(2)} kVA
						</p>
						<p className={styles.metricHelpTop}>
							S = √3 × V<sub>L</sub> × I<sub>L</sub>
						</p>
					</div>
				</div>

				<div className={styles.inlinePanel}>
					<h4 className={styles.inlinePanelTitle}>
						Power Triangle Relationships
					</h4>
					<div className={styles.monoList}>
						<p>S² = P² + Q²</p>
						<p>Power Factor (PF) = P / S = cos(φ)</p>
						<p>Q = P × tan(φ)</p>
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
							<h4 className={styles.inlinePanelTitle}>
								Step-by-Step Power Calculation
							</h4>
							<div className={styles.monoList}>
								{getPowerSteps().map((step, i) => (
									<p key={i} className={step === "" ? styles.spacer : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</Section>

			<Section title="Fault Analysis">
				<div className={styles.twoColumnLayout}>
					<div className={styles.stack}>
						<div>
							<label className={styles.label}>Base Voltage (kV)</label>
							<input
								type="number"
								value={baseVoltage}
								onChange={(e) =>
									setBaseVoltage(parseFloat(e.target.value) || 0)
								}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>Source Impedance (Ω)</label>
							<input
								type="number"
								step="0.01"
								value={sourceImpedance}
								onChange={(e) =>
									setSourceImpedance(parseFloat(e.target.value) || 0)
								}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>Fault Type</label>
							<select
								value={faultType}
								onChange={(e) =>
									setFaultType(
										e.target.value as "3phase" | "line-line" | "line-ground",
									)
								}
								className={styles.inputControl}
							>
								<option value="3phase">Three-Phase (3φ)</option>
								<option value="line-line">Line-to-Line (L-L)</option>
								<option value="line-ground">Line-to-Ground (L-G)</option>
							</select>
						</div>
					</div>

					<div className={styles.stack}>
						<div className={cn(styles.metricCard, styles.metricCardDanger)}>
							<p className={styles.metricLabelDanger}>
								Fault Current (I<sub>f</sub>)
							</p>
							<p className={styles.metricValueLarge}>
								{(faultCurrent / 1000).toFixed(2)} kA
							</p>
						</div>

						<div className={styles.inlinePanel}>
							<h4 className={styles.inlinePanelTitle}>Fault Formulas</h4>
							<div className={styles.monoList}>
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
			</Section>

			<Section title="Δ-Y Transformation">
				<div className={styles.deltaGrid}>
					<div className={styles.inlinePanel}>
						<h4 className={styles.inlinePanelTitleLarge}>Delta to Wye</h4>
						<div className={styles.monoListSpaced}>
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

					<div className={styles.inlinePanel}>
						<h4 className={styles.inlinePanelTitleLarge}>Wye to Delta</h4>
						<div className={styles.monoListSpaced}>
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

					<div className={cn(styles.inlinePanel, styles.balancedPanel)}>
						<h4 className={styles.inlinePanelTitle}>Balanced Systems</h4>
						<div className={styles.monoList}>
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
			</Section>
		</div>
	);
}

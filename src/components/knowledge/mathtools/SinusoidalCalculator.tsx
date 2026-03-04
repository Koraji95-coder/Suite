import { Activity } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/apps/ui/PageFrame";
import { cn } from "@/lib/utils";
import styles from "./SinusoidalCalculator.module.css";

export function SinusoidalCalculator() {
	const [amplitude, setAmplitude] = useState(220);
	const [frequency, setFrequency] = useState(50);
	const [phase, setPhase] = useState(0);
	const [showSinusoidalWork, setShowSinusoidalWork] = useState(false);
	const [showPerUnitWork, setShowPerUnitWork] = useState(false);

	const omega = 2 * Math.PI * frequency;
	const rms = amplitude / Math.sqrt(2);
	const period = 1 / frequency;
	const angularPhase = (phase * Math.PI) / 180;

	const [baseMVA, setBaseMVA] = useState(100);
	const [baseKV, setBaseKV] = useState(11);
	const [actualMW, setActualMW] = useState(75);
	const [actualKV, setActualKV] = useState(10.5);

	const baseImpedance = (baseKV * baseKV) / baseMVA;
	const perUnitPower = actualMW / baseMVA;
	const perUnitVoltage = actualKV / baseKV;
	const percentPower = perUnitPower * 100;
	const percentVoltage = perUnitVoltage * 100;

	const getSinusoidalSteps = () => {
		return [
			`Given: Peak amplitude (V_m) = ${amplitude} V, Frequency (f) = ${frequency} Hz, Phase angle (φ) = ${phase}°`,
			``,
			`Step 1: Calculate RMS value`,
			`V_RMS = V_m / √2`,
			`V_RMS = ${amplitude} / ${Math.sqrt(2).toFixed(4)}`,
			`V_RMS = ${rms.toFixed(2)} V`,
			``,
			`Step 2: Calculate angular frequency (ω)`,
			`ω = 2πf`,
			`ω = 2 × π × ${frequency}`,
			`ω = ${omega.toFixed(2)} rad/s`,
			``,
			`Step 3: Calculate period (T)`,
			`T = 1 / f`,
			`T = 1 / ${frequency}`,
			`T = ${period.toFixed(4)} s = ${(period * 1000).toFixed(2)} ms`,
			``,
			`Step 4: Convert phase angle to radians`,
			`φ_rad = φ_deg × π / 180`,
			`φ_rad = ${phase} × π / 180`,
			`φ_rad = ${angularPhase.toFixed(4)} rad`,
			``,
			`Step 5: Write sinusoidal expression`,
			`Time domain: v(t) = ${amplitude} × sin(${omega.toFixed(2)}t ${phase !== 0 ? `+ ${angularPhase.toFixed(4)}` : ""})`,
			`Phasor form: V = ${rms.toFixed(2)}∠${phase}°`,
			`Complex form: V = ${(rms * Math.cos(angularPhase)).toFixed(2)} ${(rms * Math.sin(angularPhase)) >= 0 ? "+" : ""} j${(rms * Math.sin(angularPhase)).toFixed(2)}`,
		];
	};

	const getPerUnitSteps = () => {
		return [
			`Given: Base MVA = ${baseMVA}, Base kV = ${baseKV}`,
			`Actual values: Power = ${actualMW} MW, Voltage = ${actualKV} kV`,
			``,
			`Step 1: Calculate base impedance`,
			`Z_base = V_base² / S_base`,
			`Z_base = ${baseKV}² / ${baseMVA}`,
			`Z_base = ${baseKV * baseKV} / ${baseMVA}`,
			`Z_base = ${baseImpedance.toFixed(2)} Ω`,
			``,
			`Step 2: Calculate per-unit power`,
			`P_pu = P_actual / P_base`,
			`P_pu = ${actualMW} / ${baseMVA}`,
			`P_pu = ${perUnitPower.toFixed(4)} p.u.`,
			``,
			`Step 3: Convert to percent`,
			`P_% = P_pu × 100`,
			`P_% = ${perUnitPower.toFixed(4)} × 100`,
			`P_% = ${percentPower.toFixed(2)}%`,
			``,
			`Step 4: Calculate per-unit voltage`,
			`V_pu = V_actual / V_base`,
			`V_pu = ${actualKV} / ${baseKV}`,
			`V_pu = ${perUnitVoltage.toFixed(4)} p.u.`,
			``,
			`Step 5: Convert to percent`,
			`V_% = V_pu × 100`,
			`V_% = ${perUnitVoltage.toFixed(4)} × 100`,
			`V_% = ${percentVoltage.toFixed(2)}%`,
		];
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<Activity className={styles.headerIcon} />
				<h2 className={styles.title}>Sinusoidal Analysis & Per-Unit System</h2>
			</div>

			<Section title="Sinusoidal Waveform Calculator">
				<div className={styles.twoColumnLayout}>
					<div className={styles.stack}>
						<div>
							<label className={styles.label}>
								Peak Amplitude (V<sub>m</sub> or I<sub>m</sub>)
							</label>
							<input
								type="number"
								value={amplitude}
								onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>Frequency (Hz)</label>
							<input
								type="number"
								value={frequency}
								onChange={(e) => setFrequency(parseFloat(e.target.value) || 0)}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>Phase Angle (degrees)</label>
							<input
								type="number"
								value={phase}
								onChange={(e) => setPhase(parseFloat(e.target.value) || 0)}
								className={styles.inputControl}
							/>
						</div>
					</div>

					<div className={styles.stack}>
						<div className={cn(styles.metricCard, styles.metricCardPrimary)}>
							<p className={styles.metricLabelPrimary}>RMS Value</p>
							<p className={styles.metricValue}>{rms.toFixed(2)}</p>
							<p className={styles.metricHelp}>
								RMS = V<sub>m</sub> / √2
							</p>
						</div>

						<div className={cn(styles.metricCard, styles.metricCardPrimary)}>
							<p className={styles.metricLabelPrimary}>Angular Frequency (ω)</p>
							<p className={styles.metricValue}>{omega.toFixed(2)} rad/s</p>
							<p className={styles.metricHelp}>ω = 2πf</p>
						</div>

						<div className={cn(styles.metricCard, styles.metricCardPrimary)}>
							<p className={styles.metricLabelPrimary}>Period (T)</p>
							<p className={styles.metricValue}>
								{(period * 1000).toFixed(2)} ms
							</p>
							<p className={styles.metricHelp}>T = 1 / f</p>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<h4 className={styles.subheading}>Sinusoidal Representations</h4>

					<div className={styles.representationGrid}>
						<div className={styles.inlinePanel}>
							<p className={styles.metricLabelPrimary}>Time Domain</p>
							<p className={styles.monoTextSm}>
								v(t) = {amplitude} × sin({omega.toFixed(2)}t{" "}
								{phase !== 0 ? `+ ${angularPhase.toFixed(4)}` : ""})
							</p>
							<p className={styles.metricHelpTop}>
								General form: v(t) = V<sub>m</sub> × sin(ωt + φ)
							</p>
						</div>

						<div className={styles.inlinePanel}>
							<p className={styles.metricLabelPrimary}>Phasor Form</p>
							<p className={styles.monoTextSm}>
								V = {rms.toFixed(2)}∠{phase}°
							</p>
							<p className={styles.metricHelpTop}>
								Phasor: V = V<sub>RMS</sub>∠φ
							</p>
						</div>

						<div className={styles.inlinePanel}>
							<p className={styles.metricLabelPrimary}>Complex Form</p>
							<p className={styles.monoTextSm}>
								V = {(rms * Math.cos(angularPhase)).toFixed(2)}{" "}
								{rms * Math.sin(angularPhase) >= 0 ? "+" : ""} j
								{(rms * Math.sin(angularPhase)).toFixed(2)}
							</p>
							<p className={styles.metricHelpTop}>
								V = V<sub>RMS</sub> × (cos(φ) + j·sin(φ))
							</p>
						</div>

						<div className={styles.inlinePanel}>
							<p className={styles.metricLabelPrimary}>Exponential Form</p>
							<p className={styles.monoTextSm}>
								V = {rms.toFixed(2)} × e^(j·{angularPhase.toFixed(4)})
							</p>
							<p className={styles.metricHelpTop}>
								V = V<sub>RMS</sub> × e^(jφ)
							</p>
						</div>
					</div>
				</div>

				<div className={styles.highlightPanel}>
					<h4 className={styles.inlinePanelTitle}>Key Relationships</h4>
					<div className={styles.keyGrid}>
						<div className={styles.keyList}>
							<p>• Average Value = 0 (symmetric)</p>
							<p>
								• RMS = V<sub>m</sub> / √2 = 0.707 × V<sub>m</sub>
							</p>
							<p>
								• V<sub>m</sub> = √2 × RMS = 1.414 × RMS
							</p>
						</div>
						<div className={styles.keyList}>
							<p>• Period T = 1/f</p>
							<p>• Frequency f = 1/T</p>
							<p>• Angular frequency ω = 2πf</p>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<button
						onClick={() => setShowSinusoidalWork(!showSinusoidalWork)}
						className={styles.toggleButton}
					>
						{showSinusoidalWork ? "Hide" : "Show"} Step-by-Step Work
					</button>

					{showSinusoidalWork && (
						<div className={styles.workPanel}>
							<h4 className={styles.inlinePanelTitle}>
								Step-by-Step Sinusoidal Analysis
							</h4>
							<div className={styles.monoList}>
								{getSinusoidalSteps().map((step, i) => (
									<p key={i} className={step === "" ? styles.spacer : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</Section>

			<Section title="Per-Unit System Calculator">
				<div className={styles.twoColumnLayout}>
					<div className={styles.stack}>
						<h4 className={styles.subheading}>Base Values</h4>

						<div>
							<label className={styles.label}>
								Base MVA (S<sub>base</sub>)
							</label>
							<input
								type="number"
								value={baseMVA}
								onChange={(e) => setBaseMVA(parseFloat(e.target.value) || 0)}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>
								Base kV (V<sub>base</sub>)
							</label>
							<input
								type="number"
								value={baseKV}
								onChange={(e) => setBaseKV(parseFloat(e.target.value) || 0)}
								className={styles.inputControl}
							/>
						</div>

						<div className={cn(styles.metricCard, styles.metricCardPrimary)}>
							<p className={styles.metricLabelPrimary}>
								Base Impedance (Z<sub>base</sub>)
							</p>
							<p className={styles.metricValue}>{baseImpedance.toFixed(2)} Ω</p>
							<p className={styles.metricHelp}>
								Z<sub>base</sub> = V<sub>base</sub>² / S<sub>base</sub>
							</p>
						</div>
					</div>

					<div className={styles.stack}>
						<h4 className={styles.subheading}>Actual Values</h4>

						<div>
							<label className={styles.label}>Actual Power (MW)</label>
							<input
								type="number"
								value={actualMW}
								onChange={(e) => setActualMW(parseFloat(e.target.value) || 0)}
								className={styles.inputControl}
							/>
						</div>

						<div>
							<label className={styles.label}>Actual Voltage (kV)</label>
							<input
								type="number"
								value={actualKV}
								onChange={(e) => setActualKV(parseFloat(e.target.value) || 0)}
								className={styles.inputControl}
							/>
						</div>

						<div className={styles.perUnitResultGrid}>
							<div className={cn(styles.metricCard, styles.metricCardAccent)}>
								<p className={styles.metricLabelAccent}>Per-Unit Power</p>
								<p className={styles.metricValue}>
									{perUnitPower.toFixed(4)} p.u.
								</p>
							</div>

							<div
								className={cn(
									styles.metricCard,
									styles.metricCardPrimaryStrong,
								)}
							>
								<p className={styles.metricLabelPrimary}>Percent Power</p>
								<p className={styles.metricValue}>{percentPower.toFixed(2)}%</p>
							</div>

							<div className={cn(styles.metricCard, styles.metricCardAccent)}>
								<p className={styles.metricLabelAccent}>Per-Unit Voltage</p>
								<p className={styles.metricValue}>
									{perUnitVoltage.toFixed(4)} p.u.
								</p>
							</div>

							<div
								className={cn(
									styles.metricCard,
									styles.metricCardPrimaryStrong,
								)}
							>
								<p className={styles.metricLabelPrimary}>Percent Voltage</p>
								<p className={styles.metricValue}>
									{percentVoltage.toFixed(2)}%
								</p>
							</div>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<h4 className={styles.subheading}>Per-Unit System Formulas</h4>

					<div className={styles.representationGrid}>
						<div className={styles.inlinePanel}>
							<h5 className={styles.inlinePanelTitle}>Base Quantities</h5>
							<div className={styles.monoList}>
								<p>
									Z<sub>base</sub> = V<sub>base</sub>² / S<sub>base</sub>
								</p>
								<p>
									I<sub>base</sub> = S<sub>base</sub> / (√3 × V<sub>base</sub>)
								</p>
								<p>
									Y<sub>base</sub> = 1 / Z<sub>base</sub>
								</p>
							</div>
						</div>

						<div className={styles.inlinePanel}>
							<h5 className={styles.inlinePanelTitle}>Per-Unit Conversion</h5>
							<div className={styles.monoList}>
								<p>
									X<sub>p.u.</sub> = X<sub>actual</sub> / X<sub>base</sub>
								</p>
								<p>
									X<sub>%</sub> = X<sub>p.u.</sub> × 100
								</p>
								<p>
									X<sub>actual</sub> = X<sub>p.u.</sub> × X<sub>base</sub>
								</p>
							</div>
						</div>

						<div className={styles.inlinePanel}>
							<h5 className={styles.inlinePanelTitle}>Change of Base</h5>
							<div className={styles.monoListXs}>
								<p>
									Z<sub>p.u.,new</sub> = Z<sub>p.u.,old</sub> × (S
									<sub>base,new</sub> / S<sub>base,old</sub>) × (V
									<sub>base,old</sub> / V<sub>base,new</sub>)²
								</p>
							</div>
						</div>

						<div className={styles.inlinePanel}>
							<h5 className={styles.inlinePanelTitle}>Advantages</h5>
							<div className={styles.mutedListXs}>
								<p>• Simplifies calculations</p>
								<p>• Values typically 0.8-1.2 p.u.</p>
								<p>• Easier comparison of systems</p>
							</div>
						</div>
					</div>
				</div>

				<div className={styles.topSection}>
					<button
						onClick={() => setShowPerUnitWork(!showPerUnitWork)}
						className={styles.toggleButton}
					>
						{showPerUnitWork ? "Hide" : "Show"} Step-by-Step Work
					</button>

					{showPerUnitWork && (
						<div className={styles.workPanel}>
							<h4 className={styles.inlinePanelTitle}>
								Step-by-Step Per-Unit Calculation
							</h4>
							<div className={styles.monoList}>
								{getPerUnitSteps().map((step, i) => (
									<p key={i} className={step === "" ? styles.spacer : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</Section>

			<Section title="Example: Sinusoidal Voltage">
				<div className={styles.exampleBlock}>
					<p className={styles.exampleHeading}>
						Given: v(t) = 220√2 × sin(2π × 50t + 30°)
					</p>
					<p className={styles.exampleIndented}>
						• Peak Amplitude (V<sub>m</sub>) = 220√2 = 311.13 V
					</p>
					<p className={styles.exampleIndented}>• RMS Value = 220 V</p>
					<p className={styles.exampleIndented}>• Frequency (f) = 50 Hz</p>
					<p className={styles.exampleIndented}>• Period (T) = 1/50 = 20 ms</p>
					<p className={styles.exampleIndented}>
						• Angular Frequency (ω) = 2π × 50 = 314.16 rad/s
					</p>
					<p className={styles.exampleIndented}>
						• Phase Angle (φ) = 30° = 0.524 rad
					</p>
					<p className={styles.exampleIndented}>• Phasor Form: V = 220∠30° V</p>
				</div>
			</Section>
		</div>
	);
}

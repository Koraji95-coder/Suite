import { Activity } from "lucide-react";
import { useState } from "react";
import { FrameSection } from "../../apps/ui/PageFrame";

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

	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";
	const labelClass = "mb-1 block text-sm [color:var(--text-muted)]";
	const cardClass =
		"rounded-lg border p-4 [border-color:var(--border)] [background:var(--surface)]";

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
		<div className="space-y-6">
			<div className="flex items-center space-x-3 mb-6">
				<Activity className="h-8 w-8 [color:var(--primary)]" />
				<h2 className="text-3xl font-bold [color:var(--text)]">
					Sinusoidal Analysis & Per-Unit System
				</h2>
			</div>

			<FrameSection title="Sinusoidal Waveform Calculator">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<div>
							<label className={labelClass}>
								Peak Amplitude (V<sub>m</sub> or I<sub>m</sub>)
							</label>
							<input
								type="number"
								value={amplitude}
								onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>Frequency (Hz)</label>
							<input
								type="number"
								value={frequency}
								onChange={(e) => setFrequency(parseFloat(e.target.value) || 0)}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>Phase Angle (degrees)</label>
							<input
								type="number"
								value={phase}
								onChange={(e) => setPhase(parseFloat(e.target.value) || 0)}
								className={inputClass}
							/>
						</div>
					</div>

					<div className="space-y-4">
						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								RMS Value
							</p>
							<p className="font-mono text-xl [color:var(--text)]">
								{rms.toFixed(2)}
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">
								RMS = V<sub>m</sub> / √2
							</p>
						</div>

						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Angular Frequency (ω)
							</p>
							<p className="font-mono text-xl [color:var(--text)]">
								{omega.toFixed(2)} rad/s
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">ω = 2πf</p>
						</div>

						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Period (T)
							</p>
							<p className="font-mono text-xl [color:var(--text)]">
								{(period * 1000).toFixed(2)} ms
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">
								T = 1 / f
							</p>
						</div>
					</div>
				</div>

				<div className="mt-6 space-y-4">
					<h4 className="text-lg font-semibold [color:var(--text-muted)]">
						Sinusoidal Representations
					</h4>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Time Domain
							</p>
							<p className="font-mono text-sm [color:var(--text)]">
								v(t) = {amplitude} × sin({omega.toFixed(2)}t{" "}
								{phase !== 0 ? `+ ${angularPhase.toFixed(4)}` : ""})
							</p>
							<p className="mt-2 text-xs [color:var(--text-muted)]">
								General form: v(t) = V<sub>m</sub> × sin(ωt + φ)
							</p>
						</div>

						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Phasor Form
							</p>
							<p className="font-mono text-sm [color:var(--text)]">
								V = {rms.toFixed(2)}∠{phase}°
							</p>
							<p className="mt-2 text-xs [color:var(--text-muted)]">
								Phasor: V = V<sub>RMS</sub>∠φ
							</p>
						</div>

						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Complex Form
							</p>
							<p className="font-mono text-sm [color:var(--text)]">
								V = {(rms * Math.cos(angularPhase)).toFixed(2)}{" "}
								{rms * Math.sin(angularPhase) >= 0 ? "+" : ""} j
								{(rms * Math.sin(angularPhase)).toFixed(2)}
							</p>
							<p className="mt-2 text-xs [color:var(--text-muted)]">
								V = V<sub>RMS</sub> × (cos(φ) + j·sin(φ))
							</p>
						</div>

						<div className={cardClass}>
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Exponential Form
							</p>
							<p className="font-mono text-sm [color:var(--text)]">
								V = {rms.toFixed(2)} × e^(j·{angularPhase.toFixed(4)})
							</p>
							<p className="mt-2 text-xs [color:var(--text-muted)]">
								V = V<sub>RMS</sub> × e^(jφ)
							</p>
						</div>
					</div>
				</div>

				<div className="mt-6 rounded-lg border p-5 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,var(--surface))]">
					<h4 className="mb-3 font-semibold [color:var(--text-muted)]">
						Key Relationships
					</h4>
					<div className="grid grid-cols-1 gap-3 font-mono text-sm [color:var(--text)] md:grid-cols-2">
						<div className="space-y-1">
							<p>• Average Value = 0 (symmetric)</p>
							<p>
								• RMS = V<sub>m</sub> / √2 = 0.707 × V<sub>m</sub>
							</p>
							<p>
								• V<sub>m</sub> = √2 × RMS = 1.414 × RMS
							</p>
						</div>
						<div className="space-y-1">
							<p>• Period T = 1/f</p>
							<p>• Frequency f = 1/T</p>
							<p>• Angular frequency ω = 2πf</p>
						</div>
					</div>
				</div>

				<div className="mt-6">
					<button
						onClick={() => setShowSinusoidalWork(!showSinusoidalWork)}
						className="rounded-lg border px-4 py-2 text-sm font-medium transition [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)] hover:[background:color-mix(in_srgb,var(--primary)_26%,transparent)]"
					>
						{showSinusoidalWork ? "Hide" : "Show"} Step-by-Step Work
					</button>

					{showSinusoidalWork && (
						<div className="mt-4 rounded-lg border p-5 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,var(--surface))]">
							<h4 className="mb-3 font-semibold [color:var(--text-muted)]">
								Step-by-Step Sinusoidal Analysis
							</h4>
							<div className="space-y-1 font-mono text-sm [color:var(--text)]">
								{getSinusoidalSteps().map((step, i) => (
									<p key={i} className={step === "" ? "h-2" : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</FrameSection>

			<FrameSection title="Per-Unit System Calculator">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<h4 className="text-lg font-semibold [color:var(--text-muted)]">
							Base Values
						</h4>

						<div>
							<label className={labelClass}>
								Base MVA (S<sub>base</sub>)
							</label>
							<input
								type="number"
								value={baseMVA}
								onChange={(e) => setBaseMVA(parseFloat(e.target.value) || 0)}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>
								Base kV (V<sub>base</sub>)
							</label>
							<input
								type="number"
								value={baseKV}
								onChange={(e) => setBaseKV(parseFloat(e.target.value) || 0)}
								className={inputClass}
							/>
						</div>

						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
								Base Impedance (Z<sub>base</sub>)
							</p>
							<p className="font-mono text-xl [color:var(--text)]">
								{baseImpedance.toFixed(2)} Ω
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">
								Z<sub>base</sub> = V<sub>base</sub>² / S<sub>base</sub>
							</p>
						</div>
					</div>

					<div className="space-y-4">
						<h4 className="text-lg font-semibold [color:var(--text-muted)]">
							Actual Values
						</h4>

						<div>
							<label className={labelClass}>Actual Power (MW)</label>
							<input
								type="number"
								value={actualMW}
								onChange={(e) => setActualMW(parseFloat(e.target.value) || 0)}
								className={inputClass}
							/>
						</div>

						<div>
							<label className={labelClass}>Actual Voltage (kV)</label>
							<input
								type="number"
								value={actualKV}
								onChange={(e) => setActualKV(parseFloat(e.target.value) || 0)}
								className={inputClass}
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="rounded-lg border p-4 [border-color:var(--accent)] [background:color-mix(in_srgb,var(--accent)_14%,transparent)]">
								<p className="mb-2 text-sm font-semibold [color:var(--accent)]">
									Per-Unit Power
								</p>
								<p className="font-mono text-xl [color:var(--text)]">
									{perUnitPower.toFixed(4)} p.u.
								</p>
							</div>

							<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_14%,transparent)]">
								<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
									Percent Power
								</p>
								<p className="font-mono text-xl [color:var(--text)]">
									{percentPower.toFixed(2)}%
								</p>
							</div>

							<div className="rounded-lg border p-4 [border-color:var(--accent)] [background:color-mix(in_srgb,var(--accent)_14%,transparent)]">
								<p className="mb-2 text-sm font-semibold [color:var(--accent)]">
									Per-Unit Voltage
								</p>
								<p className="font-mono text-xl [color:var(--text)]">
									{perUnitVoltage.toFixed(4)} p.u.
								</p>
							</div>

							<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_14%,transparent)]">
								<p className="mb-2 text-sm font-semibold [color:var(--primary)]">
									Percent Voltage
								</p>
								<p className="font-mono text-xl [color:var(--text)]">
									{percentVoltage.toFixed(2)}%
								</p>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-6 space-y-4">
					<h4 className="text-lg font-semibold [color:var(--text-muted)]">
						Per-Unit System Formulas
					</h4>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className={cardClass}>
							<h5 className="mb-2 font-semibold [color:var(--text-muted)]">
								Base Quantities
							</h5>
							<div className="space-y-1 font-mono text-sm [color:var(--text)]">
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

						<div className={cardClass}>
							<h5 className="mb-2 font-semibold [color:var(--text-muted)]">
								Per-Unit Conversion
							</h5>
							<div className="space-y-1 font-mono text-sm [color:var(--text)]">
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

						<div className={cardClass}>
							<h5 className="mb-2 font-semibold [color:var(--text-muted)]">
								Change of Base
							</h5>
							<div className="space-y-1 font-mono text-xs [color:var(--text)]">
								<p>
									Z<sub>p.u.,new</sub> = Z<sub>p.u.,old</sub> × (S
									<sub>base,new</sub> / S<sub>base,old</sub>) × (V
									<sub>base,old</sub> / V<sub>base,new</sub>)²
								</p>
							</div>
						</div>

						<div className={cardClass}>
							<h5 className="mb-2 font-semibold [color:var(--text-muted)]">
								Advantages
							</h5>
							<div className="space-y-1 text-xs [color:var(--text-muted)]">
								<p>• Simplifies calculations</p>
								<p>• Values typically 0.8-1.2 p.u.</p>
								<p>• Easier comparison of systems</p>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-6">
					<button
						onClick={() => setShowPerUnitWork(!showPerUnitWork)}
						className="rounded-lg border px-4 py-2 text-sm font-medium transition [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)] hover:[background:color-mix(in_srgb,var(--primary)_26%,transparent)]"
					>
						{showPerUnitWork ? "Hide" : "Show"} Step-by-Step Work
					</button>

					{showPerUnitWork && (
						<div className="mt-4 rounded-lg border p-5 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,var(--surface))]">
							<h4 className="mb-3 font-semibold [color:var(--text-muted)]">
								Step-by-Step Per-Unit Calculation
							</h4>
							<div className="space-y-1 font-mono text-sm [color:var(--text)]">
								{getPerUnitSteps().map((step, i) => (
									<p key={i} className={step === "" ? "h-2" : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</FrameSection>

			<FrameSection title="Example: Sinusoidal Voltage">
				<div className="space-y-2 [color:var(--text)]">
					<p className="font-semibold">
						Given: v(t) = 220√2 × sin(2π × 50t + 30°)
					</p>
					<p className="pl-4">
						• Peak Amplitude (V<sub>m</sub>) = 220√2 = 311.13 V
					</p>
					<p className="pl-4">• RMS Value = 220 V</p>
					<p className="pl-4">• Frequency (f) = 50 Hz</p>
					<p className="pl-4">• Period (T) = 1/50 = 20 ms</p>
					<p className="pl-4">
						• Angular Frequency (ω) = 2π × 50 = 314.16 rad/s
					</p>
					<p className="pl-4">• Phase Angle (φ) = 30° = 0.524 rad</p>
					<p className="pl-4">• Phasor Form: V = 220∠30° V</p>
				</div>
			</FrameSection>
		</div>
	);
}

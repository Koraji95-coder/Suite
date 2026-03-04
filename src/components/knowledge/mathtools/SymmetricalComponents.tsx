import { GitBranch } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/apps/ui/PageFrame";
import styles from "./SymmetricalComponents.module.css";

export function SymmetricalComponents() {
	const [va, setVa] = useState({ mag: 100, angle: 0 });
	const [vb, setVb] = useState({ mag: 80, angle: -110 });
	const [vc, setVc] = useState({ mag: 90, angle: 125 });
	const [showWork, setShowWork] = useState(false);

	const degToRad = (deg: number) => (deg * Math.PI) / 180;
	const radToDeg = (rad: number) => (rad * 180) / Math.PI;

	const polarToRect = (mag: number, angleDeg: number) => {
		const rad = degToRad(angleDeg);
		return { x: mag * Math.cos(rad), y: mag * Math.sin(rad) };
	};

	const rectToPolar = (x: number, y: number) => {
		const mag = Math.sqrt(x * x + y * y);
		const angle = radToDeg(Math.atan2(y, x));
		return { mag, angle };
	};

	const a = { x: -0.5, y: Math.sqrt(3) / 2 };
	const a2 = { x: -0.5, y: -Math.sqrt(3) / 2 };

	const complexMult = (
		c1: { x: number; y: number },
		c2: { x: number; y: number },
	) => ({
		x: c1.x * c2.x - c1.y * c2.y,
		y: c1.x * c2.y + c1.y * c2.x,
	});

	const vaRect = polarToRect(va.mag, va.angle);
	const vbRect = polarToRect(vb.mag, vb.angle);
	const vcRect = polarToRect(vc.mag, vc.angle);

	const v0Rect = {
		x: (vaRect.x + vbRect.x + vcRect.x) / 3,
		y: (vaRect.y + vbRect.y + vcRect.y) / 3,
	};

	const aVb = complexMult(a, vbRect);
	const a2Vc = complexMult(a2, vcRect);
	const v1Rect = {
		x: (vaRect.x + aVb.x + a2Vc.x) / 3,
		y: (vaRect.y + aVb.y + a2Vc.y) / 3,
	};

	const a2Vb = complexMult(a2, vbRect);
	const aVc = complexMult(a, vcRect);
	const v2Rect = {
		x: (vaRect.x + a2Vb.x + aVc.x) / 3,
		y: (vaRect.y + a2Vb.y + aVc.y) / 3,
	};

	const v0 = rectToPolar(v0Rect.x, v0Rect.y);
	const v1 = rectToPolar(v1Rect.x, v1Rect.y);
	const v2 = rectToPolar(v2Rect.x, v2Rect.y);

	const getSteps = () => {
		return [
			`Given unbalanced three-phase system:`,
			`V_a = ${va.mag.toFixed(2)}∠${va.angle.toFixed(2)}°`,
			`V_b = ${vb.mag.toFixed(2)}∠${vb.angle.toFixed(2)}°`,
			`V_c = ${vc.mag.toFixed(2)}∠${vc.angle.toFixed(2)}°`,
			``,
			`Operator 'a' = 1∠120° = -0.5 + j0.866`,
			`Operator 'a²' = 1∠240° = 1∠-120° = -0.5 - j0.866`,
			``,
			`Step 1: Convert to rectangular form`,
			`V_a = ${vaRect.x.toFixed(2)} + j${vaRect.y.toFixed(2)}`,
			`V_b = ${vbRect.x.toFixed(2)} + j${vbRect.y.toFixed(2)}`,
			`V_c = ${vcRect.x.toFixed(2)} + j${vcRect.y.toFixed(2)}`,
			``,
			`Step 2: Calculate zero-sequence component (V_a0)`,
			`V_a0 = (1/3)(V_a + V_b + V_c)`,
			`V_a0 = (1/3)[(${vaRect.x.toFixed(2)} + j${vaRect.y.toFixed(2)}) + (${vbRect.x.toFixed(2)} + j${vbRect.y.toFixed(2)}) + (${vcRect.x.toFixed(2)} + j${vcRect.y.toFixed(2)})]`,
			`V_a0 = (1/3)[${(vaRect.x + vbRect.x + vcRect.x).toFixed(2)} + j${(vaRect.y + vbRect.y + vcRect.y).toFixed(2)}]`,
			`V_a0 = ${v0Rect.x.toFixed(2)} + j${v0Rect.y.toFixed(2)}`,
			`V_a0 = ${v0.mag.toFixed(2)}∠${v0.angle.toFixed(2)}°`,
			``,
			`Step 3: Calculate positive-sequence component (V_a1)`,
			`V_a1 = (1/3)(V_a + aV_b + a²V_c)`,
			`aV_b = (${a.x.toFixed(3)} + j${a.y.toFixed(3)}) × (${vbRect.x.toFixed(2)} + j${vbRect.y.toFixed(2)})`,
			`aV_b = ${aVb.x.toFixed(2)} + j${aVb.y.toFixed(2)}`,
			`a²V_c = (${a2.x.toFixed(3)} + j${a2.y.toFixed(3)}) × (${vcRect.x.toFixed(2)} + j${vcRect.y.toFixed(2)})`,
			`a²V_c = ${a2Vc.x.toFixed(2)} + j${a2Vc.y.toFixed(2)}`,
			`V_a1 = (1/3)[${(vaRect.x + aVb.x + a2Vc.x).toFixed(2)} + j${(vaRect.y + aVb.y + a2Vc.y).toFixed(2)}]`,
			`V_a1 = ${v1Rect.x.toFixed(2)} + j${v1Rect.y.toFixed(2)}`,
			`V_a1 = ${v1.mag.toFixed(2)}∠${v1.angle.toFixed(2)}°`,
			``,
			`Step 4: Calculate negative-sequence component (V_a2)`,
			`V_a2 = (1/3)(V_a + a²V_b + aV_c)`,
			`a²V_b = (${a2.x.toFixed(3)} + j${a2.y.toFixed(3)}) × (${vbRect.x.toFixed(2)} + j${vbRect.y.toFixed(2)})`,
			`a²V_b = ${a2Vb.x.toFixed(2)} + j${a2Vb.y.toFixed(2)}`,
			`aV_c = (${a.x.toFixed(3)} + j${a.y.toFixed(3)}) × (${vcRect.x.toFixed(2)} + j${vcRect.y.toFixed(2)})`,
			`aV_c = ${aVc.x.toFixed(2)} + j${aVc.y.toFixed(2)}`,
			`V_a2 = (1/3)[${(vaRect.x + a2Vb.x + aVc.x).toFixed(2)} + j${(vaRect.y + a2Vb.y + aVc.y).toFixed(2)}]`,
			`V_a2 = ${v2Rect.x.toFixed(2)} + j${v2Rect.y.toFixed(2)}`,
			`V_a2 = ${v2.mag.toFixed(2)}∠${v2.angle.toFixed(2)}°`,
			``,
			`Verification: The three sequence networks are independent and balanced within themselves.`,
		];
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<GitBranch className={styles.headerIcon} />
				<h2 className={styles.title}>Symmetrical Components</h2>
			</div>

			<Section title="Theory">
				<div className={styles.theoryBlock}>
					<p>
						Any unbalanced three-phase system can be resolved into three
						balanced systems of phasors called
						<strong className={styles.strongText}>
							{" "}
							symmetrical components
						</strong>
						:
					</p>
					<ul className={styles.theoryList}>
						<li>
							<strong className={styles.strongText}>
								Positive-sequence (1):
							</strong>{" "}
							Three phasors equal in magnitude, displaced 120° from each other,
							with same phase sequence as original (abc)
						</li>
						<li>
							<strong className={styles.strongText}>
								Negative-sequence (2):
							</strong>{" "}
							Three phasors equal in magnitude, displaced 120° from each other,
							with opposite phase sequence (acb)
						</li>
						<li>
							<strong className={styles.strongText}>Zero-sequence (0):</strong>{" "}
							Three phasors equal in magnitude and phase (in phase with each
							other)
						</li>
					</ul>
				</div>
			</Section>

			<Section title="Symmetrical Components Calculator">
				<div className={styles.inputGrid}>
					<div className={styles.phaseColumn}>
						<h4 className={styles.subheading}>Phase A Voltage</h4>
						<div>
							<label className={styles.fieldLabel}>Magnitude (V)</label>
							<input
								type="number"
								step="0.1"
								value={va.mag}
								onChange={(e) =>
									setVa({ ...va, mag: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div>
							<label className={styles.fieldLabel}>Angle (°)</label>
							<input
								type="number"
								step="0.1"
								value={va.angle}
								onChange={(e) =>
									setVa({ ...va, angle: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div className={styles.phaseCardDanger}>
							<p className={styles.phaseCardValue}>
								V_a = {va.mag}∠{va.angle}°
							</p>
						</div>
					</div>

					<div className={styles.phaseColumn}>
						<h4 className={styles.subheading}>Phase B Voltage</h4>
						<div>
							<label className={styles.fieldLabel}>Magnitude (V)</label>
							<input
								type="number"
								step="0.1"
								value={vb.mag}
								onChange={(e) =>
									setVb({ ...vb, mag: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div>
							<label className={styles.fieldLabel}>Angle (°)</label>
							<input
								type="number"
								step="0.1"
								value={vb.angle}
								onChange={(e) =>
									setVb({ ...vb, angle: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div className={styles.phaseCardWarning}>
							<p className={styles.phaseCardValue}>
								V_b = {vb.mag}∠{vb.angle}°
							</p>
						</div>
					</div>

					<div className={styles.phaseColumn}>
						<h4 className={styles.subheading}>Phase C Voltage</h4>
						<div>
							<label className={styles.fieldLabel}>Magnitude (V)</label>
							<input
								type="number"
								step="0.1"
								value={vc.mag}
								onChange={(e) =>
									setVc({ ...vc, mag: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div>
							<label className={styles.fieldLabel}>Angle (°)</label>
							<input
								type="number"
								step="0.1"
								value={vc.angle}
								onChange={(e) =>
									setVc({ ...vc, angle: parseFloat(e.target.value) || 0 })
								}
								className={styles.inputControl}
							/>
						</div>
						<div className={styles.phaseCardAccent}>
							<p className={styles.phaseCardValue}>
								V_c = {vc.mag}∠{vc.angle}°
							</p>
						</div>
					</div>
				</div>

				<div className={styles.sequenceBlock}>
					<h4 className={styles.subheading}>Sequence Components</h4>

					<div className={styles.sequenceGrid}>
						<div className={styles.sequenceCardNeutral}>
							<p className={styles.sequenceLabelNeutral}>
								Zero-Sequence (V_a0)
							</p>
							<p className={styles.sequenceValue}>
								{v0.mag.toFixed(2)}∠{v0.angle.toFixed(2)}°
							</p>
							<p className={styles.sequenceSubtext}>
								{v0Rect.x.toFixed(2)} + j{v0Rect.y.toFixed(2)}
							</p>
						</div>

						<div className={styles.sequenceCardSuccess}>
							<p className={styles.sequenceLabelSuccess}>
								Positive-Sequence (V_a1)
							</p>
							<p className={styles.sequenceValue}>
								{v1.mag.toFixed(2)}∠{v1.angle.toFixed(2)}°
							</p>
							<p className={styles.sequenceSubtext}>
								{v1Rect.x.toFixed(2)} + j{v1Rect.y.toFixed(2)}
							</p>
						</div>

						<div className={styles.sequenceCardDanger}>
							<p className={styles.sequenceLabelDanger}>
								Negative-Sequence (V_a2)
							</p>
							<p className={styles.sequenceValue}>
								{v2.mag.toFixed(2)}∠{v2.angle.toFixed(2)}°
							</p>
							<p className={styles.sequenceSubtext}>
								{v2Rect.x.toFixed(2)} + j{v2Rect.y.toFixed(2)}
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
							<h4 className={styles.panelTitle}>Step-by-Step Analysis</h4>
							<div className={styles.monoListMuted}>
								{getSteps().map((step, i) => (
									<p key={i} className={step === "" ? styles.spacer : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</Section>

			<Section title="Matrix Transformation">
				<div className={styles.stack}>
					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>
							Phase to Sequence (Analytical Method)
						</h4>
						<div className={styles.overflowX}>
							<div className={styles.monoListSpaced}>
								<p>[V_a0] [1 1 1 ] [V_a]</p>
								<p>[V_a1] = (1/3) [1 a a²] [V_b]</p>
								<p>[V_a2] [1 a² a ] [V_c]</p>
							</div>
						</div>
						<p className={styles.noteText}>
							where a = 1∠120° = e^(j2π/3) and a² = 1∠240° = 1∠-120°
						</p>
					</div>

					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>
							Sequence to Phase (Inverse Transformation)
						</h4>
						<div className={styles.overflowX}>
							<div className={styles.monoListSpaced}>
								<p>[V_a] [1 1 1 ] [V_a0]</p>
								<p>[V_b] = [1 a² a ] [V_a1]</p>
								<p>[V_c] [1 a a²] [V_a2]</p>
							</div>
						</div>
					</div>

					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>Operator Properties</h4>
						<div className={styles.operatorGrid}>
							<div className={styles.monoList}>
								<p>a = 1∠120° = -0.5 + j0.866</p>
								<p>a² = 1∠-120° = -0.5 - j0.866</p>
								<p>a³ = 1∠360° = 1</p>
							</div>
							<div className={styles.monoList}>
								<p>1 + a + a² = 0</p>
								<p>a × a = a²</p>
								<p>a² × a = a³ = 1</p>
							</div>
						</div>
					</div>
				</div>
			</Section>

			<Section title="Sequence Components for Other Phases">
				<div className={styles.representationGrid}>
					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>Phase B Components</h4>
						<div className={styles.monoList}>
							<p>V_b0 = V_a0</p>
							<p>V_b1 = a² × V_a1</p>
							<p>V_b2 = a × V_a2</p>
						</div>
					</div>

					<div className={styles.inlinePanel}>
						<h4 className={styles.panelTitle}>Phase C Components</h4>
						<div className={styles.monoList}>
							<p>V_c0 = V_a0</p>
							<p>V_c1 = a × V_a1</p>
							<p>V_c2 = a² × V_a2</p>
						</div>
					</div>
				</div>

				<div className={styles.surfaceNotePanel}>
					<p className={styles.noteBody}>
						<strong className={styles.strongText}>Note:</strong> All three
						phases have the same zero-sequence component. The positive and
						negative sequence components rotate according to the operator 'a'.
					</p>
				</div>
			</Section>

			<Section title="Example: Unbalanced System">
				<div className={styles.exampleBlock}>
					<p>
						Given: V_a = 100∠0° V, V_b = 100∠-110° V, V_c = 100∠125° V
						(unbalanced angles)
					</p>
					<p className={styles.exampleHeading}>Solution:</p>
					<p className={styles.exampleIndented}>
						• Zero-sequence: V_a0 = (1/3)(V_a + V_b + V_c) ≈ 3.92∠161.6° V
					</p>
					<p className={styles.exampleIndented}>
						• Positive-sequence: V_a1 = (1/3)(V_a + aV_b + a²V_c) ≈ 94.73∠-1.3°
						V
					</p>
					<p className={styles.exampleIndented}>
						• Negative-sequence: V_a2 = (1/3)(V_a + a²V_b + aV_c) ≈ 8.88∠-137.5°
						V
					</p>
					<p className={styles.exampleFootnote}>
						This shows the unbalanced system has both positive and negative
						sequence components, plus a small zero-sequence due to angle
						imbalance.
					</p>
				</div>
			</Section>
		</div>
	);
}

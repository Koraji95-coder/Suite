import { GitBranch } from "lucide-react";
import { useState } from "react";
import { FrameSection } from "../../apps/ui/PageFrame";

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
		<div className="space-y-6">
			<div className="flex items-center space-x-3 mb-6">
				<GitBranch className="h-8 w-8 text-[var(--color-accent)]" />
				<h2 className="text-3xl font-bold text-[var(--color-text)]">
					Symmetrical Components
				</h2>
			</div>

			<FrameSection title="Theory">
				<div className="space-y-3 text-[var(--color-text-muted)]">
					<p>
						Any unbalanced three-phase system can be resolved into three
						balanced systems of phasors called
						<strong className="text-[var(--color-text)]">
							{" "}
							symmetrical components
						</strong>
						:
					</p>
					<ul className="list-disc list-inside space-y-2 pl-4">
						<li>
							<strong className="text-[var(--color-text)]">
								Positive-sequence (1):
							</strong>{" "}
							Three phasors equal in magnitude, displaced 120° from each other,
							with same phase sequence as original (abc)
						</li>
						<li>
							<strong className="text-[var(--color-text)]">
								Negative-sequence (2):
							</strong>{" "}
							Three phasors equal in magnitude, displaced 120° from each other,
							with opposite phase sequence (acb)
						</li>
						<li>
							<strong className="text-[var(--color-text)]">
								Zero-sequence (0):
							</strong>{" "}
							Three phasors equal in magnitude and phase (in phase with each
							other)
						</li>
					</ul>
				</div>
			</FrameSection>

			<FrameSection title="Symmetrical Components Calculator">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
					<div className="space-y-3">
						<h4 className="text-lg font-semibold text-[var(--color-text-muted)]">
							Phase A Voltage
						</h4>
						<div>
							<label className="block text-sm text-[var(--color-text-muted)] mb-1">
								Magnitude (V)
							</label>
							<input
								type="number"
								step="0.1"
								value={va.mag}
								onChange={(e) =>
									setVa({ ...va, mag: parseFloat(e.target.value) || 0 })
								}
								className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							/>
						</div>
						<div>
							<label className="block text-sm text-[var(--color-text-muted)] mb-1">
								Angle (°)
							</label>
							<input
								type="number"
								step="0.1"
								value={va.angle}
								onChange={(e) =>
									setVa({ ...va, angle: parseFloat(e.target.value) || 0 })
								}
								className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							/>
						</div>
						<div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
							<p className="font-mono text-sm text-[var(--color-text)]">
								V_a = {va.mag}∠{va.angle}°
							</p>
						</div>
					</div>

					<div className="space-y-3">
						<h4 className="text-lg font-semibold text-[var(--color-text-muted)]">
							Phase B Voltage
						</h4>
						<div>
							<label className="block text-sm text-[var(--color-text-muted)] mb-1">
								Magnitude (V)
							</label>
							<input
								type="number"
								step="0.1"
								value={vb.mag}
								onChange={(e) =>
									setVb({ ...vb, mag: parseFloat(e.target.value) || 0 })
								}
								className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							/>
						</div>
						<div>
							<label className="block text-sm text-[var(--color-text-muted)] mb-1">
								Angle (°)
							</label>
							<input
								type="number"
								step="0.1"
								value={vb.angle}
								onChange={(e) =>
									setVb({ ...vb, angle: parseFloat(e.target.value) || 0 })
								}
								className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							/>
						</div>
						<div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
							<p className="font-mono text-sm text-[var(--color-text)]">
								V_b = {vb.mag}∠{vb.angle}°
							</p>
						</div>
					</div>

					<div className="space-y-3">
						<h4 className="text-lg font-semibold text-[var(--color-text-muted)]">
							Phase C Voltage
						</h4>
						<div>
							<label className="block text-sm text-[var(--color-text-muted)] mb-1">
								Magnitude (V)
							</label>
							<input
								type="number"
								step="0.1"
								value={vc.mag}
								onChange={(e) =>
									setVc({ ...vc, mag: parseFloat(e.target.value) || 0 })
								}
								className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							/>
						</div>
						<div>
							<label className="block text-sm text-[var(--color-text-muted)] mb-1">
								Angle (°)
							</label>
							<input
								type="number"
								step="0.1"
								value={vc.angle}
								onChange={(e) =>
									setVc({ ...vc, angle: parseFloat(e.target.value) || 0 })
								}
								className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							/>
						</div>
						<div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
							<p className="font-mono text-sm text-[var(--color-text)]">
								V_c = {vc.mag}∠{vc.angle}°
							</p>
						</div>
					</div>
				</div>

				<div className="space-y-4">
					<h4 className="text-lg font-semibold text-[var(--color-text-muted)]">
						Sequence Components
					</h4>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="bg-gradient-to-br from-gray-500/10 to-gray-600/10 border border-gray-500/30 rounded-lg p-4">
							<p className="text-gray-400 text-sm font-semibold mb-2">
								Zero-Sequence (V_a0)
							</p>
							<p className="mb-1 font-mono text-xl text-[var(--color-text)]">
								{v0.mag.toFixed(2)}∠{v0.angle.toFixed(2)}°
							</p>
							<p className="text-xs text-[var(--color-text-muted)]">
								{v0Rect.x.toFixed(2)} + j{v0Rect.y.toFixed(2)}
							</p>
						</div>

						<div className="bg-gradient-to-br from-green-500/10 to-pink-600/10 border border-green-500/30 rounded-lg p-4">
							<p className="text-green-400 text-sm font-semibold mb-2">
								Positive-Sequence (V_a1)
							</p>
							<p className="mb-1 font-mono text-xl text-[var(--color-text)]">
								{v1.mag.toFixed(2)}∠{v1.angle.toFixed(2)}°
							</p>
							<p className="text-xs text-[var(--color-text-muted)]">
								{v1Rect.x.toFixed(2)} + j{v1Rect.y.toFixed(2)}
							</p>
						</div>

						<div className="bg-gradient-to-br from-red-500/10 to-orange-600/10 border border-red-500/30 rounded-lg p-4">
							<p className="text-red-400 text-sm font-semibold mb-2">
								Negative-Sequence (V_a2)
							</p>
							<p className="mb-1 font-mono text-xl text-[var(--color-text)]">
								{v2.mag.toFixed(2)}∠{v2.angle.toFixed(2)}°
							</p>
							<p className="text-xs text-[var(--color-text-muted)]">
								{v2Rect.x.toFixed(2)} + j{v2Rect.y.toFixed(2)}
							</p>
						</div>
					</div>
				</div>

				<div className="mt-6">
					<button
						onClick={() => setShowWork(!showWork)}
						className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-[var(--color-text)] transition-all hover:bg-[var(--color-surface)]"
					>
						{showWork ? "Hide" : "Show"} Step-by-Step Work
					</button>

					{showWork && (
						<div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
							<h4 className="mb-3 font-semibold text-[var(--color-text-muted)]">
								Step-by-Step Analysis
							</h4>
							<div className="space-y-1 font-mono text-sm text-[var(--color-text-muted)]">
								{getSteps().map((step, i) => (
									<p key={i} className={step === "" ? "h-2" : ""}>
										{step}
									</p>
								))}
							</div>
						</div>
					)}
				</div>
			</FrameSection>

			<FrameSection title="Matrix Transformation">
				<div className="space-y-4">
					<div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
						<h4 className="mb-3 font-semibold text-[var(--color-text-muted)]">
							Phase to Sequence (Analytical Method)
						</h4>
						<div className="overflow-x-auto">
							<div className="space-y-2 font-mono text-sm text-[var(--color-text)]">
								<p>[V_a0] [1 1 1 ] [V_a]</p>
								<p>[V_a1] = (1/3) [1 a a²] [V_b]</p>
								<p>[V_a2] [1 a² a ] [V_c]</p>
							</div>
						</div>
						<p className="mt-3 text-xs text-[var(--color-text-muted)]">
							where a = 1∠120° = e^(j2π/3) and a² = 1∠240° = 1∠-120°
						</p>
					</div>

					<div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
						<h4 className="mb-3 font-semibold text-[var(--color-text-muted)]">
							Sequence to Phase (Inverse Transformation)
						</h4>
						<div className="overflow-x-auto">
							<div className="space-y-2 font-mono text-sm text-[var(--color-text)]">
								<p>[V_a] [1 1 1 ] [V_a0]</p>
								<p>[V_b] = [1 a² a ] [V_a1]</p>
								<p>[V_c] [1 a a²] [V_a2]</p>
							</div>
						</div>
					</div>

					<div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
						<h4 className="mb-3 font-semibold text-[var(--color-text-muted)]">
							Operator Properties
						</h4>
						<div className="grid grid-cols-1 gap-3 font-mono text-sm text-[var(--color-text)] md:grid-cols-2">
							<div className="space-y-1">
								<p>a = 1∠120° = -0.5 + j0.866</p>
								<p>a² = 1∠-120° = -0.5 - j0.866</p>
								<p>a³ = 1∠360° = 1</p>
							</div>
							<div className="space-y-1">
								<p>1 + a + a² = 0</p>
								<p>a × a = a²</p>
								<p>a² × a = a³ = 1</p>
							</div>
						</div>
					</div>
				</div>
			</FrameSection>

			<FrameSection title="Sequence Components for Other Phases">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
						<h4 className="mb-2 font-semibold text-[var(--color-text-muted)]">
							Phase B Components
						</h4>
						<div className="space-y-1 font-mono text-sm text-[var(--color-text)]">
							<p>V_b0 = V_a0</p>
							<p>V_b1 = a² × V_a1</p>
							<p>V_b2 = a × V_a2</p>
						</div>
					</div>

					<div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
						<h4 className="mb-2 font-semibold text-[var(--color-text-muted)]">
							Phase C Components
						</h4>
						<div className="space-y-1 font-mono text-sm text-[var(--color-text)]">
							<p>V_c0 = V_a0</p>
							<p>V_c1 = a × V_a1</p>
							<p>V_c2 = a² × V_a2</p>
						</div>
					</div>
				</div>

				<div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
					<p className="text-sm text-[var(--color-text-muted)]">
						<strong className="text-[var(--color-text)]">Note:</strong> All
						three phases have the same zero-sequence component. The positive and
						negative sequence components rotate according to the operator 'a'.
					</p>
				</div>
			</FrameSection>

			<FrameSection title="Example: Unbalanced System">
				<div className="space-y-2 text-[var(--color-text-muted)]">
					<p>
						Given: V_a = 100∠0° V, V_b = 100∠-110° V, V_c = 100∠125° V
						(unbalanced angles)
					</p>
					<p className="mt-3 font-semibold text-[var(--color-text)]">
						Solution:
					</p>
					<p className="pl-4">
						• Zero-sequence: V_a0 = (1/3)(V_a + V_b + V_c) ≈ 3.92∠161.6° V
					</p>
					<p className="pl-4">
						• Positive-sequence: V_a1 = (1/3)(V_a + aV_b + a²V_c) ≈ 94.73∠-1.3°
						V
					</p>
					<p className="pl-4">
						• Negative-sequence: V_a2 = (1/3)(V_a + a²V_b + aV_c) ≈ 8.88∠-137.5°
						V
					</p>
					<p className="mt-3 text-sm text-[var(--color-text-muted)]">
						This shows the unbalanced system has both positive and negative
						sequence components, plus a small zero-sequence due to angle
						imbalance.
					</p>
				</div>
			</FrameSection>
		</div>
	);
}

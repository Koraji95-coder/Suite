import { TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FrameSection } from "../../apps/ui/PageFrame";

type PlotType =
	| "sine"
	| "square"
	| "sawtooth"
	| "rc-charge"
	| "rl-response"
	| "bode";

export function PlotGenerator() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [plotType, setPlotType] = useState<PlotType>("sine");
	const [frequency, setFrequency] = useState(1);
	const [amplitude, setAmplitude] = useState(1);
	const [timeConstant, setTimeConstant] = useState(1);
	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";

	const drawPlot = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;

		ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
		ctx.fillRect(0, 0, width, height);

		ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, height / 2);
		ctx.lineTo(width, height / 2);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(40, 0);
		ctx.lineTo(40, height);
		ctx.stroke();

		ctx.fillStyle = "rgba(0, 255, 255, 0.6)";
		ctx.font = "12px monospace";
		ctx.fillText("0", 5, height / 2 - 5);
		ctx.fillText(`${amplitude}`, 5, height / 4);
		ctx.fillText(`${-amplitude}`, 5, (3 * height) / 4);

		ctx.strokeStyle = "rgba(0, 255, 255, 1)";
		ctx.lineWidth = 2;
		ctx.beginPath();

		const points = width - 50;
		const timeScale = 4;

		for (let i = 0; i < points; i++) {
			const t = (i / points) * timeScale;
			let y = 0;

			switch (plotType) {
				case "sine":
					y = amplitude * Math.sin(2 * Math.PI * frequency * t);
					break;
				case "square":
					y = amplitude * Math.sign(Math.sin(2 * Math.PI * frequency * t));
					break;
				case "sawtooth":
					y = amplitude * (2 * ((frequency * t) % 1) - 1);
					break;
				case "rc-charge":
					y = amplitude * (1 - Math.exp(-t / timeConstant));
					break;
				case "rl-response":
					y = amplitude * Math.exp(-t / timeConstant);
					break;
				case "bode": {
					const omega = Math.pow(10, t - 2);
					const H = 1 / Math.sqrt(1 + omega * omega);
					y = amplitude * H;
					break;
				}
			}

			const x = 50 + i;
			const canvasY = height / 2 - (y * height) / (3 * amplitude);

			if (i === 0) {
				ctx.moveTo(x, canvasY);
			} else {
				ctx.lineTo(x, canvasY);
			}
		}

		ctx.stroke();

		ctx.fillStyle = "rgba(0, 255, 255, 0.8)";
		ctx.font = "14px monospace";
		const labels = {
			sine: `Sine Wave: f = ${frequency} Hz, A = ${amplitude}`,
			square: `Square Wave: f = ${frequency} Hz, A = ${amplitude}`,
			sawtooth: `Sawtooth Wave: f = ${frequency} Hz, A = ${amplitude}`,
			"rc-charge": `RC Charging: τ = ${timeConstant}s, A = ${amplitude}`,
			"rl-response": `RL Response: τ = ${timeConstant}s, A = ${amplitude}`,
			bode: `Bode Plot: Magnitude Response`,
		};
		ctx.fillText(labels[plotType], 60, 30);
	}, [plotType, frequency, amplitude, timeConstant]);

	useEffect(() => {
		drawPlot();
	}, [drawPlot]);

	return (
		<div className="space-y-6">
			<div className="flex items-center space-x-3">
				<TrendingUp className="h-8 w-8 [color:var(--primary)]" />
				<h2 className="text-3xl font-bold [color:var(--text)]">
					Plot Diagrams
				</h2>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2">
					<FrameSection>
						<canvas
							ref={canvasRef}
							width={800}
							height={400}
							className="w-full rounded-lg border [border-color:var(--border)]"
						/>
					</FrameSection>
				</div>

				<div className="space-y-4">
					<FrameSection title="Plot Type">
						<select
							value={plotType}
							onChange={(e) => setPlotType(e.target.value as PlotType)}
							className={inputClass}
						>
							<option value="sine">Sine Wave</option>
							<option value="square">Square Wave</option>
							<option value="sawtooth">Sawtooth Wave</option>
							<option value="rc-charge">RC Charging</option>
							<option value="rl-response">RL Response</option>
							<option value="bode">Bode Plot</option>
						</select>
					</FrameSection>

					{(plotType === "sine" ||
						plotType === "square" ||
						plotType === "sawtooth") && (
						<FrameSection title={`Frequency (Hz): ${frequency}`}>
							<input
								type="range"
								min="0.1"
								max="5"
								step="0.1"
								value={frequency}
								onChange={(e) => setFrequency(parseFloat(e.target.value))}
								className="w-full"
							/>
						</FrameSection>
					)}

					{(plotType === "rc-charge" || plotType === "rl-response") && (
						<FrameSection title={`Time Constant (s): ${timeConstant}`}>
							<input
								type="range"
								min="0.1"
								max="3"
								step="0.1"
								value={timeConstant}
								onChange={(e) => setTimeConstant(parseFloat(e.target.value))}
								className="w-full"
							/>
						</FrameSection>
					)}

					<FrameSection title={`Amplitude: ${amplitude}`}>
						<input
							type="range"
							min="0.1"
							max="2"
							step="0.1"
							value={amplitude}
							onChange={(e) => setAmplitude(parseFloat(e.target.value))}
							className="w-full"
						/>
					</FrameSection>
				</div>
			</div>

			<FrameSection title="Plot Information">
				<div className="space-y-2 text-sm [color:var(--text-muted)]">
					{plotType === "sine" && (
						<p>
							Sinusoidal waveform commonly found in AC circuits and signal
							processing.
						</p>
					)}
					{plotType === "square" && (
						<p>
							Square wave with rapid transitions, useful for digital circuits
							and PWM.
						</p>
					)}
					{plotType === "sawtooth" && (
						<p>
							Linear ramp waveform used in oscilloscopes and signal generation.
						</p>
					)}
					{plotType === "rc-charge" && (
						<p>
							Exponential charging response of an RC circuit when a voltage is
							applied.
						</p>
					)}
					{plotType === "rl-response" && (
						<p>
							Exponential decay of current in an RL circuit after voltage is
							removed.
						</p>
					)}
					{plotType === "bode" && (
						<p>
							Frequency response magnitude plot showing system gain vs
							frequency.
						</p>
					)}
				</div>
			</FrameSection>
		</div>
	);
}

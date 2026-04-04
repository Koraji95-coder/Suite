import { CircuitBoard, Save, Shuffle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Section } from "@/components/system/PageFrame";
import { useToast } from "@/components/notification-system/ToastProvider";
import { logger } from "@/lib/errorLogger";
import { secureRandom, secureRandomInt } from "@/lib/secureRandom";
import { supabase } from "@/supabase/client";
import type { Database, Json } from "@/supabase/database";
import styles from "./CircuitGenerator.module.css";

interface Component {
	type: string;
	value: string;
	x: number;
	y: number;
	label: string;
}

export function CircuitGenerator() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [components, setComponents] = useState<Component[]>([]);
	const [circuitName, setCircuitName] = useState("");
	const [isSavingCircuit, setIsSavingCircuit] = useState(false);
	const { showToast } = useToast();
	const auth = useAuth();

	const componentTypes = [
		{ type: "resistor", symbol: "R", values: ["1kΩ", "10kΩ", "100kΩ", "1MΩ"] },
		{
			type: "capacitor",
			symbol: "C",
			values: ["1µF", "10µF", "100µF", "1000µF"],
		},
		{ type: "inductor", symbol: "L", values: ["1mH", "10mH", "100mH", "1H"] },
		{ type: "voltage", symbol: "V", values: ["5V", "9V", "12V", "24V"] },
	];

	const drawCircuit = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
		ctx.lineWidth = 2;

		components.forEach((comp) => {
			ctx.fillStyle = "rgba(0, 255, 255, 0.9)";
			ctx.font = "bold 14px monospace";
			ctx.fillText(comp.label, comp.x - 15, comp.y - 25);

			ctx.beginPath();
			if (comp.type === "resistor") {
				ctx.rect(comp.x - 15, comp.y - 10, 30, 20);
			} else if (comp.type === "capacitor") {
				ctx.moveTo(comp.x - 10, comp.y - 10);
				ctx.lineTo(comp.x - 10, comp.y + 10);
				ctx.moveTo(comp.x + 10, comp.y - 10);
				ctx.lineTo(comp.x + 10, comp.y + 10);
			} else if (comp.type === "inductor") {
				ctx.arc(comp.x - 10, comp.y, 5, 0, Math.PI, false);
				ctx.arc(comp.x, comp.y, 5, 0, Math.PI, false);
				ctx.arc(comp.x + 10, comp.y, 5, 0, Math.PI, false);
			} else if (comp.type === "voltage") {
				ctx.arc(comp.x, comp.y, 12, 0, Math.PI * 2);
				ctx.moveTo(comp.x, comp.y - 6);
				ctx.lineTo(comp.x, comp.y + 6);
				ctx.moveTo(comp.x - 4, comp.y);
				ctx.lineTo(comp.x + 4, comp.y);
			}
			ctx.stroke();

			ctx.fillStyle = "rgba(0, 255, 255, 0.7)";
			ctx.font = "12px monospace";
			ctx.fillText(comp.value, comp.x - 15, comp.y + 25);
		});

		if (components.length > 1) {
			ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
			ctx.lineWidth = 1;
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			const first = components[0];
			ctx.moveTo(first.x, first.y + 20);
			for (let i = 1; i < components.length; i++) {
				ctx.lineTo(components[i].x, components[i].y + 20);
			}
			const last = components[components.length - 1];
			ctx.moveTo(last.x, last.y + 20);
			ctx.lineTo(last.x, 350);
			ctx.lineTo(components[0].x, 350);
			ctx.lineTo(components[0].x, components[0].y + 20);
			ctx.stroke();
			ctx.setLineDash([]);
		}
	}, [components]);

	useEffect(() => {
		drawCircuit();
	}, [drawCircuit]);

	const generateRandomCircuit = () => {
		const numComponents = secureRandomInt(3, 6);
		const newComponents: Component[] = [];

		newComponents.push({
			type: "voltage",
			value: "12V",
			x: 50,
			y: 200,
			label: "V1",
		});

		for (let i = 0; i < numComponents - 1; i++) {
			const compType = componentTypes[secureRandomInt(0, 2)];
			const value =
				compType.values[secureRandomInt(0, compType.values.length - 1)];

			newComponents.push({
				type: compType.type,
				value: value,
				x: 150 + i * 120,
				y: 100 + (i % 2) * 100,
				label: `${compType.symbol}${i + 1}`,
			});
		}

		setComponents(newComponents);
	};

	const saveCircuit = async () => {
		if (!circuitName.trim()) {
			showToast("warning", "Please enter a circuit name.");
			return;
		}

		setIsSavingCircuit(true);
		try {
			const circuitData = { components } as unknown as Json;
			const payload: Database["public"]["Tables"]["saved_circuits"]["Insert"] =
				{
					name: circuitName,
					circuit_data: circuitData,
					user_id: auth.user?.id || "",
				};

			const { error } = await supabase.from("saved_circuits").insert(payload);

			if (error) {
				logger.error("CircuitGenerator", "Failed to save circuit", {
					error: error.message,
				});
				showToast(
					"error",
					`Error saving circuit: ${error.message || "Unknown error"}`,
				);
			} else {
				logger.info("CircuitGenerator", "Circuit saved successfully", {
					circuitName,
				});
				showToast("success", "Circuit saved successfully.");
				setCircuitName("");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error(
				"CircuitGenerator",
				"Unexpected error saving circuit",
				{ error: message },
				err as Error,
			);
			showToast("error", `Error saving circuit: ${message}`);
		} finally {
			setIsSavingCircuit(false);
		}
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<CircuitBoard className={styles.headerIcon} />
				<h2 className={styles.title}>Circuit Generator</h2>
			</div>

			<Section
				title="Generated Circuit"
				actions={
					<button
						onClick={generateRandomCircuit}
						className={styles.primaryAction}
					>
						<Shuffle className={styles.actionIcon} />
						<span>Generate Random Circuit</span>
					</button>
				}
			>
				<canvas
					ref={canvasRef}
					width={800}
					height={400}
					className={styles.canvas}
				/>

				{components.length > 0 && (
					<div className={styles.generatedContent}>
						<div className={styles.componentsPanel}>
							<h4 className={styles.componentsTitle}>Components:</h4>
							<div className={styles.componentGrid}>
								{components.map((comp, index) => (
									<div key={index} className={styles.componentItem}>
										<div className={styles.componentLabel}>{comp.label}</div>
										<div className={styles.componentValue}>{comp.value}</div>
									</div>
								))}
							</div>
						</div>

						<div className={styles.saveRow}>
							<input
								id="circuit-generator-name"
								name="circuit_name"
								aria-label="Circuit name"
								type="text"
								value={circuitName}
								onChange={(e) => setCircuitName(e.target.value)}
								placeholder="Enter circuit name..."
								className={styles.circuitNameInput}
							/>
							<button
								onClick={saveCircuit}
								disabled={isSavingCircuit}
								className={styles.primaryAction}
							>
								<Save className={styles.actionIcon} />
								<span>{isSavingCircuit ? "Saving..." : "Save Circuit"}</span>
							</button>
						</div>
					</div>
				)}
			</Section>

			<Section title="About Circuit Generator">
				<p className={styles.aboutText}>
					Click "Generate Random Circuit" to create a random circuit with
					various components. Each circuit includes a voltage source and random
					combinations of resistors, capacitors, and inductors. Save your
					favorite circuits to the database for future reference.
				</p>
			</Section>
		</div>
	);
}

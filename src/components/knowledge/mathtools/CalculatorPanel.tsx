import { Save, Zap } from "lucide-react";
import { useId, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Section } from "@/components/system/PageFrame";
import { useToast } from "@/components/notification-system/ToastProvider";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import styles from "./CalculatorPanel.module.css";

type CalculationType =
	| "ohms-law"
	| "power"
	| "reactance"
	| "resonance"
	| "time-constant"
	| "impedance";

interface CalculationResult {
	label: string;
	value: string;
	unit: string;
}

export function CalculatorPanel() {
	const formFieldPrefix = useId().replace(/:/g, "");
	const [calcType, setCalcType] = useState<CalculationType>("ohms-law");
	const [inputs, setInputs] = useState<Record<string, string>>({});
	const [results, setResults] = useState<CalculationResult[]>([]);
	const [notes, setNotes] = useState("");
	const [isSavingCalculation, setIsSavingCalculation] = useState(false);
	const { showToast } = useToast();
	const auth = useAuth();

	const calculations = {
		"ohms-law": {
			name: "Ohm's Law",
			fields: [
				{ id: "voltage", label: "Voltage (V)", unit: "V" },
				{ id: "current", label: "Current (I)", unit: "A" },
				{ id: "resistance", label: "Resistance (R)", unit: "Ω" },
			],
		},
		power: {
			name: "Power Calculations",
			fields: [
				{ id: "voltage", label: "Voltage (V)", unit: "V" },
				{ id: "current", label: "Current (I)", unit: "A" },
				{ id: "resistance", label: "Resistance (R)", unit: "Ω" },
			],
		},
		reactance: {
			name: "Reactance",
			fields: [
				{ id: "frequency", label: "Frequency (f)", unit: "Hz" },
				{ id: "capacitance", label: "Capacitance (C)", unit: "F" },
				{ id: "inductance", label: "Inductance (L)", unit: "H" },
			],
		},
		resonance: {
			name: "Resonant Frequency",
			fields: [
				{ id: "inductance", label: "Inductance (L)", unit: "H" },
				{ id: "capacitance", label: "Capacitance (C)", unit: "F" },
			],
		},
		"time-constant": {
			name: "Time Constant",
			fields: [
				{ id: "resistance", label: "Resistance (R)", unit: "Ω" },
				{ id: "capacitance", label: "Capacitance (C)", unit: "F" },
				{ id: "inductance", label: "Inductance (L)", unit: "H" },
			],
		},
		impedance: {
			name: "Impedance",
			fields: [
				{ id: "resistance", label: "Resistance (R)", unit: "Ω" },
				{ id: "reactance", label: "Reactance (X)", unit: "Ω" },
			],
		},
	};

	const calculate = () => {
		const newResults: CalculationResult[] = [];
		const inputValues: Record<string, number> = {};

		Object.entries(inputs).forEach(([key, value]) => {
			const num = parseFloat(value);
			if (!isNaN(num)) {
				inputValues[key] = num;
			}
		});

		switch (calcType) {
			case "ohms-law": {
				const { voltage, current, resistance } = inputValues;
				if (voltage && current) {
					newResults.push({
						label: "Resistance",
						value: (voltage / current).toFixed(4),
						unit: "Ω",
					});
				}
				if (voltage && resistance) {
					newResults.push({
						label: "Current",
						value: (voltage / resistance).toFixed(4),
						unit: "A",
					});
				}
				if (current && resistance) {
					newResults.push({
						label: "Voltage",
						value: (current * resistance).toFixed(4),
						unit: "V",
					});
				}
				break;
			}
			case "power": {
				const { voltage, current, resistance } = inputValues;
				if (voltage && current) {
					newResults.push({
						label: "Power (V×I)",
						value: (voltage * current).toFixed(4),
						unit: "W",
					});
				}
				if (current && resistance) {
					newResults.push({
						label: "Power (I²R)",
						value: (current * current * resistance).toFixed(4),
						unit: "W",
					});
				}
				if (voltage && resistance) {
					newResults.push({
						label: "Power (V²/R)",
						value: ((voltage * voltage) / resistance).toFixed(4),
						unit: "W",
					});
				}
				break;
			}
			case "reactance": {
				const { frequency, capacitance, inductance } = inputValues;
				if (frequency && capacitance) {
					const xc = 1 / (2 * Math.PI * frequency * capacitance);
					newResults.push({
						label: "Capacitive Reactance",
						value: xc.toFixed(4),
						unit: "Ω",
					});
				}
				if (frequency && inductance) {
					const xl = 2 * Math.PI * frequency * inductance;
					newResults.push({
						label: "Inductive Reactance",
						value: xl.toFixed(4),
						unit: "Ω",
					});
				}
				break;
			}
			case "resonance": {
				const { inductance, capacitance } = inputValues;
				if (inductance && capacitance) {
					const f = 1 / (2 * Math.PI * Math.sqrt(inductance * capacitance));
					newResults.push({
						label: "Resonant Frequency",
						value: f.toFixed(4),
						unit: "Hz",
					});
				}
				break;
			}
			case "time-constant": {
				const { resistance, capacitance, inductance } = inputValues;
				if (resistance && capacitance) {
					const tau = resistance * capacitance;
					newResults.push({
						label: "RC Time Constant",
						value: tau.toFixed(6),
						unit: "s",
					});
				}
				if (inductance && resistance) {
					const tau = inductance / resistance;
					newResults.push({
						label: "RL Time Constant",
						value: tau.toFixed(6),
						unit: "s",
					});
				}
				break;
			}
			case "impedance": {
				const { resistance, reactance } = inputValues;
				if (resistance && reactance) {
					const z = Math.sqrt(resistance * resistance + reactance * reactance);
					const phase = (Math.atan(reactance / resistance) * 180) / Math.PI;
					newResults.push({
						label: "Impedance Magnitude",
						value: z.toFixed(4),
						unit: "Ω",
					});
					newResults.push({
						label: "Phase Angle",
						value: phase.toFixed(2),
						unit: "°",
					});
				}
				break;
			}
		}

		setResults(newResults);
	};

	const saveCalculation = async () => {
		const inputValues: Record<string, number> = {};
		const resultValues: Record<string, number> = {};

		Object.entries(inputs).forEach(([key, value]) => {
			const num = parseFloat(value);
			if (!isNaN(num)) {
				inputValues[key] = num;
			}
		});

		results.forEach((result) => {
			resultValues[result.label] = parseFloat(result.value);
		});

		setIsSavingCalculation(true);
		try {
			const payload: Database["public"]["Tables"]["saved_calculations"]["Insert"] =
				{
					calculation_type: calcType,
					inputs: inputValues,
					results: resultValues,
					notes,
					user_id: auth.user?.id || "",
				};

			const { error } = await supabase
				.from("saved_calculations")
				.insert(payload);

			if (error) {
				logger.error("CalculatorPanel", "Failed to save calculation", {
					error: error.message,
				});
				showToast(
					"error",
					`Error saving calculation: ${error.message || "Unknown error"}`,
				);
			} else {
				logger.info("CalculatorPanel", "Calculation saved successfully", {
					calcType,
				});
				showToast("success", "Calculation saved successfully.");
				setNotes("");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error(
				"CalculatorPanel",
				"Unexpected error saving calculation",
				{ error: message },
				err as Error,
			);
			showToast("error", `Error saving calculation: ${message}`);
		} finally {
			setIsSavingCalculation(false);
		}
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerBadge}>
					<Zap
						className={styles.headerIcon}
						style={{ animationDuration: "1.5s" }}
					/>
				</div>
				<div className={styles.headerCopy}>
					<h2 className={styles.title}>Electrical Calculations</h2>
					<p className={styles.subtitle}>
						Power, impedance, and circuit analysis
					</p>
				</div>
			</div>

			<Section title="Calculation Type">
				<label className={styles.fieldLabel} htmlFor={`${formFieldPrefix}-calc-type`}>
					Calculator type
				</label>
				<select
					id={`${formFieldPrefix}-calc-type`}
					name="calculator_type"
					value={calcType}
					onChange={(e) => {
						setCalcType(e.target.value as CalculationType);
						setInputs({});
						setResults([]);
					}}
					className={styles.inputControl}
				>
					{Object.entries(calculations).map(([key, calc]) => (
						<option key={key} value={key}>
							{calc.name}
						</option>
					))}
				</select>
			</Section>

			<Section title="Input Values">
				<div className={styles.inputGrid}>
					{calculations[calcType].fields.map((field) => {
						const fieldId = `${formFieldPrefix}-${calcType}-${field.id}`;
						return (
						<div key={field.id}>
							<label className={styles.fieldLabel} htmlFor={fieldId}>
								{field.label}
							</label>
							<input
								id={fieldId}
								name={`calculator_${field.id}`}
								type="number"
								step="any"
								value={inputs[field.id] || ""}
								onChange={(e) =>
									setInputs({ ...inputs, [field.id]: e.target.value })
								}
								className={styles.inputControl}
								placeholder={`Enter ${field.label.toLowerCase()}`}
							/>
						</div>
						);
					})}
				</div>

				<button onClick={calculate} className={styles.primaryButton}>
					Calculate
				</button>
			</Section>

			{results.length > 0 && (
				<Section title="Results">
					<div className={styles.resultList}>
						{results.map((result, index) => (
							<div key={index} className={styles.resultRow}>
								<span className={styles.resultLabel}>{result.label}:</span>
								<span className={styles.resultValue}>
									{result.value} {result.unit}
								</span>
							</div>
						))}
					</div>

					<div className={styles.notesBlock}>
						<label
							className={styles.fieldLabel}
							htmlFor={`${formFieldPrefix}-notes`}
						>
							Notes (Optional)
						</label>
						<textarea
							id={`${formFieldPrefix}-notes`}
							name="calculator_notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							className={styles.notesInput}
							placeholder="Add notes about this calculation..."
						/>
					</div>

					<button
						onClick={saveCalculation}
						disabled={isSavingCalculation}
						className={styles.primaryButtonWithIcon}
					>
						<Save className={styles.buttonIcon} />
						<span>
							{isSavingCalculation ? "Saving..." : "Save Calculation"}
						</span>
					</button>
				</Section>
			)}
		</div>
	);
}

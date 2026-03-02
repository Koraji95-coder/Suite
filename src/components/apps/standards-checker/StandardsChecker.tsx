import {
	AlertTriangle,
	ArrowRight,
	CheckCircle,
	ClipboardCheck,
	Play,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { GlassPanel } from "../ui/GlassPanel";
import { QAQCChecker } from "./QAQCPanel";

interface Standard {
	id: string;
	name: string;
	code: string;
	category: "NEC" | "IEEE" | "IEC";
	description: string;
}

interface CheckResult {
	standardId: string;
	status: "pass" | "fail" | "warning";
	message: string;
}

const sampleStandards: Standard[] = [
	{
		id: "nec-210",
		name: "NEC 210 - Branch Circuits",
		code: "NEC 210",
		category: "NEC",
		description:
			"Branch circuit ratings, outlet provisions, and GFCI requirements.",
	},
	{
		id: "nec-220",
		name: "NEC 220 - Branch-Circuit, Feeder, and Service Load Calculations",
		code: "NEC 220",
		category: "NEC",
		description:
			"Load calculation methods for branch circuits, feeders, and services.",
	},
	{
		id: "nec-250",
		name: "NEC 250 - Grounding and Bonding",
		code: "NEC 250",
		category: "NEC",
		description:
			"Grounding electrode systems, bonding, and equipment grounding conductors.",
	},
	{
		id: "ieee-80",
		name: "IEEE 80 - Guide for Safety in AC Substation Grounding",
		code: "IEEE 80",
		category: "IEEE",
		description:
			"Step and touch voltage limits, ground grid design parameters.",
	},
	{
		id: "ieee-141",
		name: "IEEE 141 - Recommended Practice for Electric Power Distribution",
		code: "IEEE 141",
		category: "IEEE",
		description:
			"Industrial plant power distribution design and analysis (Red Book).",
	},
	{
		id: "ieee-1584",
		name: "IEEE 1584 - Guide for Arc-Flash Hazard Calculations",
		code: "IEEE 1584",
		category: "IEEE",
		description:
			"Arc-flash incident energy calculations and PPE category selection.",
	},
	{
		id: "iec-60909",
		name: "IEC 60909 - Short-Circuit Currents in Three-Phase AC Systems",
		code: "IEC 60909",
		category: "IEC",
		description:
			"Calculation of short-circuit currents using symmetrical components.",
	},
	{
		id: "iec-61439",
		name: "IEC 61439 - Low-Voltage Switchgear Assemblies",
		code: "IEC 61439",
		category: "IEC",
		description:
			"Design verification and routine verification of LV switchgear assemblies.",
	},
	{
		id: "iec-60364",
		name: "IEC 60364 - Low-Voltage Electrical Installations",
		code: "IEC 60364",
		category: "IEC",
		description:
			"Fundamental principles, protection for safety, and selection of equipment.",
	},
];

const categories = ["NEC", "IEEE", "IEC"] as const;

const statusToneClasses: Record<
	CheckResult["status"],
	{
		badge: string;
		text: string;
		icon: string;
	}
> = {
	pass: {
		badge:
			"[background:color-mix(in_srgb,var(--success)_12%,transparent)] [border-color:color-mix(in_srgb,var(--success)_35%,transparent)]",
		text: "[color:var(--success)]",
		icon: "[color:var(--success)]",
	},
	warning: {
		badge:
			"[background:color-mix(in_srgb,var(--warning)_12%,transparent)] [border-color:color-mix(in_srgb,var(--warning)_35%,transparent)]",
		text: "[color:var(--warning)]",
		icon: "[color:var(--warning)]",
	},
	fail: {
		badge:
			"[background:color-mix(in_srgb,var(--danger)_12%,transparent)] [border-color:color-mix(in_srgb,var(--danger)_35%,transparent)]",
		text: "[color:var(--danger)]",
		icon: "[color:var(--danger)]",
	},
};

function StatusIcon({ status }: { status: CheckResult["status"] }) {
	if (status === "pass")
		return <CheckCircle className="h-4 w-4 [color:var(--success)]" />;
	if (status === "warning") {
		return <AlertTriangle className="h-4 w-4 [color:var(--warning)]" />;
	}
	return <XCircle className="h-4 w-4 [color:var(--danger)]" />;
}

function ModeTabs({
	mode,
	onModeChange,
}: {
	mode: "standards" | "qaqc";
	onModeChange: (mode: "standards" | "qaqc") => void;
}) {
	const baseTabClass =
		"rounded-lg border px-3 py-1.5 text-xs font-semibold transition";

	return (
		<div className="flex gap-2">
			<button
				type="button"
				onClick={() => onModeChange("standards")}
				className={`${baseTabClass} ${
					mode === "standards"
						? "[border-color:color-mix(in_srgb,var(--primary)_40%,transparent)] [background:color-mix(in_srgb,var(--primary)_16%,transparent)] [color:var(--text)]"
						: "[border-color:color-mix(in_srgb,var(--primary)_24%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_70%,transparent)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)]"
				}`}
			>
				Standards
			</button>
			<button
				type="button"
				onClick={() => onModeChange("qaqc")}
				className={`${baseTabClass} ${
					mode === "qaqc"
						? "[border-color:color-mix(in_srgb,var(--primary)_40%,transparent)] [background:color-mix(in_srgb,var(--primary)_16%,transparent)] [color:var(--text)]"
						: "[border-color:color-mix(in_srgb,var(--primary)_24%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_70%,transparent)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)]"
				}`}
			>
				QA/QC
			</button>
		</div>
	);
}

export function StandardsChecker() {
	const [mode, setMode] = useState<"standards" | "qaqc">("standards");
	const [activeCategory, setActiveCategory] = useState<string>("NEC");
	const [selectedStandards, setSelectedStandards] = useState<Set<string>>(
		new Set(),
	);
	const [results, setResults] = useState<CheckResult[]>([]);
	const [running, setRunning] = useState(false);

	const filteredStandards = sampleStandards.filter(
		(standard) => standard.category === activeCategory,
	);

	const toggleStandard = (id: string) => {
		setSelectedStandards((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const runChecks = () => {
		if (selectedStandards.size === 0) return;
		setRunning(true);
		setResults([]);

		setTimeout(() => {
			const nextResults: CheckResult[] = [];
			selectedStandards.forEach((id) => {
				const random = Math.random();
				let status: CheckResult["status"];
				let message: string;
				if (random < 0.5) {
					status = "pass";
					message = "All criteria met. Design compliant.";
				} else if (random < 0.8) {
					status = "warning";
					message = "Minor deviations detected. Review recommended.";
				} else {
					status = "fail";
					message = "Non-compliance found. Corrective action required.";
				}
				nextResults.push({ standardId: id, status, message });
			});
			setResults(nextResults);
			setRunning(false);
		}, 1500);
	};

	const getResultForStandard = (id: string) =>
		results.find((result) => result.standardId === id);

	const passCount = results.filter((result) => result.status === "pass").length;
	const warningCount = results.filter(
		(result) => result.status === "warning",
	).length;
	const failCount = results.filter((result) => result.status === "fail").length;

	if (mode === "qaqc") {
		return (
			<div className="space-y-3">
				<div className="px-6 pt-3">
					<ModeTabs mode={mode} onModeChange={setMode} />
				</div>
				<QAQCChecker />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
			<ModeTabs mode={mode} onModeChange={setMode} />

			<GlassPanel variant="toolbar" padded className="space-y-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-xl border [border-color:color-mix(in_srgb,var(--primary)_30%,transparent)] [background:linear-gradient(135deg,color-mix(in_srgb,var(--primary)_24%,transparent),color-mix(in_srgb,var(--primary)_10%,transparent))]">
							<ClipboardCheck className="h-6 w-6 [color:var(--primary)]" />
						</div>
						<div>
							<h1 className="text-2xl font-bold tracking-tight [color:var(--text)]">
								Standards Checker
							</h1>
							<p className="text-sm [color:var(--text-muted)]">
								Verify designs against NEC, IEEE, and IEC standards.
							</p>
						</div>
					</div>
					<Link
						to="/apps/qaqc"
						className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition [border-color:color-mix(in_srgb,var(--primary)_30%,transparent)] [background:color-mix(in_srgb,var(--primary)_14%,transparent)] [color:var(--primary)] hover:[background:color-mix(in_srgb,var(--primary)_20%,transparent)]"
					>
						Open QA/QC Checker
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				</div>

				<div className="inline-flex flex-wrap items-center gap-2 rounded-xl border p-1 [border-color:color-mix(in_srgb,var(--primary)_18%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_70%,transparent)]">
					{categories.map((category) => {
						const isActive = activeCategory === category;
						return (
							<button
								key={category}
								type="button"
								onClick={() => setActiveCategory(category)}
								className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
									isActive
										? "[background:color-mix(in_srgb,var(--primary)_22%,transparent)] [color:var(--primary)]"
										: "[color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)] hover:[color:var(--text)]"
								}`}
							>
								{category}
							</button>
						);
					})}
				</div>
			</GlassPanel>

			<GlassPanel padded className="space-y-4">
				<div className="text-xs font-semibold uppercase tracking-[0.16em] [color:var(--text-muted)]">
					{activeCategory} Standards
				</div>

				<div className="space-y-2">
					{filteredStandards.map((standard) => {
						const result = getResultForStandard(standard.id);
						const isSelected = selectedStandards.has(standard.id);
						return (
							<button
								key={standard.id}
								type="button"
								onClick={() => toggleStandard(standard.id)}
								className={`w-full rounded-xl border px-4 py-3 text-left transition ${
									isSelected
										? "[border-color:color-mix(in_srgb,var(--primary)_45%,transparent)] [background:color-mix(in_srgb,var(--primary)_14%,transparent)]"
										: "[border-color:color-mix(in_srgb,var(--border)_75%,transparent)] hover:[border-color:color-mix(in_srgb,var(--primary)_28%,transparent)] hover:[background:color-mix(in_srgb,var(--primary)_8%,transparent)]"
								}`}
							>
								<div className="flex items-start gap-3">
									<div
										className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
											isSelected
												? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_20%,transparent)]"
												: "[border-color:var(--text-muted)]"
										}`}
									>
										{isSelected && (
											<div className="h-2.5 w-2.5 rounded-sm [background:var(--primary)]" />
										)}
									</div>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-sm font-semibold [color:var(--text)]">
													{standard.name}
												</p>
												<p className="text-xs [color:var(--text-muted)]">
													{standard.code}
												</p>
											</div>
											{result && (
												<span
													className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusToneClasses[result.status].badge} ${statusToneClasses[result.status].text}`}
												>
													<StatusIcon status={result.status} />
													{result.status}
												</span>
											)}
										</div>
										<p className="text-xs leading-relaxed [color:var(--text-muted)]">
											{standard.description}
										</p>
										{result && (
											<p
												className={`text-xs italic ${statusToneClasses[result.status].text}`}
											>
												{result.message}
											</p>
										)}
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</GlassPanel>

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={runChecks}
					disabled={selectedStandards.size === 0 || running}
					className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 [background:linear-gradient(135deg,var(--primary),color-mix(in_srgb,var(--primary)_78%,var(--accent)))] [color:var(--primary-contrast)]"
				>
					<Play className="h-4 w-4" />
					{running ? "Running Checks..." : "Run Selected Checks"}
				</button>
				<span className="text-sm [color:var(--text-muted)]">
					{selectedStandards.size} standard
					{selectedStandards.size !== 1 ? "s" : ""} selected
				</span>
			</div>

			{results.length > 0 && (
				<GlassPanel padded className="space-y-3">
					<h2 className="text-sm font-semibold [color:var(--text)]">
						Results Summary
					</h2>
					<div className="flex flex-wrap items-center gap-4 text-sm">
						<div className="inline-flex items-center gap-2 [color:var(--text-muted)]">
							<CheckCircle className="h-4 w-4 [color:var(--success)]" />
							Pass: {passCount}
						</div>
						<div className="inline-flex items-center gap-2 [color:var(--text-muted)]">
							<AlertTriangle className="h-4 w-4 [color:var(--warning)]" />
							Warning: {warningCount}
						</div>
						<div className="inline-flex items-center gap-2 [color:var(--text-muted)]">
							<XCircle className="h-4 w-4 [color:var(--danger)]" />
							Fail: {failCount}
						</div>
					</div>
				</GlassPanel>
			)}
		</div>
	);
}

import { useState } from "react";
import { CalculatorPanel } from "@/components/knowledge/mathtools/CalculatorPanel";
import { CircuitGenerator } from "@/components/knowledge/mathtools/CircuitGenerator";
import { FormulaBank } from "@/components/knowledge/mathtools/FormulaBank";
import { MathReference } from "@/components/knowledge/mathtools/MathReference";
import { PlotGenerator } from "@/components/knowledge/mathtools/PlotGenerator";
import { SinusoidalCalculator } from "@/components/knowledge/mathtools/SinusoidalCalculator";
import { SymmetricalComponents } from "@/components/knowledge/mathtools/SymmetricalComponents";
import { ThreePhaseCalculator } from "@/components/knowledge/mathtools/ThreePhaseCalculator";
import { VectorCalculator } from "@/components/knowledge/mathtools/VectorCalculator";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

type ToolKey =
	| "vector"
	| "three-phase"
	| "calculator"
	| "sinusoidal"
	| "symmetrical"
	| "formulas"
	| "reference"
	| "plot"
	| "circuit";

const TOOL_OPTIONS: Array<{ key: ToolKey; label: string }> = [
	{ key: "vector", label: "Vector Calculator" },
	{ key: "three-phase", label: "Three-Phase Calculator" },
	{ key: "calculator", label: "Engineering Calculator" },
	{ key: "sinusoidal", label: "Sinusoidal Calculator" },
	{ key: "symmetrical", label: "Symmetrical Components" },
	{ key: "formulas", label: "Formula Bank" },
	{ key: "reference", label: "Math Reference" },
	{ key: "plot", label: "Plot Generator" },
	{ key: "circuit", label: "Circuit Generator" },
];

export default function MathToolsLibraryPage() {
	const [activeTool, setActiveTool] = useState<ToolKey>("vector");

	const renderTool = () => {
		switch (activeTool) {
			case "vector":
				return <VectorCalculator />;
			case "three-phase":
				return <ThreePhaseCalculator />;
			case "calculator":
				return <CalculatorPanel />;
			case "sinusoidal":
				return <SinusoidalCalculator />;
			case "symmetrical":
				return <SymmetricalComponents />;
			case "formulas":
				return <FormulaBank />;
			case "reference":
				return <MathReference />;
			case "plot":
				return <PlotGenerator />;
			case "circuit":
				return <CircuitGenerator />;
		}
	};

	return (
		<PageFrame
			title="Math Tools Library"
			subtitle="Legacy calculators and engineering utilities collected in one place."
		>
			<FrameSection title="Tools">
				<div className="mb-4 flex flex-wrap gap-2">
					{TOOL_OPTIONS.map((tool) => {
						const active = tool.key === activeTool;
						return (
							<button
								key={tool.key}
								type="button"
								onClick={() => setActiveTool(tool.key)}
								className={`rounded-xl border px-3 py-2 text-sm transition ${
									active
										? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_16%,var(--surface))] [color:var(--text)]"
										: "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:var(--surface-2)]"
								}`}
							>
								{tool.label}
							</button>
						);
					})}
				</div>
				{renderTool()}
			</FrameSection>
		</PageFrame>
	);
}

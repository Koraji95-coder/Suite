import { GroundGridGeneratorApp } from "@/components/apps/ground-grid/GroundGridGeneratorApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function GroundGridRoutePage() {
	return (
		<PageFrame
			title="Ground Grid Generator"
			subtitle="Capture AutoCAD coordinates and generate ground grid designs in one workspace."
		>
			<div
				className="rounded-2xl overflow-hidden"
				style={{
					minHeight: "clamp(720px, 82vh, 1200px)",
				}}
			>
				<GroundGridGeneratorApp />
			</div>
		</PageFrame>
	);
}

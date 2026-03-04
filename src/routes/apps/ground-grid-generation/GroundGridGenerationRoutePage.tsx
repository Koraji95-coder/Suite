import { GroundGridGeneratorApp } from "@/components/apps/ground-grid-generator/GroundGridGeneratorApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function GroundGridGenerationRoutePage() {
	return (
		<PageFrame
			title="Ground Grid Generation"
			description="Coordinates capture and interactive grid generation in one workspace."
			maxWidth="full"
		>
			<GroundGridGeneratorApp />
		</PageFrame>
	);
}

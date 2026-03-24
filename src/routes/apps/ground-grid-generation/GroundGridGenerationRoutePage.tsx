import { GroundGridGeneratorApp } from "@/components/apps/ground-grid-generator/GroundGridGeneratorApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function GroundGridGenerationRoutePage() {
	useRegisterPageHeader({
		title: "Ground Grid Generation",
		subtitle:
			"Coordinates capture and interactive grid generation in one workspace.",
	});

	return (
		<PageFrame maxWidth="full">
			<GroundGridGeneratorApp />
		</PageFrame>
	);
}

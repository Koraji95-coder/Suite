import { GroundGridGeneratorApp } from "@/features/ground-grid-generation/ui/GroundGridGeneratorApp";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";

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

import { StandardsChecker } from "@/components/apps/standards-checker/StandardsChecker";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function StandardsCheckerRoutePage() {
	return (
		<PageFrame maxWidth="full">
			<StandardsChecker />
		</PageFrame>
	);
}

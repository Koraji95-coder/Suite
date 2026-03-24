import { StandardsChecker } from "@/components/apps/standards-checker/StandardsChecker";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function StandardsCheckerRoutePage() {
	useRegisterPageHeader({
		title: "Standards Checker",
		subtitle: "Verify designs against NEC, IEEE, and IEC standards.",
	});

	return (
		<PageFrame maxWidth="full">
			<StandardsChecker />
		</PageFrame>
	);
}

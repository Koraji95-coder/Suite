import { useSearchParams } from "react-router-dom";
import { StandardsChecker } from "@/features/standards-checker/ui/StandardsChecker";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";

export default function StandardsCheckerRoutePage() {
	const [searchParams] = useSearchParams();
	const preferredProjectId = searchParams.get("project") || undefined;
	const preferredIssueSetId = searchParams.get("issueSet") || undefined;

	useRegisterPageHeader({
		title: "Standards Checker",
		subtitle: "Review package standards, blockers, and waivers before issue.",
	});

	return (
		<PageFrame maxWidth="full">
			<StandardsChecker
				preferredProjectId={preferredProjectId}
				preferredIssueSetId={preferredIssueSetId}
			/>
		</PageFrame>
	);
}

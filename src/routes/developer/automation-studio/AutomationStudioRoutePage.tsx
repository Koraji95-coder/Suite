import { useSearchParams } from "react-router-dom";
import { AutomationStudioApp } from "@/components/apps/automation-studio/AutomationStudioApp";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function AutomationStudioRoutePage() {
	const [searchParams] = useSearchParams();
	const preferredProjectId = searchParams.get("project") || undefined;
	const preferredIssueSetId = searchParams.get("issueSet") || undefined;
	const preferredRegisterSnapshotId =
		searchParams.get("registerSnapshot") || undefined;
	const preferredDrawingId = searchParams.get("drawing") || undefined;

	useRegisterPageHeader({
		title: "Automation Studio",
		subtitle:
			"Combined developer bench for markup intent, terminal routing, and package-scoped automation review.",
	});

	return (
		<AutomationStudioApp
			preferredProjectId={preferredProjectId}
			preferredIssueSetId={preferredIssueSetId}
			preferredRegisterSnapshotId={preferredRegisterSnapshotId}
			preferredDrawingId={preferredDrawingId}
		/>
	);
}

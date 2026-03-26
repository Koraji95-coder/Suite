import { useSearchParams } from "react-router-dom";
import { DrawingListManager } from "@/components/apps/drawing-list-manager/DrawingListManager";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function DrawingListManagerRoutePage() {
	const [searchParams] = useSearchParams();
	const preferredProjectId = searchParams.get("project") || undefined;
	const preferredIssueSetId = searchParams.get("issueSet") || undefined;

	useRegisterPageHeader({
		title: "Drawing List Manager",
		subtitle:
			"Project-wide title block scan, ACADE mapping preview, and Suite second-pass sync.",
	});

	return (
		<DrawingListManager
			preferredProjectId={preferredProjectId}
			preferredIssueSetId={preferredIssueSetId}
		/>
	);
}

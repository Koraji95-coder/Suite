import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import { ReviewWorkspace } from "@/features/review/ReviewWorkspace";

export default function ReviewRoutePage() {
	useRegisterPageHeader({
		title: "Review",
		subtitle:
			"Standards validation, readiness summaries, and issue-path review work.",
	});

	return (
		<PageFrame maxWidth="full">
			<ReviewWorkspace />
		</PageFrame>
	);
}

import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import { DraftWorkspace } from "@/features/draft/DraftWorkspace";

export default function DraftRoutePage() {
	useRegisterPageHeader({
		title: "Draft",
		subtitle:
			"Released drafting surfaces for drawing indexes, reusable assets, and customer-ready authoring support.",
	});

	return (
		<PageFrame maxWidth="full">
			<DraftWorkspace />
		</PageFrame>
	);
}

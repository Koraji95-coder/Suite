import { AutoDraftStudioApp } from "@/components/apps/autodraft-studio/AutoDraftStudioApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function AutoDraftStudioRoutePage() {
	return (
		<PageFrame maxWidth="full">
			<AutoDraftStudioApp />
		</PageFrame>
	);
}

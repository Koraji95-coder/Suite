import { BatchFindReplaceApp } from "@/components/apps/Batch_find_and_replace/BatchFindReplaceApp";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function BatchFindReplaceRoutePage() {
	useRegisterPageHeader({
		title: "Batch Find & Replace",
		subtitle:
			"Run drawing cleanup, active-drawing replacement, or file-based replacement from one shared surface.",
	});

	return <BatchFindReplaceApp />;
}

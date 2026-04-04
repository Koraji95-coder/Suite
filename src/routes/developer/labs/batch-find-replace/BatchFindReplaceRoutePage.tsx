import { BatchFindReplaceApp } from "@/features/batch-find-replace/ui/BatchFindReplaceApp";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";

export default function BatchFindReplaceRoutePage() {
	useRegisterPageHeader({
		title: "Batch Find & Replace",
		subtitle:
			"Run drawing cleanup, active-drawing replacement, or file-based replacement from one shared surface.",
	});

	return <BatchFindReplaceApp />;
}

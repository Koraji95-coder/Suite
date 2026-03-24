import { DrawingListManager } from "@/components/apps/drawing-list-manager/DrawingListManager";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function DrawingListManagerRoutePage() {
	useRegisterPageHeader({
		title: "Drawing List Manager",
		subtitle:
			"Project-wide title block scan, ACADE mapping preview, and Suite second-pass sync.",
	});

	return <DrawingListManager />;
}

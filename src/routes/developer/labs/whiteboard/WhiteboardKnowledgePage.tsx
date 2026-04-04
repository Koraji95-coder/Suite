import { PageFrame, Section } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import { FloatingWhiteboardButton } from "@/features/whiteboard/ui/whiteboardlibrary/FloatingWhiteboardButton";
import { WhiteboardLibrary } from "@/features/whiteboard/ui/whiteboardlibrary/WhiteboardLibrary";

export default function WhiteboardKnowledgePage() {
	useRegisterPageHeader({
		title: "Whiteboard",
		subtitle: "Sketch, save, and review whiteboard snapshots.",
	});

	return (
		<PageFrame maxWidth="xl">
			<Section title="Whiteboard Library">
				<WhiteboardLibrary filterByPanel="Whiteboard" />
			</Section>
			<FloatingWhiteboardButton panelContext="Whiteboard" />
		</PageFrame>
	);
}

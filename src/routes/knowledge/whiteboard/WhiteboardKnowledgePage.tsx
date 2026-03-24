import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { FloatingWhiteboardButton } from "@/components/apps/whiteboard/whiteboardlibrary/FloatingWhiteboardButton";
import { WhiteboardLibrary } from "@/components/apps/whiteboard/whiteboardlibrary/WhiteboardLibrary";

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

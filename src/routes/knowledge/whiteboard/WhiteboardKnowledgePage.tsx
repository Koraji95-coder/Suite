import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { FloatingWhiteboardButton } from "@/components/apps/whiteboard/whiteboardlibrary/FloatingWhiteboardButton";
import { WhiteboardLibrary } from "@/components/apps/whiteboard/whiteboardlibrary/WhiteboardLibrary";

export default function WhiteboardKnowledgePage() {
	return (
		<PageFrame
			title="Whiteboard"
			description="Sketch, save, and review whiteboard snapshots."
			maxWidth="xl"
		>
			<Section title="Whiteboard Library">
				<WhiteboardLibrary filterByPanel="Whiteboard" />
			</Section>
			<FloatingWhiteboardButton panelContext="Whiteboard" />
		</PageFrame>
	);
}

import { FloatingWhiteboardButton } from "@/components/apps/whiteboard/whiteboardlibrary/FloatingWhiteboardButton";
import { WhiteboardLibrary } from "@/components/apps/whiteboard/whiteboardlibrary/WhiteboardLibrary";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

export default function WhiteboardKnowledgePage() {
	return (
		<PageFrame
			title="Whiteboard"
			subtitle="Sketch, save, and review whiteboard snapshots."
		>
			<FrameSection title="Whiteboard Library">
				<WhiteboardLibrary filterByPanel="Whiteboard" />
			</FrameSection>
			<FloatingWhiteboardButton panelContext="Whiteboard" />
		</PageFrame>
	);
}

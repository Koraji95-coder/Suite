import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { KNOWLEDGE_SECTIONS } from "./modules/knowledgeSections";

export default function KnowledgeRoutePage() {
	return (
		<PageFrame
			title="Knowledge"
			subtitle="References, docs, and standards aligned to current workflows."
		>
			{KNOWLEDGE_SECTIONS.map((section) => (
				<FrameSection
					key={section.title}
					title={section.title}
					subtitle={section.description}
				>
					<ul
						className="list-disc pl-5 text-sm"
						style={{ color: "var(--white-dim)" }}
					>
						{section.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</FrameSection>
			))}
		</PageFrame>
	);
}

import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { Link } from "react-router-dom";
import { KNOWLEDGE_SECTIONS } from "./modules/knowledgeSections";

export default function KnowledgeRoutePage() {
	return (
		<PageFrame
			title="Knowledge"
			subtitle="References, docs, and standards aligned to current workflows."
		>
			<FrameSection title="Libraries" subtitle="Quick access to curated tool collections.">
				<div className="grid gap-3 md:grid-cols-2">
					<article className="grid gap-2 rounded-xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
						<h3 className="text-sm font-semibold [color:var(--text)]">Math Tools Library</h3>
						<p className="text-xs [color:var(--text-muted)]">
							Legacy engineering calculators and references in one route.
						</p>
						<Link
							to="/app/knowledge/math-tools"
							className="inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text)]"
						>
							Open Library
						</Link>
					</article>
					<article className="grid gap-2 rounded-xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
						<h3 className="text-sm font-semibold [color:var(--text)]">Whiteboard</h3>
						<p className="text-xs [color:var(--text-muted)]">
							Sketch, tag, and review saved whiteboard snapshots.
						</p>
						<Link
							to="/app/knowledge/whiteboard"
							className="inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text)]"
						>
							Open Whiteboard
						</Link>
					</article>
				</div>
			</FrameSection>

			{KNOWLEDGE_SECTIONS.map((section) => (
				<FrameSection
					key={section.title}
					title={section.title}
					subtitle={section.description}
				>
					<ul className="list-disc pl-5 text-sm [color:var(--text-muted)]">
						{section.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</FrameSection>
			))}
		</PageFrame>
	);
}

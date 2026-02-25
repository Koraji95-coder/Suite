import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

const MODULE_GROUPS = [
	{
		title: "Frontend Routes",
		items: ["Dashboard", "Projects", "Calendar", "Apps", "Agent", "Knowledge"],
	},
	{
		title: "Service Layer",
		items: ["Supabase client", "Agent service", "Coordinates backend service"],
	},
	{
		title: "Backend Integrations",
		items: [
			"Coordinates Flask API server",
			"AutoCAD COM bridge (Windows host)",
			"ZeroClaw agent gateway",
		],
	},
];

export default function ArchitectureMapRoutePage() {
	return (
		<PageFrame
			title="Architecture Map"
			subtitle="High-level module boundaries and integration contracts."
		>
			{MODULE_GROUPS.map((group) => (
				<FrameSection key={group.title} title={group.title}>
					<ul
						className="list-disc pl-5 text-sm"
						style={{ color: "var(--white-dim)" }}
					>
						{group.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</FrameSection>
			))}
		</PageFrame>
	);
}

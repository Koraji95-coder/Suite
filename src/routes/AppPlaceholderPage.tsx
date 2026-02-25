import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

interface AppPlaceholderPageProps {
	title: string;
	description: string;
}

export default function AppPlaceholderPage({
	title,
	description,
}: AppPlaceholderPageProps) {
	return (
		<PageFrame title={title} subtitle={description}>
			<FrameSection>
				<p className="text-sm" style={{ color: "var(--white-dim)" }}>
					More tools and workflows are being assembled for this section.
				</p>
			</FrameSection>
		</PageFrame>
	);
}

import { useParams } from "react-router-dom";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { ProjectManager } from "../components/apps/projects/ProjectManager";

export default function ProjectsRoutePage() {
	const { projectId } = useParams<{ projectId: string }>();

	return (
		<PageFrame
			title="Project Manager"
			description="Organize and track your engineering projects."
			maxWidth="full"
		>
			<ProjectManager initialProjectId={projectId} />
		</PageFrame>
	);
}

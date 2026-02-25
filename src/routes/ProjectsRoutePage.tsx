import { useParams } from "react-router-dom";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { ProjectManager } from "../components/apps/projects/ProjectManager";

export default function ProjectsRoutePage() {
	const { projectId } = useParams<{ projectId: string }>();

	return (
		<PageFrame
			title="Project Manager"
			subtitle="Organize and track your engineering projects."
		>
			<ProjectManager initialProjectId={projectId} />
		</PageFrame>
	);
}

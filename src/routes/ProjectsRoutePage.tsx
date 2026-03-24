import { useParams } from "react-router-dom";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { ProjectManager } from "../components/apps/projects/ProjectManager";

export default function ProjectsRoutePage() {
	const { projectId } = useParams<{ projectId: string }>();
	useRegisterPageHeader({
		title: "Projects",
		subtitle: "Project planning, telemetry, tasks, and delivery workflows.",
	});

	return (
		<PageFrame maxWidth="full">
			<ProjectManager initialProjectId={projectId} />
		</PageFrame>
	);
}

import { ProjectManagerWorkspace, type ProjectManagerWorkspaceProps } from "@/features/project-manager";

type ProjectManagerProps = ProjectManagerWorkspaceProps;

export function ProjectManager(props: ProjectManagerProps = {}) {
	return <ProjectManagerWorkspace {...props} />;
}

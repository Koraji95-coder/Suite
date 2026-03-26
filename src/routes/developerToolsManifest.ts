import { normalizeReleaseState, type AppReleaseState } from "@/lib/audience";
import manifestData from "./developerToolsManifest.data.json";

export type DeveloperToolGroup =
	| "publishing-evidence"
	| "automation-lab"
	| "agent-lab"
	| "architecture-code"
	| "developer-docs";

export interface DeveloperToolManifest {
	id: string;
	title: string;
	description: string;
	route: string;
	group: DeveloperToolGroup;
	audience: "dev";
	releaseState: AppReleaseState;
	futureProduct: boolean;
	runtimeRequirements?: string[];
}

interface DeveloperToolGroupDefinition {
	id: DeveloperToolGroup;
	title: string;
	description: string;
}

interface DeveloperToolsManifestData {
	groups: DeveloperToolGroupDefinition[];
	tools: DeveloperToolManifest[];
}

const developerToolsManifestData = manifestData as DeveloperToolsManifestData;

export const DEVELOPER_TOOL_GROUPS: ReadonlyArray<DeveloperToolGroupDefinition> =
	developerToolsManifestData.groups;

export const DEVELOPER_TOOL_MANIFEST: ReadonlyArray<DeveloperToolManifest> =
	developerToolsManifestData.tools.map((tool) => ({
		...tool,
		releaseState: normalizeReleaseState(tool.releaseState),
	}));

export function getDeveloperToolGroup(
	groupId: DeveloperToolGroup,
): DeveloperToolGroupDefinition | undefined {
	return DEVELOPER_TOOL_GROUPS.find((group) => group.id === groupId);
}

export function findDeveloperToolByRoute(
	pathname: string,
): DeveloperToolManifest | undefined {
	return DEVELOPER_TOOL_MANIFEST.find((tool) =>
		pathname.startsWith(tool.route.split("?")[0]),
	);
}

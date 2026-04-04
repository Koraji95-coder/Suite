import manifestData from "./generated/developerDocsManifest.generated.json";

export interface DeveloperDocEntry {
	id: string;
	title: string;
	summary: string;
	relativePath: string;
	sectionId: string;
	tags: string[];
	startHere: boolean;
}

export interface DeveloperDocSection {
	id: string;
	title: string;
	description: string;
	count: number;
	docs: DeveloperDocEntry[];
}

export interface DeveloperDocsManifest {
	schemaVersion: string;
	generatedAt: string;
	docCount: number;
	sections: DeveloperDocSection[];
}

const developerDocsManifestData = manifestData as DeveloperDocsManifest;

export const DEVELOPER_DOCS_MANIFEST = developerDocsManifestData;
export const DEVELOPER_DOC_SECTIONS = developerDocsManifestData.sections;
export const DEVELOPER_DOC_COUNT = developerDocsManifestData.docCount;

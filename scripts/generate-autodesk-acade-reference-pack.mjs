#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

export const DEFAULT_OUTPUT_RELATIVE_PATH =
	"docs/development/autocad-electrical-2026-reference-pack.md";

export const DEFAULT_SOURCE_DOCS = [
	{
		title: "AutoCAD Electrical 2026 Project Flow Reference",
		relativePath: "docs/development/autocad-electrical-2026-project-flow-reference.md",
		resourceUri: "repo://docs/development/autocad-electrical-2026-project-flow",
		provenance:
			"Generated from allowlisted Autodesk offline-help wrapped payloads on the local workstation.",
		authorityNote:
			"Use this as the primary reference for AEPROJECT, `.wdp` lifecycle, project activation, and sidecar file behavior.",
	},
	{
		title: "AutoCAD Electrical 2026 AutoLISP Reference API Documentation",
		relativePath:
			"docs/development/AutoCAD Electrical 2026 AutoLISP Reference API Documentation.md",
		resourceUri:
			"repo://docs/development/autocad-electrical-2026-autolisp-api-reference",
		provenance:
			"Generated from the locally installed Autodesk ACE_API.chm plus the adjacent ACADE install asset inventory on this workstation.",
		authorityNote:
			"Use this for command entry points, AutoLISP/API routine names, and plugin-side automation hooks.",
	},
	{
		title: "AutoCAD Electrical 2026 Installation Context Reference",
		relativePath:
			"docs/development/autocad-electrical-2026-installation-context-reference.md",
		resourceUri:
			"repo://docs/development/autocad-electrical-2026-installation-context",
		structuredRelativePath:
			"docs/development/autocad-electrical-2026-installation-context.generated.yaml",
		structuredResourceUri:
			"repo://docs/development/autocad-electrical-2026-installation-context-yaml",
		provenance:
			"Generated from the local ACADE install tree, including UserSupport menus, shipped support scripts, Access lookup databases, sample drawings, and demo project seeds.",
		authorityNote:
			"Use this when Suite needs standards-aware menu context, support-script entry points, lookup-data structure, or real Autodesk sample/demo fixtures.",
	},
	{
		title: "AutoCAD Electrical 2026 Regression Fixtures",
		relativePath:
			"docs/development/autocad-electrical-2026-regression-fixtures.md",
		resourceUri:
			"repo://docs/development/autocad-electrical-2026-regression-fixtures",
		provenance:
			"Generated from the local ACADE install summary and narrowed to the sample/demo assets Suite should stage into a disposable local test workspace.",
		authorityNote:
			"Use this to choose safe copied Autodesk project/drawing fixtures for validating project-open, drawing-list, title-block, and future plugin-side automation flows.",
	},
];

function normalizeLineEndings(value) {
	return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function removeTopLevelHeading(markdown) {
	const lines = normalizeLineEndings(markdown).split("\n");
	let index = 0;

	while (index < lines.length && lines[index].trim() === "") {
		index += 1;
	}

	if (index < lines.length && /^#\s+/.test(lines[index])) {
		index += 1;
		while (index < lines.length && lines[index].trim() === "") {
			index += 1;
		}
	}

	return lines.slice(index).join("\n").trim();
}

function shiftHeadings(markdown, depth = 1) {
	return normalizeLineEndings(markdown).replace(
		/^(#{1,6})\s+(.+)$/gm,
		(_, hashes, text) => `${"#".repeat(Math.min(hashes.length + depth, 6))} ${text}`,
	);
}

function normalizeEmbeddedMarkdown(markdown) {
	const withoutTitle = removeTopLevelHeading(markdown);
	if (!withoutTitle) {
		return "";
	}

	return shiftHeadings(withoutTitle, 1).trim();
}

function buildSourceMapSection(sourceDocs) {
	const lines = ["## Source Map", ""];

	for (const doc of sourceDocs) {
		lines.push(`### ${doc.title}`);
		lines.push(`- Path: \`${doc.relativePath}\``);
		lines.push(`- MCP resource: \`${doc.resourceUri}\``);
		if (doc.structuredRelativePath) {
			lines.push(`- Structured YAML companion: \`${doc.structuredRelativePath}\``);
		}
		if (doc.structuredResourceUri) {
			lines.push(`- Structured MCP resource: \`${doc.structuredResourceUri}\``);
		}
		lines.push(`- Provenance: ${doc.provenance}`);
		lines.push(`- Preferred usage: ${doc.authorityNote}`);
		lines.push("");
	}

	return lines.join("\n").trim();
}

function buildUsageGuidanceSection() {
	return [
		"## Usage Guidance",
		"",
		"- Prefer this local pack and the per-document MCP resources before external web search when working on ACADE flows.",
		"- Treat the project-flow reference as authoritative for project creation, activation, `.wdp` ownership, and Autodesk-managed sidecars.",
		"- Treat the AutoLISP/API reference as the local command and routine catalog for ACADE automation design.",
		"- Treat the installation-context reference as the source for shipped menu taxonomies, support-script entry points, Access lookup structures, and sample/demo payloads.",
		"- Use the installation-context YAML companion when you want a structured inventory that is easier to browse, diff, or colorize in the editor.",
		"- If a workflow still needs validation after reading these docs, confirm it inside the installed AutoCAD Electrical environment instead of guessing from generic web summaries.",
	].join("\n");
}

export async function buildAcadeReferencePackMarkdown(options = {}) {
	const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
	const sourceDocs = options.sourceDocs || DEFAULT_SOURCE_DOCS;
	const generatedAt = options.generatedAt || new Date().toISOString();
	const sections = [];

	for (const source of sourceDocs) {
		const absolutePath = path.join(repoRoot, source.relativePath);
		const markdown = await fs.readFile(absolutePath, "utf8");
		const embeddedMarkdown = normalizeEmbeddedMarkdown(markdown);
		sections.push({
			...source,
			embeddedMarkdown,
		});
	}

	const lines = [
		"# AutoCAD Electrical 2026 Local Reference Pack",
		"",
		`Generated at ${generatedAt}.`,
		"",
		"This pack consolidates the local AutoCAD Electrical references that Suite should prefer over ad-hoc web search when reasoning about project flow, automation boundaries, and API entry points.",
		"",
		buildSourceMapSection(sourceDocs),
		"",
		buildUsageGuidanceSection(),
		"",
	];

	for (const section of sections) {
		lines.push(`## ${section.title}`);
		lines.push("");
		lines.push(`Source path: \`${section.relativePath}\``);
		if (section.structuredRelativePath) {
			lines.push(`Structured companion: \`${section.structuredRelativePath}\``);
		}
		if (section.structuredResourceUri) {
			lines.push(`Structured MCP resource: \`${section.structuredResourceUri}\``);
		}
		lines.push("");
		if (section.embeddedMarkdown) {
			lines.push(section.embeddedMarkdown);
			lines.push("");
		}
	}

	return `${lines.join("\n").trim()}\n`;
}

async function runCli() {
	const repoRoot = REPO_ROOT;
	const outputPath = path.join(repoRoot, DEFAULT_OUTPUT_RELATIVE_PATH);
	const markdown = await buildAcadeReferencePackMarkdown({ repoRoot });
	await fs.writeFile(outputPath, markdown, "utf8");
	console.log(`Generated ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate AutoCAD Electrical reference pack:", error);
		process.exit(1);
	});
}

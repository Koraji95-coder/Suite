#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OFFLINE_ROOT =
	"C:\\Program Files\\Autodesk\\Offline Help for AutoCAD Electrical 2026 - English";
const OUTPUT_DOC = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-project-flow-reference.md",
);
const DOC_TITLE = "AutoCAD Electrical 2026 Project Flow Reference";

const ALLOWLIST = [
	{
		id: "work-with-projects",
		targetSection: "AEPROJECT / Project Manager entrypoints",
		label: "To Work with Projects",
		source: path.join("Help", "wrapped-filesACAD_E", "GUID-25D4B513-8E04-42C2-BA86-23B709FFC3D3.htm.js"),
	},
	{
		id: "projects-tab",
		targetSection: "AEPROJECT / Project Manager entrypoints",
		label: "Projects Tab (Project Manager Dialog Box)",
		source: path.join("Help", "wrapped-filesACAD_E", "GUID-79E83296-12EF-43D9-87A8-E127519FF784.htm.js"),
	},
	{
		id: "about-projects",
		targetSection: ".wdp, .aepx, and project-related sidecar files",
		label: "About Projects",
		source: path.join("Help", "wrapped-filesACAD_E", "GUID-AF1F81F8-07B3-4CA0-A576-5FDA3ED3F68A.htm.js"),
	},
	{
		id: "project-related-files",
		targetSection: ".wdp, .aepx, and project-related sidecar files",
		label: "About Project Related Files",
		source: path.join("Help", "wrapped-filesACAD_E", "GUID-0B936B2C-085D-4A1C-AB6A-C76072C27C07.htm.js"),
	},
	{
		id: "get-project-filepath",
		targetSection:
			"Generic AutoCAD ActiveX project-path APIs and why they are not the ACADE creation mechanism",
		label: "GetProjectFilePath Method (ActiveX)",
		source: path.join("Help", "wrapped-filesACD", "GUID-C9DDFE09-35F5-4328-9359-30F0EED70CF8.htm.js"),
	},
	{
		id: "set-project-filepath",
		targetSection:
			"Generic AutoCAD ActiveX project-path APIs and why they are not the ACADE creation mechanism",
		label: "SetProjectFilePath Method (ActiveX)",
		source: path.join("Help", "wrapped-filesACD", "GUID-66AD1415-B1FD-4E24-AA41-68A93220C3A4.htm.js"),
	},
];

const SECTION_ORDER = [
	"AEPROJECT / Project Manager entrypoints",
	"Bare project creation and activation flow",
	".wdp, .aepx, and project-related sidecar files",
	"WD.ENV, WD_PROJ, and default path behavior",
	"Generic AutoCAD ActiveX project-path APIs and why they are not the ACADE creation mechanism",
	"Practical implications for Suite automation",
	"Source appendix with local Autodesk paths and GUIDs",
];

const MOJIBAKE_REPLACEMENTS = [
	["â€œ", '"'],
	["â€", '"'],
	["â€™", "'"],
	["â€“", "-"],
	["â€”", "-"],
	["â€¦", "..."],
];

function decodeWrappedString(value) {
	return value
		.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
		.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
		.replace(/\\n/g, "\n")
		.replace(/\\r/g, "\r")
		.replace(/\\t/g, "\t")
		.replace(/\\b/g, "\b")
		.replace(/\\f/g, "\f")
		.replace(/\\v/g, "\v")
		.replace(/\\"/g, '"')
		.replace(/\\'/g, "'")
		.replace(/\\\\/g, "\\");
}

export function extractHtmlFromWrapped(text) {
	const match = text.match(/var topic = "(.*?)";/s);
	if (!match) {
		throw new Error("Unable to find topic assignment in wrapped file.");
	}
	return decodeWrappedString(match[1]);
}

function normalizeText(value) {
	let normalized = String(value || "").replace(/\u00a0/g, " ");
	for (const [source, replacement] of MOJIBAKE_REPLACEMENTS) {
		normalized = normalized.replaceAll(source, replacement);
	}
	return normalized.replace(/\s+/g, " ").trim();
}

function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

function createDocument(html) {
	const dom = new JSDOM(html);
	const document = dom.window.document;
	for (const selector of [
		"script",
		"style",
		"button",
		"img",
		".footer-block",
		".footer-license-block",
		".related-topics",
		".uifinderbtn",
		".comments-anchor",
	]) {
		for (const node of document.querySelectorAll(selector)) {
			node.remove();
		}
	}
	return document;
}

function getTopicTitle(document) {
	return (
		normalizeText(document.querySelector("h1")?.textContent || "") ||
		normalizeText(document.title || "") ||
		"Untitled Autodesk help topic"
	);
}

function getBodyRoot(document) {
	return document.querySelector("#body-content") || document.body || document.documentElement;
}

function getAllParagraphs(document) {
	return unique(
		Array.from(getBodyRoot(document).querySelectorAll("p"))
			.map((node) => normalizeText(node.textContent))
			.filter(Boolean),
	);
}

function getAllListItems(document) {
	return unique(
		Array.from(getBodyRoot(document).querySelectorAll("li"))
			.map((node) => normalizeText(node.textContent))
			.filter(Boolean),
	);
}

function getFirstCodeBlock(document) {
	return normalizeText(document.querySelector("pre")?.textContent || "");
}

function getHeadingSection(document, headingText) {
	const normalizedHeading = headingText.toLowerCase();
	const heading = Array.from(getBodyRoot(document).querySelectorAll("h2, h3, h4")).find(
		(node) => normalizeText(node.textContent).toLowerCase() === normalizedHeading,
	);
	if (!heading) {
		return null;
	}
	return heading.closest(".section") || heading.parentElement;
}

function getSectionParagraphs(document, headingText) {
	const section = getHeadingSection(document, headingText);
	if (!section) {
		return [];
	}
	return unique(
		Array.from(section.querySelectorAll("p"))
			.map((node) => normalizeText(node.textContent))
			.filter(Boolean),
	);
}

function getSectionListItems(document, headingText) {
	const section = getHeadingSection(document, headingText);
	if (!section) {
		return [];
	}
	return unique(
		Array.from(section.querySelectorAll("li"))
			.map((node) => normalizeText(node.textContent))
			.filter(Boolean),
	);
}

function findFirstMatch(values, pattern) {
	return values.find((value) => pattern.test(value)) || null;
}

function pickMatching(values, patterns) {
	return patterns
		.map((pattern) => findFirstMatch(values, pattern))
		.filter(Boolean);
}

function formatSourceRefs(entries) {
	return entries.map((entry) => `\`${entry.label}\``).join(", ");
}

function addBullet(lines, text) {
	lines.push(`- ${text}`);
}

function addNumbered(lines, index, text) {
	lines.push(`${index}. ${text}`);
}

export function htmlToMarkdown(html) {
	const document = createDocument(html);
	const title = getTopicTitle(document);
	const paragraphs = getAllParagraphs(document);
	const listItems = getAllListItems(document);
	const lines = [`# ${title}`, ""];
	for (const paragraph of paragraphs.slice(0, 3)) {
		lines.push(paragraph, "");
	}
	if (listItems.length > 0) {
		for (const item of listItems.slice(0, 6)) {
			addBullet(lines, item);
		}
		lines.push("");
	}
	return lines.join("\n").trim();
}

async function loadEntries(root, allowlist = ALLOWLIST) {
	const entries = [];
	for (const entry of allowlist) {
		const sourcePath = path.join(root, entry.source);
		const wrapped = await fs.readFile(sourcePath, "utf8");
		const html = extractHtmlFromWrapped(wrapped);
		const document = createDocument(html);
		entries.push({
			...entry,
			guid: path.basename(entry.source).replace(/\.htm\.js$/i, ""),
			html,
			document,
			sourcePath,
			title: getTopicTitle(document),
			paragraphs: getAllParagraphs(document),
			listItems: getAllListItems(document),
			firstCodeBlock: getFirstCodeBlock(document),
		});
	}
	return entries;
}

function buildGenericDoc(entries, sectionOrder = SECTION_ORDER) {
	const sectionMap = new Map(sectionOrder.map((section) => [section, []]));
	for (const entry of entries) {
		if (sectionMap.has(entry.targetSection)) {
			sectionMap.get(entry.targetSection)?.push(entry);
		}
	}

	const lines = [`# ${DOC_TITLE}`, "", "Generated from allowlisted Autodesk wrapped help payloads.", ""];
	for (const section of sectionOrder) {
		const sectionEntries = sectionMap.get(section) || [];
		if (!sectionEntries.length) {
			continue;
		}
		lines.push(`## ${section}`, "");
		for (const entry of sectionEntries) {
			lines.push(`### ${entry.label}`, "");
			for (const paragraph of entry.paragraphs.slice(0, 2)) {
				lines.push(paragraph, "");
			}
			for (const item of entry.listItems.slice(0, 4)) {
				addBullet(lines, item);
			}
			lines.push("");
		}
	}
	return lines.join("\n");
}

function buildCuratedDoc(entries, root) {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const workWithProjects = byId.get("work-with-projects");
	const projectsTab = byId.get("projects-tab");
	const aboutProjects = byId.get("about-projects");
	const relatedFiles = byId.get("project-related-files");
	const getProjectFilePath = byId.get("get-project-filepath");
	const setProjectFilePath = byId.get("set-project-filepath");

	if (
		!workWithProjects ||
		!projectsTab ||
		!aboutProjects ||
		!relatedFiles ||
		!getProjectFilePath ||
		!setProjectFilePath
	) {
		throw new Error("The curated Autodesk project-flow build requires the full allowlist.");
	}

	const lines = [];
	const createProjectSteps = pickMatching(
		getSectionListItems(workWithProjects.document, "Create a Project"),
		[
			/Use one of the following/i,
			/Enter the name/i,
			/Select or create the directory/i,
			/Copy the project settings/i,
			/Descriptions/i,
			/OK-Properties/i,
			/^Click OK\b/i,
		],
	);
	const openProjectSummary =
		findFirstMatch(
			getSectionParagraphs(workWithProjects.document, "Open a Project"),
			/\.wdp/i,
		) ||
		"To open an existing project and make it active, browse to the target `.wdp` file from Project Manager.";
	const recentProjectSummary =
		findFirstMatch(
			getSectionParagraphs(workWithProjects.document, "Open a Recently Used Project"),
			/lastproj\.fil/i,
		) ||
		"The recent-projects list is stored in `lastproj.fil` under the Autodesk user support directory.";
	const launchProjectManager =
		findFirstMatch(workWithProjects.paragraphs, /launch Project Manager/i) ||
		"Project Manager launches from the Project tab, Project Tools panel, Manager command.";
	const commandEntry =
		findFirstMatch(projectsTab.paragraphs, /Command entry:/i) ||
		"Command entry: AEPROJECT";
	const paletteConstraint =
		findFirstMatch(projectsTab.paragraphs, /cannot have two projects open/i) ||
		"You cannot keep two open projects in the palette with the same project name.";
	const projectManagerButtons = pickMatching(
		getSectionListItems(projectsTab.document, "Buttons"),
		[/Open Project/i, /New Project/i, /New Drawing/i, /Project Task List/i],
	);
	const projectSelectionMenu = pickMatching(
		getSectionListItems(projectsTab.document, "Project Selection menu"),
		[/Recent/i, /New Project/i, /Open Project/i, /Open Project from Vault/i],
	);
	const projectManagerControlsSummary =
		projectManagerButtons.length > 0
			? `The Projects tab exposes core project controls including ${projectManagerButtons.join(", ")}.`
			: "The Projects tab exposes the core controls for opening, creating, and managing AutoCAD Electrical projects and drawings.";
	const projectSelectionSummary =
		projectSelectionMenu.length > 0
			? `The Project Selection menu includes ${projectSelectionMenu.join(", ")}, so create/open/activate flows all route through the Project Manager palette.`
			: "The Project Selection menu is the primary ACADE path for creating a new project, opening an existing project, or reopening a recent one.";
	const wdpFacts = pickMatching(aboutProjects.listItems, [
		/\.WDP extension/i,
		/Lists the complete path/i,
		/Includes the folder structure/i,
		/Includes the description/i,
		/Includes default settings/i,
	]);
	const wdProjParagraph =
		findFirstMatch(aboutProjects.paragraphs, /WD_PROJ/i) ||
		"Project files default to the folder pointed to by the `WD_PROJ` setting in the Autodesk environment file.";
	const aepxParagraph =
		findFirstMatch(aboutProjects.paragraphs, /\.aepx/i) ||
		"AutoCAD Electrical manages a secondary `.aepx` file automatically and recreates it if it is deleted.";
	const wdEnvCreateParagraph =
		findFirstMatch(workWithProjects.paragraphs, /WD\.ENV/i) ||
		"If the create-project directory field is blank, the new `.wdp` file is created at the location defined in `WD.ENV`.";
	const pickProjectDialogParagraph =
		"Autodesk documents `WD_PICKPRJDLG` as the setting that pre-seeds the default project-picker directory.";
	const searchSequenceA = findFirstMatch(relatedFiles.paragraphs, /search sequence "A"/i);
	const searchSequenceB = findFirstMatch(relatedFiles.paragraphs, /search sequence "B"/i);
	const searchSequenceC = findFirstMatch(relatedFiles.paragraphs, /search sequence "C"/i);
	const getPathSupported =
		findFirstMatch(getProjectFilePath.paragraphs, /Supported platforms:/i) ||
		"Supported platforms: AutoCAD for Windows only; not supported in AutoCAD LT for Windows.";
	const getPathDescription =
		findFirstMatch(getProjectFilePath.paragraphs, /external reference files/i) ||
		"`GetProjectFilePath` returns the directory where AutoCAD looks for external reference files.";
	const getPathProjectName =
		findFirstMatch(getProjectFilePath.paragraphs, /PROJECTNAME system variable/i) ||
		"The `ProjectName` argument is tied to the `PROJECTNAME` system variable.";
	const setPathDescription =
		findFirstMatch(setProjectFilePath.paragraphs, /external reference files/i) ||
		"`SetProjectFilePath` sets the directory where AutoCAD looks for external reference files.";
	const setPathSignature =
		setProjectFilePath.firstCodeBlock || "object.SetProjectFilePath ProjectName, ProjectFilePath";

	lines.push(`# ${DOC_TITLE}`, "");
	lines.push(
		`Generated from allowlisted wrapped Autodesk Offline Help payloads under \`${root}\`. This focused reference is the authoritative Suite-side doc for ACADE project creation/opening research, not the broader AutoLISP archive.`,
		"",
	);

	lines.push("## AEPROJECT / Project Manager entrypoints", "");
	addBullet(lines, `Primary command entry in the Autodesk help: \`AEPROJECT\` (${commandEntry}).`);
	addBullet(lines, launchProjectManager);
	addBullet(lines, projectManagerControlsSummary);
	addBullet(lines, projectSelectionSummary);
	addBullet(lines, paletteConstraint);
	addBullet(lines, `Source pages: ${formatSourceRefs([workWithProjects, projectsTab])}.`);
	lines.push("");

	lines.push("## Bare project creation and activation flow", "");
	createProjectSteps.forEach((step, index) => addNumbered(lines, index + 1, step));
	addBullet(lines, openProjectSummary);
	addBullet(lines, recentProjectSummary);
	addBullet(lines, "The Autodesk help states that a newly created project becomes the active project.");
	lines.push("");

	lines.push("## .wdp, .aepx, and project-related sidecar files", "");
	wdpFacts.forEach((fact) => addBullet(lines, fact));
	addBullet(lines, aepxParagraph);
	addBullet(
		lines,
		"Key project-level sidecars called out by Autodesk include `.WDT` for title block mapping, `.WDL` for project label/LINEx customization, `*_CAT.MDB` or `DEFAULT_CAT.MDB` for catalog lookup, `.INST` and `.LOC` defaults, and `.WDW` wire color/gauge label mappings.",
	);
	addBullet(
		lines,
		"These files are ACADE-managed project context files that live beside, or are resolved relative to, the active `.wdp` rather than Suite-owned scaffold files.",
	);
	lines.push("");

	lines.push("## WD.ENV, WD_PROJ, and default path behavior", "");
	addBullet(lines, wdEnvCreateParagraph);
	addBullet(lines, wdProjParagraph);
	addBullet(lines, pickProjectDialogParagraph);
	addBullet(
		lines,
		searchSequenceA ||
			'Autodesk search sequence "A" prioritizes explicit paths, the Autodesk user support folder, and the active project\'s `.wdp` folder before broader support search paths.',
	);
	addBullet(
		lines,
		searchSequenceB ||
			'Autodesk search sequence "B" is used for footprint and schematic lookup resources and also checks catalog/panel support paths before general AutoCAD support paths.',
	);
	addBullet(
		lines,
		searchSequenceC ||
			'Autodesk search sequence "C" is used for catalog-style defaults and can optionally move AutoCAD support paths earlier when `WD_ACADPATHFIRST=1` is enabled.',
	);
	lines.push("");

	lines.push(
		"## Generic AutoCAD ActiveX project-path APIs and why they are not the ACADE creation mechanism",
		"",
	);
	addBullet(lines, "GetProjectFilePath / SetProjectFilePath are not ACADE project-creation APIs.");
	addBullet(lines, getPathDescription);
	addBullet(lines, setPathDescription);
	addBullet(lines, getPathProjectName);
	addBullet(lines, `The documented setter signature is \`${setPathSignature}\`.`);
	addBullet(lines, getPathSupported);
	addBullet(
		lines,
		"Both APIs belong to AutoCAD's `PreferencesFiles` object and manage the generic AutoCAD project/xref search directory, not the AutoCAD Electrical Project Manager flow that creates or activates `.wdp` projects.",
	);
	lines.push("");

	lines.push("## Practical implications for Suite automation", "");
	addBullet(
		lines,
		"Suite should trigger `AEPROJECT`/Project Manager or an AutoCAD-hosted plugin bridge and let ACADE create or open the project from inside AutoCAD Electrical.",
	);
	addBullet(
		lines,
		"Suite should not create starter `.wdp`, `.wdt`, `.wdl`, or related project files itself just to mimic an ACADE project.",
	);
	addBullet(
		lines,
		"If Suite captures an intended project root or `.wdp` target path, that path should be passed into the ACADE-side flow as an operator intent or plugin argument, not written directly by Suite as a fake project artifact.",
	);
	addBullet(
		lines,
		"When Suite inspects an existing ACADE project, it should look for the active `.wdp`, the auto-managed `.aepx`, and sidecar discovery behavior rooted in the project folder and Autodesk search sequences.",
	);
	lines.push("");

	lines.push("## Source appendix with local Autodesk paths and GUIDs", "");
	addBullet(lines, `Offline help root: \`${root}\`.`);
	for (const entry of entries) {
		addBullet(lines, `\`${entry.guid}\` | ${entry.label} | \`${entry.sourcePath}\``);
	}
	lines.push("");

	return lines.join("\n");
}

export async function buildDocFromRoot(root, options = {}) {
	const allowlist = options.allowlist || ALLOWLIST;
	const sectionOrder = options.sectionOrder || SECTION_ORDER;
	const entries = await loadEntries(root, allowlist);
	if (options.allowlist || options.sectionOrder) {
		return buildGenericDoc(entries, sectionOrder);
	}
	return buildCuratedDoc(entries, root);
}

async function runCli() {
	const argv = process.argv.slice(2);
	let offlineRoot = process.env.SUITE_AUTODESK_OFFLINE_HELP_ROOT || DEFAULT_OFFLINE_ROOT;
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--offline-help-root" && argv[i + 1]) {
			offlineRoot = argv[i + 1];
		}
	}

	const markdown = await buildDocFromRoot(offlineRoot);
	await fs.writeFile(OUTPUT_DOC, markdown, "utf8");
	console.log(`Generated ${OUTPUT_DOC}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate Autodesk project-flow doc:", error);
		process.exit(1);
	});
}

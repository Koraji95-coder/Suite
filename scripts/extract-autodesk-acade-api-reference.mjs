#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ACADE_ROOT = "C:\\Program Files\\Autodesk\\AutoCAD 2026\\Acade";
const DEFAULT_HELP_ROOT = path.join(DEFAULT_ACADE_ROOT, "Help", "en-US", "Help");
const DEFAULT_CHM_PATH = path.join(DEFAULT_HELP_ROOT, "ACE_API.chm");
const DEFAULT_EXTRACTED_ROOT = path.join(os.tmpdir(), "suite-ace-api-chm");
const DEFAULT_OUTPUT_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"AutoCAD Electrical 2026 AutoLISP Reference API Documentation.md",
);
const WINDOWS_1252 = new TextDecoder("windows-1252");
const SECTION_PREFIX = /^Section [A-Z]/i;
const SAMPLE_INDEX_NAME = "Samples Index";
const INTRODUCTION_NAME = "Introduction";
const WHATS_NEW_NAME = "What's New";
const APPENDIX_NAME = "Appendix";
const MOJIBAKE_REPLACEMENTS = [
	["Ã¢â‚¬Å“", '"'],
	["Ã¢â‚¬Â", '"'],
	["Ã¢â‚¬â„¢", "'"],
	["Ã¢â‚¬â€œ", "-"],
	["Ã¢â‚¬â€", "-"],
	["Ã¢â‚¬Â¦", "..."],
	["Â­", ""],
];

function normalizeText(value) {
	let normalized = String(value || "").replace(/\u00a0/g, " ");
	for (const [source, replacement] of MOJIBAKE_REPLACEMENTS) {
		normalized = normalized.replaceAll(source, replacement);
	}
	return normalized.replace(/\s+/g, " ").trim();
}

function normalizeCode(value) {
	return String(value || "")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(/[ \t]+$/gm, "")
		.trim();
}

function toPosix(filePath) {
	return String(filePath || "").replaceAll("\\", "/");
}

function formatInlineCode(value) {
	return `\`${String(value || "").replaceAll("`", "\\`")}\``;
}

function dedupeBy(items, keySelector) {
	const seen = new Set();
	return items.filter((item) => {
		const key = keySelector(item);
		if (!key || seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

async function readWindows1252(filePath) {
	const buffer = await fs.readFile(filePath);
	return WINDOWS_1252.decode(buffer);
}

function createDocument(html) {
	const dom = new JSDOM(html);
	const document = dom.window.document;
	for (const selector of ["script", "style"]) {
		for (const node of document.querySelectorAll(selector)) {
			node.remove();
		}
	}
	return document;
}

function getPageTitle(document) {
	return (
		normalizeText(document.querySelector(".Element5")?.textContent || "") ||
		normalizeText(document.title || "") ||
		"Untitled AutoCAD Electrical topic"
	);
}

function getPageContentRoot(document) {
	return document.querySelector(".Element58") || document.body || document.documentElement;
}

function extractStructuredSections(document) {
	const root = getPageContentRoot(document);
	const sections = new Map();
	let currentHeading = null;
	let currentNodes = [];

	for (const node of Array.from(root.children)) {
		if (node.tagName && node.tagName.toLowerCase() === "a" && node.hasAttribute("name")) {
			continue;
		}

		if (
			node.tagName &&
			node.tagName.toLowerCase() === "div" &&
			node.classList.contains("Element14")
		) {
			if (currentHeading) {
				sections.set(currentHeading, currentNodes);
			}
			currentHeading = normalizeText(node.textContent);
			currentNodes = [];
			continue;
		}

		if (currentHeading) {
			currentNodes.push(node);
		}
	}

	if (currentHeading) {
		sections.set(currentHeading, currentNodes);
	}

	return sections;
}

function collectParagraphs(nodes) {
	if (!nodes || nodes.length === 0) {
		return [];
	}

	return dedupeBy(
		nodes
			.flatMap((node) => Array.from(node.querySelectorAll("p")))
			.map((node) => normalizeText(node.textContent))
			.filter(Boolean),
		(value) => value,
	);
}

function collectListItems(nodes) {
	if (!nodes || nodes.length === 0) {
		return [];
	}

	return dedupeBy(
		nodes
			.flatMap((node) => Array.from(node.querySelectorAll("li")))
			.map((node) => normalizeText(node.textContent))
			.filter(Boolean),
		(value) => value,
	);
}

function collectLinks(nodes) {
	if (!nodes || nodes.length === 0) {
		return [];
	}

	return dedupeBy(
		nodes
			.flatMap((node) => Array.from(node.querySelectorAll("a")))
			.map((node) => ({
				text: normalizeText(node.textContent),
				href: normalizeText(node.getAttribute("href") || ""),
			}))
			.filter((link) => link.text || link.href),
		(link) => `${link.text}::${link.href}`,
	);
}

function collectFirstCodeBlock(nodes) {
	if (!nodes || nodes.length === 0) {
		return "";
	}

	const first = nodes.flatMap((node) => Array.from(node.querySelectorAll("pre")))[0];
	return normalizeCode(first?.textContent || "");
}

function collectTableRows(table) {
	if (!table) {
		return [];
	}

	return Array.from(table.querySelectorAll("tr"))
		.map((row) => {
			const cells = Array.from(row.querySelectorAll("th, td")).map((cell) => {
				const link = cell.querySelector("a");
				return {
					text: normalizeText(cell.textContent),
					href: normalizeText(link?.getAttribute("href") || ""),
				};
			});
			return cells.filter((cell) => cell.text || cell.href);
		})
		.filter((row) => row.length > 0);
}

function collectFirstTable(nodes) {
	if (!nodes || nodes.length === 0) {
		return [];
	}

	const firstTable = nodes.flatMap((node) => Array.from(node.querySelectorAll("table")))[0];
	return collectTableRows(firstTable);
}

function extractDirectObjectParams(objectNode) {
	const params = {};

	for (const child of Array.from(objectNode.children)) {
		if (!child.tagName || child.tagName.toLowerCase() !== "param") {
			continue;
		}
		const name = normalizeText(child.getAttribute("name") || "").toLowerCase();
		const value = normalizeText(child.getAttribute("value") || "");
		if (name) {
			params[name] = value;
		}
	}

	return params;
}

function getDirectChildByTagName(parent, tagName) {
	const expected = String(tagName || "").toLowerCase();
	return Array.from(parent.children).find(
		(child) => child.tagName && child.tagName.toLowerCase() === expected,
	);
}

function parseTocList(listNode) {
	const entries = [];

	for (const child of Array.from(listNode.children)) {
		if (!child.tagName || child.tagName.toLowerCase() !== "li") {
			continue;
		}

		const objectNode = getDirectChildByTagName(child, "object");
		if (!objectNode) {
			continue;
		}

		const params = extractDirectObjectParams(objectNode);
		const nestedList = getDirectChildByTagName(child, "ul");
		entries.push({
			name: params.name || "Untitled",
			local: params.local || "",
			children: nestedList ? parseTocList(nestedList) : [],
		});
	}

	return entries;
}

export function parseChmToc(hhcText) {
	const document = createDocument(hhcText);
	const rootList = document.querySelector("ul");
	if (!rootList) {
		throw new Error("Unable to find the root TOC list in the CHM table of contents.");
	}
	return parseTocList(rootList);
}

export function parseCommandPage(html, localPath = "") {
	const document = createDocument(html);
	const sections = extractStructuredSections(document);
	const parametersRows = collectFirstTable(sections.get("Parameters"));
	const rawParameters = parametersRows.slice(1);
	const relatedLinks = collectLinks(sections.get("Links"));
	const moduleLinks = collectLinks(sections.get("Module"));
	const moduleText = collectParagraphs(sections.get("Module"))[0] || moduleLinks[0]?.text || "";

	return {
		title: getPageTitle(document),
		localPath,
		description: collectParagraphs(sections.get("Description")).join(" "),
		signature: collectFirstCodeBlock(sections.get("AutoLISP")),
		parameters: rawParameters
			.filter((row) => row.length >= 1)
			.map((row) => ({
				name: row[0]?.text || "",
				description: row[1]?.text || "",
			}))
			.filter((parameter) => parameter.name || parameter.description),
		returns: collectParagraphs(sections.get("Returns")).join(" "),
		moduleName: moduleText,
		moduleHref: moduleLinks[0]?.href || "",
		relatedLinks,
		exampleTopicHref:
			relatedLinks.find((link) => link.text.toLowerCase() === "example")?.href || "",
	};
}

export function parseSectionTopicsPage(html, localPath = "") {
	const document = createDocument(html);
	const sections = extractStructuredSections(document);
	const topicRows = collectFirstTable(sections.get("Topics"));
	const topics = topicRows
		.slice(1)
		.map((row) => ({
			name: row[0]?.text || "",
			href: row[0]?.href || "",
			description: row[1]?.text || "",
		}))
		.filter((topic) => topic.name || topic.href || topic.description);

	return {
		title: getPageTitle(document),
		localPath,
		description: collectParagraphs(sections.get("Description")).join(" "),
		topics,
	};
}

export function parseSampleIndexPage(html, localPath = "") {
	const document = createDocument(html);
	const tables = Array.from(document.querySelectorAll("table.Table2"));
	const generalSamples = collectTableRows(tables[0])
		.map((row) => ({
			label: row[0]?.text || "",
			href: row[0]?.href || "",
			description: row[1]?.text || "",
		}))
		.filter((sample) => sample.label || sample.href || sample.description);

	const referenceRows = collectTableRows(tables[1]);
	let currentSection = "";
	const referenceSamples = [];

	for (const row of referenceRows) {
		const firstCell = row[0];
		if (!firstCell) {
			continue;
		}

		if (/^Section [A-Z]/i.test(firstCell.text)) {
			currentSection = firstCell.text;
			continue;
		}

		if (firstCell.href || firstCell.text) {
			referenceSamples.push({
				section: currentSection || "Ungrouped",
				label: firstCell.text,
				href: firstCell.href || "",
			});
		}
	}

	return {
		title: getPageTitle(document),
		localPath,
		generalSamples,
		referenceSamples,
	};
}

function findTocNode(nodes, name) {
	return nodes.find((node) => node.name === name) || null;
}

async function loadHtmlFromExtractedRoot(extractedRoot, relativePath) {
	const absolutePath = path.join(extractedRoot, relativePath);
	return readWindows1252(absolutePath);
}

async function loadPageDocument(extractedRoot, relativePath) {
	const html = await loadHtmlFromExtractedRoot(extractedRoot, relativePath);
	return {
		html,
		document: createDocument(html),
	};
}

async function collectSectionData(extractedRoot, tocNode) {
	const pageHtml = await loadHtmlFromExtractedRoot(extractedRoot, tocNode.local);
	const sectionPage = parseSectionTopicsPage(pageHtml, tocNode.local);
	const sectionTopicsByHref = new Map(
		sectionPage.topics
			.filter((topic) => topic.href)
			.map((topic) => [topic.href.toLowerCase(), topic]),
	);

	const commands = [];
	for (const child of tocNode.children) {
		if (!child.local) {
			continue;
		}
		const commandHtml = await loadHtmlFromExtractedRoot(extractedRoot, child.local);
		const parsedCommand = parseCommandPage(commandHtml, child.local);
		const sectionTopic = sectionTopicsByHref.get(child.local.toLowerCase());
		commands.push({
			name: child.name,
			localPath: child.local,
			description: parsedCommand.description || sectionTopic?.description || "",
			signature: parsedCommand.signature,
			parameters: parsedCommand.parameters,
			returns: parsedCommand.returns,
			moduleName: parsedCommand.moduleName,
			moduleHref: parsedCommand.moduleHref,
			exampleTopicHref: parsedCommand.exampleTopicHref,
			relatedLinks: parsedCommand.relatedLinks,
		});
	}

	return {
		name: tocNode.name,
		localPath: tocNode.local,
		description: sectionPage.description,
		commands,
	};
}

async function collectIntroData(extractedRoot, tocNode) {
	if (!tocNode?.local) {
		return null;
	}
	const { document } = await loadPageDocument(extractedRoot, tocNode.local);
	const sections = extractStructuredSections(document);
	return {
		title: getPageTitle(document),
		localPath: tocNode.local,
		description: collectParagraphs(sections.get("Description")),
		descriptionListItems: collectListItems(sections.get("Description")),
		descriptionLinks: collectLinks(sections.get("Description")),
	};
}

async function collectWhatsNewData(extractedRoot, tocNode) {
	if (!tocNode?.local) {
		return null;
	}
	const { document } = await loadPageDocument(extractedRoot, tocNode.local);
	const sections = extractStructuredSections(document);
	return {
		title: getPageTitle(document),
		localPath: tocNode.local,
		description: collectParagraphs(sections.get("Description")),
		listItems: collectListItems(sections.get("Description")),
	};
}

async function collectSampleData(extractedRoot, tocNode) {
	if (!tocNode?.local) {
		return null;
	}
	const html = await loadHtmlFromExtractedRoot(extractedRoot, tocNode.local);
	return parseSampleIndexPage(html, tocNode.local);
}

async function collectAppendixData(extractedRoot, tocNode) {
	if (!tocNode?.local) {
		return null;
	}
	const html = await loadHtmlFromExtractedRoot(extractedRoot, tocNode.local);
	const parsed = parseSectionTopicsPage(html, tocNode.local);
	const document = createDocument(html);
	const sections = extractStructuredSections(document);
	const moduleLink = collectLinks(sections.get("Module"))[0] || null;
	return {
		...parsed,
		moduleName: moduleLink?.text || collectParagraphs(sections.get("Module"))[0] || "",
		moduleHref: moduleLink?.href || "",
	};
}

function formatParameterSummary(parameters) {
	if (!parameters || parameters.length === 0) {
		return "";
	}

	return parameters
		.map((parameter) => {
			if (parameter.name && parameter.description) {
				return `${formatInlineCode(parameter.name)} = ${parameter.description}`;
			}
			return parameter.name || parameter.description;
		})
		.join("; ");
}

function buildRoutineSummary(command) {
	const parts = [];
	if (command.description) {
		parts.push(command.description);
	}
	if (command.signature) {
		parts.push(`Signature: ${formatInlineCode(command.signature)}.`);
	}
	const parameterSummary = formatParameterSummary(command.parameters);
	if (parameterSummary) {
		parts.push(`Parameters: ${parameterSummary}.`);
	}
	if (command.returns) {
		parts.push(`Returns: ${command.returns}`);
	}
	if (command.exampleTopicHref) {
		parts.push(`Example topic: ${formatInlineCode(command.exampleTopicHref)}.`);
	}
	parts.push(`Source: ${formatInlineCode(command.localPath)}.`);
	return parts.join(" ");
}

async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function listDirectoryEntries(root, options = {}) {
	const { type = "all", limit = Number.POSITIVE_INFINITY } = options;
	if (!(await pathExists(root))) {
		return [];
	}

	const entries = await fs.readdir(root, { withFileTypes: true });
	return entries
		.filter((entry) => {
			if (type === "file") {
				return entry.isFile();
			}
			if (type === "directory") {
				return entry.isDirectory();
			}
			return true;
		})
		.map((entry) => path.join(root, entry.name))
		.slice(0, limit);
}

export async function collectAcadeInstallationAssets(acadeRoot) {
	const normalizedRoot = path.resolve(acadeRoot || DEFAULT_ACADE_ROOT);
	const userSupportRoot = path.join(
		normalizedRoot,
		"UserDataCache",
		"en-US",
		"Electrical",
		"UserSupport",
	);
	const supportPaths = [
		path.join(normalizedRoot, "wd_load.lsp"),
		path.join(normalizedRoot, "Support", "en-US", "Shared", "wdio.lsp"),
		path.join(normalizedRoot, "Support", "en-US", "Shared", "wdio.dcl"),
	];
	const editableSupport = [];
	for (const supportPath of supportPaths) {
		if (await pathExists(supportPath)) {
			editableSupport.push(supportPath);
		}
	}

	const lookupDatabases = await listDirectoryEntries(
		path.join(normalizedRoot, "en-US", "DB"),
		{ type: "file", limit: 20 },
	);
	const templateRoots = await listDirectoryEntries(
		path.join(normalizedRoot, "UserDataCache", "en-US"),
		{ type: "directory", limit: 20 },
	);
	const demoProjects = await listDirectoryEntries(
		path.join(
			normalizedRoot,
			"UserDataCache",
			"My Documents",
			"Acade 2026",
			"AeData",
			"Proj",
		),
		{ type: "directory", limit: 20 },
	);
	const sampleDrawings = await listDirectoryEntries(path.join(normalizedRoot, "Sample"), {
		type: "file",
		limit: 30,
	});
	const userSupportFiles = await listDirectoryEntries(userSupportRoot, {
		type: "file",
		limit: 200,
	});
	const rootFiles = await listDirectoryEntries(normalizedRoot, { type: "file", limit: 5000 });
	const compiledFasFiles = rootFiles.filter((filePath) => /\.fas$/i.test(filePath));
	const userSupportMenuFiles = userSupportFiles.filter((filePath) => /_MENU\.DAT$/i.test(filePath));
	const userSupportWorkspaceFiles = userSupportFiles.filter((filePath) =>
		/\.(cuix|fmp|lin|shx|pgp|xml)$/i.test(filePath),
	);
	const userSupportSymbolLibraries = userSupportFiles.filter((filePath) =>
		/\.(slb|dll)$/i.test(filePath),
	);

	return {
		acadeRoot: normalizedRoot,
		helpRoot: path.join(normalizedRoot, "Help", "en-US", "Help"),
		editableSupport,
		lookupDatabases,
		templateRoots,
		demoProjects,
		userSupportRoot,
		userSupportMenuFiles,
		userSupportWorkspaceFiles,
		userSupportSymbolLibraries,
		sampleDrawings,
		compiledFasCount: compiledFasFiles.length,
	};
}

function addLines(lines, ...nextLines) {
	for (const line of nextLines) {
		lines.push(line);
	}
}

function buildInstallationAssetSection(assets, chmPath) {
	const lines = ["## Local Installation Assets Relevant to Automation", ""];
	addLines(lines, `- Install root: ${formatInlineCode(assets.acadeRoot)}`);
	addLines(lines, `- Help root: ${formatInlineCode(assets.helpRoot)}`);
	addLines(lines, `- API CHM: ${formatInlineCode(chmPath)}`);
	addLines(
		lines,
		`- Compiled runtime modules: ${assets.compiledFasCount} ${formatInlineCode(".fas")} files are present in the install root; treat those as shipped binaries, while the ${formatInlineCode(".lsp")} and ${formatInlineCode(".dcl")} files remain the inspectable support sources.`,
	);
	addLines(lines, "");

	if (assets.editableSupport.length > 0) {
		addLines(lines, "### Editable Support Sources", "");
		for (const supportPath of assets.editableSupport) {
			addLines(lines, `- ${formatInlineCode(supportPath)}`);
		}
		addLines(lines, "");
	}

	if (assets.lookupDatabases.length > 0) {
		addLines(lines, "### Lookup Databases", "");
		for (const databasePath of assets.lookupDatabases) {
			addLines(lines, `- ${formatInlineCode(databasePath)}`);
		}
		addLines(lines, "");
	}

	if (assets.templateRoots.length > 0) {
		addLines(lines, "### Template and Seed Roots", "");
		for (const templateRoot of assets.templateRoots) {
			addLines(lines, `- ${formatInlineCode(templateRoot)}`);
		}
		addLines(lines, "");
	}

	if (assets.demoProjects.length > 0) {
		addLines(lines, "### Demo Project Seeds", "");
		for (const demoProject of assets.demoProjects) {
			addLines(lines, `- ${formatInlineCode(demoProject)}`);
		}
		addLines(lines, "");
	}

	if (
		assets.userSupportMenuFiles.length > 0 ||
		assets.userSupportWorkspaceFiles.length > 0 ||
		assets.userSupportSymbolLibraries.length > 0
	) {
		addLines(lines, "### User Support Payload", "");
		addLines(lines, `- Root: ${formatInlineCode(assets.userSupportRoot)}`);
		if (assets.userSupportMenuFiles.length > 0) {
			addLines(
				lines,
				`- Icon menu definitions: ${assets.userSupportMenuFiles.length} files, including ${assets.userSupportMenuFiles
					.slice(0, 6)
					.map((filePath) => formatInlineCode(path.basename(filePath)))
					.join(", ")}.`,
			);
		}
		if (assets.userSupportSymbolLibraries.length > 0) {
			addLines(
				lines,
				`- Symbol/menu library payloads: ${assets.userSupportSymbolLibraries.length} ${formatInlineCode(".slb/.dll")} files in the same root.`,
			);
		}
		if (assets.userSupportWorkspaceFiles.length > 0) {
			addLines(
				lines,
				`- Workspace support files include ${assets.userSupportWorkspaceFiles
					.slice(0, 6)
					.map((filePath) => formatInlineCode(path.basename(filePath)))
					.join(", ")}.`,
			);
		}
		addLines(lines, "");
	}

	if (assets.sampleDrawings.length > 0) {
		addLines(lines, "### Shipped Sample Drawings", "");
		for (const sampleDrawing of assets.sampleDrawings) {
			addLines(lines, `- ${formatInlineCode(sampleDrawing)}`);
		}
		addLines(lines, "");
	}

	return lines.join("\n").trim();
}

function buildIntroSection(intro) {
	if (!intro) {
		return "";
	}

	const lines = ["## Introduction", ""];
	for (const paragraph of intro.description) {
		addLines(lines, paragraph, "");
	}

	if (intro.descriptionListItems.length > 0) {
		addLines(lines, "### Linked Autodesk Topics", "");
		for (const item of intro.descriptionListItems) {
			addLines(lines, `- ${item}`);
		}
		addLines(lines, "");
	}

	const sampleLinks = intro.descriptionLinks.filter((link) => link.href.endsWith(".html"));
	if (sampleLinks.length > 0) {
		addLines(lines, "### Source Topics", "");
		for (const link of sampleLinks) {
			addLines(lines, `- ${formatInlineCode(link.href)} (${link.text || "linked topic"})`);
		}
		addLines(lines, "");
	}

	return lines.join("\n").trim();
}

function buildWhatsNewSection(whatsNew) {
	if (!whatsNew) {
		return "";
	}

	const lines = ["## What's New", ""];
	for (const paragraph of whatsNew.description) {
		addLines(lines, paragraph, "");
	}
	for (const item of whatsNew.listItems) {
		addLines(lines, `- ${item}`);
	}
	if (lines[lines.length - 1] !== "") {
		addLines(lines, "");
	}
	return lines.join("\n").trim();
}

function buildSectionCatalogSection(sections) {
	const lines = ["## Section Catalog", ""];

	for (const section of sections) {
		addLines(lines, `### ${section.name}`, "");
		if (section.description) {
			addLines(lines, section.description, "");
		}
		addLines(lines, `- Source topic: ${formatInlineCode(section.localPath)}`);
		addLines(lines, `- Routine count: ${section.commands.length}`);
		addLines(lines, "");
		for (const command of section.commands) {
			addLines(lines, `- ${formatInlineCode(command.name)} - ${buildRoutineSummary(command)}`);
		}
		addLines(lines, "");
	}

	return lines.join("\n").trim();
}

function buildSamplesSection(samples) {
	if (!samples) {
		return "";
	}

	const lines = ["## Samples Index", ""];
	addLines(lines, `- Source topic: ${formatInlineCode(samples.localPath)}`);
	addLines(lines, "");

	if (samples.generalSamples.length > 0) {
		addLines(lines, "### General Usage Samples", "");
		for (const sample of samples.generalSamples) {
			const parts = [];
			if (sample.label) {
				parts.push(formatInlineCode(sample.label));
			}
			if (sample.description) {
				parts.push(sample.description);
			}
			if (sample.href) {
				parts.push(`Topic: ${formatInlineCode(sample.href)}.`);
			}
			addLines(lines, `- ${parts.join(" - ")}`);
		}
		addLines(lines, "");
	}

	if (samples.referenceSamples.length > 0) {
		addLines(lines, "### Reference Sample Topics", "");
		let currentSection = "";
		for (const sample of samples.referenceSamples) {
			if (sample.section !== currentSection) {
				currentSection = sample.section;
				addLines(lines, `#### ${currentSection}`, "");
			}
			const parts = [formatInlineCode(sample.label || sample.href || "Untitled sample")];
			if (sample.href) {
				parts.push(`Topic: ${formatInlineCode(sample.href)}.`);
			}
			addLines(lines, `- ${parts.join(" - ")}`);
		}
		addLines(lines, "");
	}

	return lines.join("\n").trim();
}

function buildAppendixSection(appendix) {
	if (!appendix) {
		return "";
	}

	const lines = ["## Appendix", ""];
	addLines(lines, `- Source topic: ${formatInlineCode(appendix.localPath)}`);
	if (appendix.moduleName) {
		addLines(lines, `- Module: ${appendix.moduleName}`);
	}
	if (appendix.moduleHref) {
		addLines(lines, `- Module topic: ${formatInlineCode(appendix.moduleHref)}`);
	}
	addLines(lines, "");

	for (const topic of appendix.topics) {
		const parts = [formatInlineCode(topic.name || topic.href || "Untitled topic")];
		if (topic.description) {
			parts.push(topic.description);
		}
		if (topic.href) {
			parts.push(`Source: ${formatInlineCode(topic.href)}.`);
		}
		addLines(lines, `- ${parts.join(" - ")}`);
	}
	addLines(lines, "");
	return lines.join("\n").trim();
}

function buildSourceAuthoritySection({
	generatedAt,
	chmPath,
	extractedRoot,
	tocCount,
	sectionCount,
	commandCount,
}) {
	return [
		"## Source Authority",
		"",
		"- This document is generated from the installed Autodesk AutoCAD Electrical help, not maintained by hand.",
		`- Generated at: ${generatedAt}`,
		`- CHM source: ${formatInlineCode(chmPath)}`,
		`- Extracted root: ${formatInlineCode(extractedRoot)}`,
		`- TOC source: ${formatInlineCode("AutoLISP Reference.hhc")}`,
		`- Coverage: ${sectionCount} API sections, ${commandCount} routine topics, ${tocCount} total TOC entries.`,
	].join("\n");
}

export async function buildDocFromExtractedRoot(extractedRoot, options = {}) {
	const normalizedExtractedRoot = path.resolve(extractedRoot || DEFAULT_EXTRACTED_ROOT);
	const chmPath = path.resolve(options.chmPath || DEFAULT_CHM_PATH);
	const acadeRoot = path.resolve(options.acadeRoot || DEFAULT_ACADE_ROOT);
	const generatedAt = options.generatedAt || new Date().toISOString();

	const tocText = await readWindows1252(
		path.join(normalizedExtractedRoot, "AutoLISP Reference.hhc"),
	);
	const toc = parseChmToc(tocText);
	const introNode = findTocNode(toc, INTRODUCTION_NAME);
	const whatsNewNode = findTocNode(toc, WHATS_NEW_NAME);
	const sampleNode = findTocNode(toc, SAMPLE_INDEX_NAME);
	const appendixNode = findTocNode(toc, APPENDIX_NAME);
	const sectionNodes = toc.filter((node) => SECTION_PREFIX.test(node.name));

	const [intro, whatsNew, samples, appendix, installationAssets] = await Promise.all([
		collectIntroData(normalizedExtractedRoot, introNode),
		collectWhatsNewData(normalizedExtractedRoot, whatsNewNode),
		collectSampleData(normalizedExtractedRoot, sampleNode),
		collectAppendixData(normalizedExtractedRoot, appendixNode),
		collectAcadeInstallationAssets(acadeRoot),
	]);
	const sections = [];
	for (const sectionNode of sectionNodes) {
		sections.push(await collectSectionData(normalizedExtractedRoot, sectionNode));
	}

	const commandCount = sections.reduce(
		(total, section) => total + section.commands.length,
		0,
	);
	const tocCount = toc.reduce((count, node) => count + 1 + node.children.length, 0);
	const parts = [
		"# AutoCAD Electrical 2026 AutoLISP Reference API Documentation",
		"",
		"Do not edit this file manually. Regenerate it from the installed Autodesk CHM help.",
		"",
		buildSourceAuthoritySection({
			generatedAt,
			chmPath: toPosix(chmPath),
			extractedRoot: toPosix(normalizedExtractedRoot),
			tocCount,
			sectionCount: sections.length,
			commandCount,
		}),
		"",
		"## Scope",
		"",
		"- Capture the installed AutoCAD Electrical 2026 AutoLISP/API reference from Autodesk's local `ACE_API.chm`.",
		"- Preserve the shipped section and routine catalog so Suite can reason from the workstation's local authority instead of guessing from generic web summaries.",
		"- Record the adjacent support, lookup-database, and template assets under the `Acade` install root that may matter to Suite automation work.",
		"",
		buildWhatsNewSection(whatsNew),
		"",
		buildIntroSection(intro),
		"",
		buildInstallationAssetSection(installationAssets, toPosix(chmPath)),
		"",
		buildSectionCatalogSection(sections),
		"",
		buildSamplesSection(samples),
		"",
		buildAppendixSection(appendix),
		"",
	];

	return `${parts
		.filter((part) => part !== null && part !== undefined)
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()}\n`;
}

function getWindowsHhExePath() {
	return path.join(process.env.SystemRoot || "C:\\Windows", "hh.exe");
}

async function ensureEmptyDirectory(root) {
	await fs.rm(root, { recursive: true, force: true });
	await fs.mkdir(root, { recursive: true });
}

async function decompileChm(chmPath, extractedRoot) {
	const hhExe = getWindowsHhExePath();
	if (!(await pathExists(hhExe))) {
		throw new Error(`Unable to find hh.exe at ${hhExe}.`);
	}
	if (!(await pathExists(chmPath))) {
		throw new Error(`Unable to find Autodesk API help at ${chmPath}.`);
	}

	await ensureEmptyDirectory(extractedRoot);
	const powershellScript = [
		`$hh = ${JSON.stringify(hhExe)}`,
		`$out = ${JSON.stringify(extractedRoot)}`,
		`$chm = ${JSON.stringify(chmPath)}`,
		"$process = Start-Process -FilePath $hh -ArgumentList '-decompile', $out, $chm -PassThru -Wait",
		"if ($process.ExitCode -ne 0) { throw \"hh.exe decompile failed with exit code $($process.ExitCode).\" }",
	].join("; ");
	execFileSync("powershell.exe", ["-NoProfile", "-Command", powershellScript], {
		stdio: "ignore",
	});
	const hhcPath = path.join(extractedRoot, "AutoLISP Reference.hhc");
	if (!(await pathExists(hhcPath))) {
		throw new Error(`Decompile completed but ${hhcPath} was not created.`);
	}
}

function readCliArg(flag) {
	const index = process.argv.indexOf(flag);
	if (index < 0) {
		return "";
	}
	return process.argv[index + 1] || "";
}

async function runCli() {
	const acadeRoot =
		readCliArg("--acade-root") ||
		process.env.SUITE_AUTODESK_ACADE_ROOT ||
		DEFAULT_ACADE_ROOT;
	const helpRoot =
		readCliArg("--help-root") ||
		process.env.SUITE_AUTODESK_ACADE_HELP_ROOT ||
		DEFAULT_HELP_ROOT;
	const chmPath = readCliArg("--chm") || path.join(helpRoot, "ACE_API.chm");
	const extractedRoot = readCliArg("--extract-root") || DEFAULT_EXTRACTED_ROOT;
	const outputPath = readCliArg("--output") || DEFAULT_OUTPUT_PATH;

	await decompileChm(chmPath, extractedRoot);
	const markdown = await buildDocFromExtractedRoot(extractedRoot, {
		acadeRoot,
		chmPath,
	});
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, markdown, "utf8");
	console.log(`Generated ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate AutoCAD Electrical AutoLISP/API reference:", error);
		process.exit(1);
	});
}

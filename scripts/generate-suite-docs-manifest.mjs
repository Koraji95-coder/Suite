#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");
const outputFile = path.join(
	repoRoot,
	"src",
	"routes",
	"knowledge",
	"modules",
	"generated",
	"developerDocsManifest.generated.json",
);
const verifyOnly = process.argv.includes("--verify");

const MARKDOWN_PATTERN = /\.(md|mdx)$/i;
const EXCLUDED_PATH_PARTS = new Set(["upgrade-archive"]);

const SECTION_META = {
	frontend: {
		id: "frontend-app",
		title: "Frontend",
		description:
			"Browser-owned architecture, feature slices, and UI/runtime flow notes.",
	},
	agent: {
		id: "agent-lab",
		title: "Agent Lab",
		description:
			"Pairing, orchestration, and profile-routing docs for experimental agent workflows.",
	},
	autodraft: {
		id: "automation-lab",
		title: "Automation Lab",
		description:
			"AutoDraft and related automation references, cutover notes, and workflow experiments.",
	},
	backend: {
		id: "backend-core",
		title: "Backend",
		description:
			"Hosted-core API, service, and route-group ownership notes.",
	},
	"runtime-control": {
		id: "runtime-control",
		title: "Runtime Control",
		description:
			"Workstation-local companion, bring-up, transfer, and local action guidance.",
	},
	cad: {
		id: "cad-local",
		title: "CAD",
		description:
			"AutoCAD execution, named-pipe transport, and local CAD integration references.",
	},
	development: {
		id: "developer-workshop",
		title: "Developer Workshop",
		description:
			"Runbooks, rollout notes, policies, and workstation guidance for building Suite locally.",
	},
	security: {
		id: "security-auth",
		title: "Security & Auth",
		description:
			"Authentication, secrets, environment, and rollout hardening guidance for developer use.",
	},
	archive: {
		id: "legacy-archive",
		title: "Legacy Archive",
		description:
			"Historical-only notes kept for reference and migration context.",
	},
	root: {
		id: "workspace-docs",
		title: "Workspace Docs",
		description:
			"Repo-wide project notes, baselines, and working documents that do not belong to a narrower developer domain.",
	},
};

function toPosix(filePath) {
	return filePath.replaceAll("\\", "/");
}

function normalizePath(filePath) {
	return toPosix(filePath).replace(/^\/+/, "").replace(/\/+/g, "/");
}

function stripMarkdownSyntax(value) {
	return value
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/[*_~>#]+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function fallbackTitle(relativePath) {
	const filename = path.basename(relativePath).replace(/\.(md|mdx)$/i, "");
	return filename
		.replace(/[._-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractTitle(markdown, relativePath) {
	const lines = markdown.split(/\r?\n/);
	for (const line of lines) {
		const headingMatch = /^#{1,2}\s+(.+)$/.exec(line.trim());
		if (!headingMatch) {
			continue;
		}

		const title = stripMarkdownSyntax(headingMatch[1].replace(/\s+#*$/, ""));
		if (title) {
			return title;
		}
	}

	return fallbackTitle(relativePath);
}

function extractSummary(markdown) {
	const lines = markdown.split(/\r?\n/);
	let inCode = false;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line.startsWith("```")) {
			inCode = !inCode;
			continue;
		}

		if (
			inCode ||
			!line ||
			line.startsWith("#") ||
			line.startsWith("|") ||
			line.startsWith(">") ||
			line.startsWith("-") ||
			line.startsWith("*")
		) {
			continue;
		}

		const cleaned = stripMarkdownSyntax(line);
		if (cleaned.length >= 28) {
			return cleaned.slice(0, 220);
		}
	}

	return "Developer documentation for Suite.";
}

function toId(relativePath) {
	return normalizePath(relativePath)
		.toLowerCase()
		.replace(/[^a-z0-9/.-]/g, "-")
		.replace(/[/.]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function isExcluded(relativePath) {
	const normalized = normalizePath(relativePath).toLowerCase();
	return normalized
		.split("/")
		.some((segment) => EXCLUDED_PATH_PARTS.has(segment));
}

function classifySection(relativePath) {
	const normalized = normalizePath(relativePath);
	const parts = normalized.split("/");
	if (parts[0] !== "docs") {
		return SECTION_META.root;
	}

	const topLevel = parts[1];
	return SECTION_META[topLevel] || SECTION_META.root;
}

function inferTags(relativePath, sectionId) {
	const normalized = normalizePath(relativePath).toLowerCase();
	const tags = new Set([sectionId]);

	if (normalized.includes("runbook")) {
		tags.add("runbook");
	}
	if (normalized.includes("rollout")) {
		tags.add("rollout");
	}
	if (normalized.includes("policy")) {
		tags.add("policy");
	}
	if (normalized.includes("checklist")) {
		tags.add("checklist");
	}
	if (normalized.includes("watchdog")) {
		tags.add("watchdog");
	}
	if (normalized.includes("gateway")) {
		tags.add("gateway");
	}
	if (normalized.includes("supabase")) {
		tags.add("supabase");
	}
	if (normalized.includes("auth")) {
		tags.add("auth");
	}
	if (normalized.includes("agent")) {
		tags.add("agents");
	}
	if (normalized.includes("autodraft") || normalized.includes("autowire")) {
		tags.add("automation");
	}
	if (normalized.includes("autocad")) {
		tags.add("autocad");
	}
	if (normalized.includes("acade")) {
		tags.add("acade");
	}
	if (normalized.includes("autodesk")) {
		tags.add("autodesk");
	}
	if (normalized.includes("electrical")) {
		tags.add("electrical");
	}
	if (normalized.includes("api")) {
		tags.add("api");
	}
	if (normalized.includes("offline-help")) {
		tags.add("offline-help");
	}

	return [...tags].sort((left, right) => left.localeCompare(right));
}

async function walkMarkdownFiles(rootDir) {
	const discovered = [];
	const stack = [rootDir];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const nextPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(nextPath);
				continue;
			}
			if (entry.isFile() && MARKDOWN_PATTERN.test(entry.name)) {
				discovered.push(nextPath);
			}
		}
	}

	return discovered;
}

async function ensureOutputDirectory() {
	await fs.mkdir(path.dirname(outputFile), { recursive: true });
}

async function buildManifest() {
	const markdownFiles = await walkMarkdownFiles(docsRoot);
	const entries = [];

	for (const filePath of markdownFiles) {
		const relativePath = normalizePath(path.relative(repoRoot, filePath));
		if (isExcluded(relativePath)) {
			continue;
		}

		const markdown = await fs.readFile(filePath, "utf8");
		const section = classifySection(relativePath);
		const title = extractTitle(markdown, relativePath);
		const summary = extractSummary(markdown);
		const startHere =
			path.basename(relativePath).toLowerCase() === "readme.md" ||
			relativePath === "docs/README.md";

		entries.push({
			id: toId(relativePath),
			title,
			summary,
			relativePath,
			sectionId: section.id,
			tags: inferTags(relativePath, section.id),
			startHere,
		});
	}

	entries.sort((left, right) => {
		if (left.sectionId !== right.sectionId) {
			return left.sectionId.localeCompare(right.sectionId);
		}
		if (left.startHere !== right.startHere) {
			return left.startHere ? -1 : 1;
		}
		return left.title.localeCompare(right.title);
	});

	const sections = Object.values(SECTION_META)
		.map((section) => {
			const docs = entries.filter((entry) => entry.sectionId === section.id);
			return {
				id: section.id,
				title: section.title,
				description: section.description,
				count: docs.length,
				docs,
			};
		})
		.filter((section) => section.count > 0);

	return {
		schemaVersion: "suite.developer-docs.v1",
		generatedAt: new Date().toISOString(),
		docCount: entries.length,
		sections,
	};
}

async function main() {
	await ensureOutputDirectory();
	const manifest = await buildManifest();
	const nextJson = `${JSON.stringify(manifest, null, "\t")}\n`;

	if (verifyOnly) {
		let existingJson = "";
		try {
			existingJson = await fs.readFile(outputFile, "utf8");
		} catch {
			process.stderr.write(
				`[docs-manifest] ${outputFile} is missing. Run the generator.\n`,
			);
			process.exit(1);
		}

		let existingManifest;
		try {
			existingManifest = JSON.parse(existingJson);
		} catch {
			process.stderr.write(
				`[docs-manifest] ${path.relative(repoRoot, outputFile)} could not be parsed. Regenerate it.\n`,
			);
			process.exit(1);
		}

		const existingComparable = {
			...existingManifest,
			generatedAt: "__ignored__",
		};
		const nextComparable = {
			...manifest,
			generatedAt: "__ignored__",
		};

		if (JSON.stringify(existingComparable) !== JSON.stringify(nextComparable)) {
			process.stderr.write(
				`[docs-manifest] ${path.relative(repoRoot, outputFile)} is stale. Run npm run docs:manifest.\n`,
			);
			process.exit(1);
		}

		process.stdout.write(
			`[docs-manifest] verified ${manifest.docCount} developer docs entries\n`,
		);
		return;
	}

	await fs.writeFile(outputFile, nextJson, "utf8");
	try {
		execFileSync(
			process.platform === "win32" ? "npx.cmd" : "npx",
			["biome", "format", "--write", outputFile],
			{
				cwd: repoRoot,
				stdio: "ignore",
			},
		);
	} catch {
		// Keep manifest generation resilient even if the local formatter is unavailable.
	}
	process.stdout.write(
		`[docs-manifest] generated ${manifest.docCount} developer docs entries\n`,
	);
}

main().catch((error) => {
	process.stderr.write(`[docs-manifest] generation failed: ${String(error)}\n`);
	process.exit(1);
});

#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildInstallationContextSummaryFromAcadeRoot } from "./extract-autodesk-acade-installation-context.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_ACADE_ROOT = "C:\\Program Files\\Autodesk\\AutoCAD 2026\\Acade";
const DEFAULT_OUTPUT_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-regression-fixtures.md",
);
const FIXTURE_PLAN_SCHEMA_VERSION = "suite.autodesk.acade.regression-fixtures.v1";

function readCliArg(flag) {
	const index = process.argv.indexOf(flag);
	if (index < 0) {
		return "";
	}
	return process.argv[index + 1] || "";
}

function normalizeText(value) {
	return String(value || "")
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function toPosix(filePath) {
	return String(filePath || "").replaceAll("\\", "/");
}

function formatInlineCode(value) {
	return `\`${String(value || "").replaceAll("`", "\\`")}\``;
}

function slugify(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function pathFileName(filePath) {
	return path.basename(String(filePath || ""));
}

function makeFileEntry(filePath) {
	return {
		name: pathFileName(filePath),
		path: toPosix(filePath),
	};
}

function makeProjectFixture(project, options = {}) {
	return {
		id: options.id || slugify(project.name) || "project-fixture",
		kind: "project",
		label: options.label || project.name,
		priority: options.priority || "secondary",
		purposes: options.purposes || [],
		why: options.why || "",
		rootPath: toPosix(project.rootPath),
		projectFiles: (project.projectFiles || []).map((filePath) => makeFileEntry(filePath)),
		drawingFiles: (project.drawingFiles || []).map((filePath) => makeFileEntry(filePath)),
		sidecarFiles: (project.sidecarFiles || []).map((filePath) => makeFileEntry(filePath)),
	};
}

function makeDrawingFixture(filePath, options = {}) {
	return {
		id: options.id || slugify(pathFileName(filePath)) || "drawing-fixture",
		kind: "drawing",
		label: options.label || pathFileName(filePath),
		priority: options.priority || "secondary",
		purposes: options.purposes || [],
		why: options.why || "",
		file: makeFileEntry(filePath),
	};
}

function firstProjectByWdp(summary, fileName) {
	const normalizedFileName = String(fileName || "").toLowerCase();
	return (summary.demoProjects || []).find((project) =>
		(project.projectFiles || []).some(
			(filePath) => pathFileName(filePath).toLowerCase() === normalizedFileName,
		),
	);
}

function firstProjectByName(summary, name) {
	const normalizedName = normalizeText(name).toLowerCase();
	return (summary.demoProjects || []).find(
		(project) => normalizeText(project.name).toLowerCase() === normalizedName,
	);
}

function firstDrawingByName(summary, fileName) {
	const normalizedFileName = String(fileName || "").toLowerCase();
	return (summary.sampleDrawings || []).find(
		(filePath) => pathFileName(filePath).toLowerCase() === normalizedFileName,
	);
}

function uniqueFixtures(fixtures) {
	const seen = new Set();
	return fixtures.filter((fixture) => {
		const key = `${fixture.kind}:${fixture.id}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

export function buildRegressionFixturePlanFromInstallationSummary(summary) {
	const fixtures = [];

	const wddemoProject = firstProjectByWdp(summary, "wddemo.wdp");
	if (wddemoProject) {
		fixtures.push(
			makeProjectFixture(wddemoProject, {
				id: "wddemo-project",
				label: "WDDemo canonical project",
				priority: "primary",
				purposes: [
					"project_open",
					"drawing_list",
					"title_block_mapping",
					"project_sidecars",
				],
				why:
					"Best all-around ACADE project fixture because it includes a real .wdp, title-block mapping sidecars, and multiple drawings.",
			}),
		);
	}

	const pointToPointProject =
		firstProjectByWdp(summary, "Point2Point.wdp") || firstProjectByName(summary, "Point2Point");
	if (pointToPointProject) {
		fixtures.push(
			makeProjectFixture(pointToPointProject, {
				id: "point2point-project",
				label: "Point2Point minimal project",
				priority: "primary",
				purposes: [
					"project_open",
					"minimal_project_flow",
					"single_drawing_validation",
				],
				why:
					"Useful minimal project fixture because it keeps project-open behavior easy to reason about with only one drawing.",
			}),
		);
	}

	const nfpaProject = firstProjectByWdp(summary, "Nfpademo.wdp");
	if (nfpaProject) {
		fixtures.push(
			makeProjectFixture(nfpaProject, {
				id: "nfpa-demo-project",
				label: "NFPA standards demo",
				priority: "secondary",
				purposes: ["standards_validation", "north_american_defaults"],
				why:
					"Good standards-focused project fixture for validating North American symbol/menu assumptions.",
			}),
		);
	}

	const safetyDrawing = firstDrawingByName(summary, "Safety Circuit.dwg");
	if (safetyDrawing) {
		fixtures.push(
			makeDrawingFixture(safetyDrawing, {
				id: "safety-circuit-drawing",
				label: "Safety Circuit sample drawing",
				priority: "primary",
				purposes: ["drawing_scan", "title_block_review", "non_plc_drawing_flow"],
				why:
					"Good drawing-level fixture for review and title-block-oriented flows without jumping into PLC-specific automation.",
			}),
		);
	}

	const plcDrawing = firstDrawingByName(summary, "PLC IO Rack Arrangement (1746-A7).DWG");
	if (plcDrawing) {
		fixtures.push(
			makeDrawingFixture(plcDrawing, {
				id: "plc-io-rack-drawing",
				label: "PLC IO Rack Arrangement sample",
				priority: "secondary",
				purposes: ["plc_workflow", "future_wdio_validation"],
				why:
					"Useful later for PLC/Spreadsheet-to-PLC work once the plugin-side wdio bridge exists.",
			}),
		);
	}

	const normalizedFixtures = uniqueFixtures(fixtures);
	const primaryFixtures = normalizedFixtures.filter((fixture) => fixture.priority === "primary");
	const secondaryFixtures = normalizedFixtures.filter((fixture) => fixture.priority !== "primary");

	return {
		schemaVersion: FIXTURE_PLAN_SCHEMA_VERSION,
		generatedAt: summary.generatedAt,
		source: {
			installationContext:
				"docs/development/autocad-electrical-2026-installation-context-reference.md",
			integrationPlaybook:
				"docs/development/autocad-electrical-2026-suite-integration-playbook.md",
		},
		recommendedLocalStageRoot: "output/autodesk-acade-regression-fixtures",
		counts: {
			fixtures: normalizedFixtures.length,
			projects: normalizedFixtures.filter((fixture) => fixture.kind === "project").length,
			drawings: normalizedFixtures.filter((fixture) => fixture.kind === "drawing").length,
			primary: primaryFixtures.length,
			secondary: secondaryFixtures.length,
		},
		primaryFixtures,
		secondaryFixtures,
		fixtures: normalizedFixtures,
	};
}

function buildFixtureSection(title, fixtures) {
	const lines = [title, ""];
	for (const fixture of fixtures) {
		lines.push(`### ${fixture.label}`);
		lines.push("");
		lines.push(`- Fixture id: ${formatInlineCode(fixture.id)}`);
		lines.push(`- Kind: ${fixture.kind}`);
		lines.push(`- Priority: ${fixture.priority}`);
		lines.push(`- Purposes: ${fixture.purposes.map((value) => formatInlineCode(value)).join(", ")}`);
		lines.push(`- Why: ${fixture.why}`);
		if (fixture.kind === "project") {
			lines.push(`- Root: ${formatInlineCode(fixture.rootPath)}`);
			lines.push(
				`- Project files: ${(fixture.projectFiles || []).map((entry) => formatInlineCode(entry.name)).join(", ") || "none"}`,
			);
			lines.push(
				`- Drawing count: ${(fixture.drawingFiles || []).length}`,
			);
			if ((fixture.sidecarFiles || []).length > 0) {
				lines.push(
					`- Sidecars: ${fixture.sidecarFiles
						.slice(0, 6)
						.map((entry) => formatInlineCode(entry.name))
						.join(", ")}`,
				);
			}
		} else if (fixture.file) {
			lines.push(`- File: ${formatInlineCode(fixture.file.path)}`);
		}
		lines.push("");
	}
	return lines.join("\n").trim();
}

export function buildRegressionFixturesMarkdownFromPlan(plan) {
	return [
		"# AutoCAD Electrical 2026 Regression Fixtures",
		"",
		"Do not edit this file manually. Regenerate it from the local ACADE install summary on the workstation.",
		"",
		`Generated at ${plan.generatedAt}.`,
		"",
		"## What This Is",
		"",
		"- Regression fixtures are copied Autodesk sample/demo assets used to re-run Suite project and drawing workflows safely after changes.",
		"- These fixtures should be staged into a local scratch workspace before tests or manual validation. Do not mutate the Autodesk install tree directly.",
		`- Recommended local staging root: ${formatInlineCode(plan.recommendedLocalStageRoot)}`,
		"- Current fixture focus is project open, drawing-list/title-block flows, and future plugin-side automation validation.",
		"",
		buildFixtureSection("## Primary Fixtures", plan.primaryFixtures),
		"",
		buildFixtureSection("## Secondary Fixtures", plan.secondaryFixtures),
		"",
		"## Staging Workflow",
		"",
		"- Stage all recommended fixtures: `npm run fixtures:autodesk:stage`",
		"- Stage one fixture: `npm run fixtures:autodesk:stage -- --fixture wddemo-project`",
		"- The staging script copies selected fixtures into `output/autodesk-acade-regression-fixtures` and writes a manifest beside them.",
		"",
		"## Why These Matter",
		"",
		"- `wddemo-project` is the best near-term project fixture for drawing-list management and title-block mapping because it carries `.wdp`, `.wdt`, and `.wdl` sidecars.",
		"- `point2point-project` is the clean minimal project-open fixture for plugin/bridge verification.",
		"- `safety-circuit-drawing` keeps the first drawing-level flow focused on non-PLC work.",
		"- `plc-io-rack-drawing` is intentionally kept as a secondary future fixture for the `wdio` bridge.",
		"",
	].join("\n");
}

export async function buildRegressionFixturesArtifactsFromAcadeRoot(acadeRoot, options = {}) {
	const summary =
		options.summary ||
		(await buildInstallationContextSummaryFromAcadeRoot(
			acadeRoot || DEFAULT_ACADE_ROOT,
			options,
		));
	const plan = buildRegressionFixturePlanFromInstallationSummary(summary);
	const markdown = buildRegressionFixturesMarkdownFromPlan(plan);
	return { summary, plan, markdown };
}

async function runCli() {
	const acadeRoot =
		readCliArg("--acade-root") ||
		process.env.SUITE_AUTODESK_ACADE_ROOT ||
		DEFAULT_ACADE_ROOT;
	const outputPath = readCliArg("--output") || DEFAULT_OUTPUT_PATH;
	const { markdown } = await buildRegressionFixturesArtifactsFromAcadeRoot(acadeRoot);
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, markdown, "utf8");
	console.log(`Generated ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate AutoCAD Electrical regression fixtures doc:", error);
		process.exit(1);
	});
}

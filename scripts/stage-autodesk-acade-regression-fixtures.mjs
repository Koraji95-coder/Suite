#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRegressionFixturesArtifactsFromAcadeRoot } from "./generate-autodesk-acade-regression-fixtures.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_ACADE_ROOT = "C:\\Program Files\\Autodesk\\AutoCAD 2026\\Acade";
const DEFAULT_STAGE_ROOT = path.join(REPO_ROOT, "output", "autodesk-acade-regression-fixtures");

function readCliArg(flag) {
	const values = [];
	for (let index = 0; index < process.argv.length; index += 1) {
		if (process.argv[index] === flag) {
			values.push(process.argv[index + 1] || "");
		}
	}
	return values;
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

function makeRelativeToRoot(rootPath, targetPath) {
	const relativePath = path.relative(rootPath, targetPath);
	return relativePath === "" ? "." : relativePath;
}

async function ensureDirectory(targetPath) {
	await fs.mkdir(targetPath, { recursive: true });
}

async function copyPathIntoStage(sourcePath, destinationPath) {
	const stat = await fs.stat(sourcePath);
	if (stat.isDirectory()) {
		await fs.cp(sourcePath, destinationPath, { recursive: true, force: true });
		return "directory";
	}
	await ensureDirectory(path.dirname(destinationPath));
	await fs.copyFile(sourcePath, destinationPath);
	return "file";
}

function parseArgs() {
	return {
		acadeRoot:
			readCliArg("--acade-root")[0] || process.env.SUITE_AUTODESK_ACADE_ROOT || DEFAULT_ACADE_ROOT,
		stageRoot: readCliArg("--stage-root")[0] || DEFAULT_STAGE_ROOT,
		fixtureIds: readCliArg("--fixture").map((value) => normalizeText(value).toLowerCase()).filter(Boolean),
	};
}

function selectedFixtures(plan, fixtureIds) {
	if (!fixtureIds.length) {
		return plan.primaryFixtures;
	}

	const wanted = new Set(fixtureIds);
	return (plan.fixtures || []).filter((fixture) => wanted.has(String(fixture.id || "").toLowerCase()));
}

export async function stageRegressionFixtures(options = {}) {
	const acadeRoot = options.acadeRoot || DEFAULT_ACADE_ROOT;
	const stageRoot = options.stageRoot || DEFAULT_STAGE_ROOT;
	const { plan } = await buildRegressionFixturesArtifactsFromAcadeRoot(acadeRoot, options);
	const fixtures = selectedFixtures(plan, options.fixtureIds || []);

	if (!fixtures.length) {
		throw new Error("No AutoCAD Electrical regression fixtures matched the requested selection.");
	}

	await ensureDirectory(stageRoot);
	const stagedFixtures = [];

	for (const fixture of fixtures) {
		const fixtureStageRoot = path.join(stageRoot, fixture.id);
		await fs.rm(fixtureStageRoot, { recursive: true, force: true });
		await ensureDirectory(fixtureStageRoot);

		if (fixture.kind === "project") {
			const sourceRoot = fixture.rootPath;
			const destinationRoot = path.join(fixtureStageRoot, "project");
			await copyPathIntoStage(sourceRoot, destinationRoot);
			stagedFixtures.push({
				id: fixture.id,
				kind: fixture.kind,
				label: fixture.label,
				purposes: fixture.purposes,
				sourceRoot: sourceRoot,
				stagedRoot: toPosix(destinationRoot),
				stagedProjectFiles: (fixture.projectFiles || []).map((entry) => ({
					name: entry.name,
					relativePath: toPosix(makeRelativeToRoot(sourceRoot, entry.path)),
					path: toPosix(path.join(destinationRoot, makeRelativeToRoot(sourceRoot, entry.path))),
				})),
			});
			continue;
		}

		const sourceFile = fixture.file?.path || "";
		const destinationFile = path.join(fixtureStageRoot, "drawing", path.basename(sourceFile));
		await copyPathIntoStage(sourceFile, destinationFile);
		stagedFixtures.push({
			id: fixture.id,
			kind: fixture.kind,
			label: fixture.label,
			purposes: fixture.purposes,
			sourceFile: sourceFile,
			stagedFile: toPosix(destinationFile),
		});
	}

	const manifest = {
		schemaVersion: "suite.autodesk.acade.regression-fixture-stage.v1",
		generatedAt: new Date().toISOString(),
		sourcePlan: {
			schemaVersion: plan.schemaVersion,
			generatedAt: plan.generatedAt,
		},
		stageRoot: toPosix(stageRoot),
		fixtures: stagedFixtures,
	};
	const manifestPath = path.join(stageRoot, "manifest.json");
	await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
	return {
		manifest,
		manifestPath,
		stageRoot,
		fixtures: stagedFixtures,
	};
}

async function runCli() {
	const args = parseArgs();
	const result = await stageRegressionFixtures({
		acadeRoot: args.acadeRoot,
		stageRoot: args.stageRoot,
		fixtureIds: args.fixtureIds,
	});
	console.log(`Staged ${result.fixtures.length} fixture(s) into ${result.stageRoot}`);
	console.log(`Manifest: ${result.manifestPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to stage AutoCAD Electrical regression fixtures:", error);
		process.exit(1);
	});
}

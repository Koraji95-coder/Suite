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
	"autocad-electrical-2026-lookup-index.generated.json",
);
const LOOKUP_INDEX_SCHEMA_VERSION = "suite.autodesk.acade.lookup-index.v1";

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

function slugify(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

function toPosix(filePath) {
	return String(filePath || "").replaceAll("\\", "/");
}

function previewTable(table) {
	return {
		name: normalizeText(table.name),
		type: normalizeText(table.type) || "TABLE",
		columnCount: Number(table.columnCount || 0),
		columns: (table.columns || []).map((column) => normalizeText(column)).filter(Boolean),
	};
}

function lookupRoleInfo(fileName) {
	const normalized = String(fileName || "").toLowerCase();
	if (normalized === "default_cat.mdb") {
		return {
			id: "default_cat",
			roleId: "catalog_lookup",
			roleLabel: "Catalog Lookup",
			label: "Default Catalog",
			description:
				"Primary catalog, family, and footprint lookup source for ACADE component selection.",
			isOptional: false,
		};
	}
	if (normalized === "ace_plc.mdb") {
		return {
			id: "ace_plc",
			roleId: "plc_lookup",
			roleLabel: "PLC Lookup",
			label: "ACE PLC",
			description:
				"PLC manufacturer and style lookup source used by spreadsheet-to-PLC workflows.",
			isOptional: false,
		};
	}
	if (normalized === "wdviacmp.mdb") {
		return {
			id: "wdviacmp",
			roleId: "via_component_lookup",
			roleLabel: "Via Component Lookup",
			label: "Via Component Mapping",
			description:
				"Via-component mapping surface used for component and attribute swap relationships.",
			isOptional: false,
		};
	}
	if (normalized === "footprint_lookup.mdb") {
		return {
			id: "footprint_lookup",
			roleId: "footprint_lookup",
			roleLabel: "Footprint Lookup",
			label: "Footprint Lookup",
			description:
				"Optional footprint lookup payload present on some workstations and sometimes empty.",
			isOptional: true,
		};
	}

	const stem = path.basename(fileName, path.extname(fileName));
	return {
		id: slugify(stem) || "lookup-database",
		roleId: "other_lookup",
		roleLabel: "Other Lookup",
		label: normalizeText(stem) || "Lookup Database",
		description: "Read-only Autodesk lookup database surfaced from the local ACADE install.",
		isOptional: false,
	};
}

function recommendedDefaults(databases) {
	const availableIds = new Set(databases.map((database) => database.id));
	return {
		catalog: availableIds.has("default_cat") ? "default_cat" : "",
		plc: availableIds.has("ace_plc") ? "ace_plc" : "",
		viaComponent: availableIds.has("wdviacmp") ? "wdviacmp" : "",
	};
}

export function buildLookupIndexFromInstallationSummary(summary) {
	const databases = (summary.databaseInventories || [])
		.map((database) => {
			const fileName = path.basename(String(database.filePath || ""));
			const role = lookupRoleInfo(fileName);
			const tables = (database.tables || [])
				.map((table) => previewTable(table))
				.sort((left, right) => left.name.localeCompare(right.name));
			const interestingTables = (database.interestingTables || [])
				.map((table) => previewTable(table))
				.sort((left, right) => left.name.localeCompare(right.name));
			const tableNames = tables.map((table) => table.name);
			return {
				id: role.id,
				fileName,
				filePath: toPosix(database.filePath),
				roleId: role.roleId,
				roleLabel: role.roleLabel,
				label: role.label,
				description: role.description,
				isOptional: Boolean(role.isOptional),
				hasError: Boolean(database.error),
				error: normalizeText(database.error),
				tableCount: Number(database.tableCount || tables.length),
				interestingTableCount: interestingTables.length,
				tableNames,
				interestingTables,
				tables,
			};
		})
		.sort((left, right) => {
			const roleDelta = left.roleLabel.localeCompare(right.roleLabel);
			if (roleDelta !== 0) {
				return roleDelta;
			}
			return left.fileName.localeCompare(right.fileName);
		});

	const rolesById = new Map();
	for (const database of databases) {
		const existing =
			rolesById.get(database.roleId) ||
			{
				id: database.roleId,
				label: database.roleLabel,
				databaseCount: 0,
				tableCount: 0,
				fileNames: [],
				databaseIds: [],
				includesOptional: false,
			};
		existing.databaseCount += 1;
		existing.tableCount += database.tableCount;
		existing.fileNames = unique([...existing.fileNames, database.fileName]).sort((left, right) =>
			left.localeCompare(right),
		);
		existing.databaseIds = unique([...existing.databaseIds, database.id]).sort((left, right) =>
			left.localeCompare(right),
		);
		existing.includesOptional = existing.includesOptional || database.isOptional;
		rolesById.set(database.roleId, existing);
	}

	const roles = [...rolesById.values()].sort((left, right) => left.label.localeCompare(right.label));

	return {
		schemaVersion: LOOKUP_INDEX_SCHEMA_VERSION,
		generatedAt: summary.generatedAt,
		source: {
			installationContext:
				"docs/development/autocad-electrical-2026-installation-context-reference.md",
			installationContextYaml:
				"docs/development/autocad-electrical-2026-installation-context.generated.yaml",
			menuIndex:
				"docs/development/autocad-electrical-2026-menu-index.generated.json",
			integrationPlaybook:
				"docs/development/autocad-electrical-2026-suite-integration-playbook.md",
		},
		counts: {
			databases: databases.length,
			roles: roles.length,
			tables: databases.reduce((sum, database) => sum + database.tableCount, 0),
			databasesWithErrors: databases.filter((database) => database.hasError).length,
		},
		availableRoleIds: roles.map((role) => role.id),
		recommendedDefaults: recommendedDefaults(databases),
		roles,
		databases,
	};
}

export async function buildLookupIndexFromAcadeRoot(acadeRoot, options = {}) {
	const summary =
		options.summary ||
		(await buildInstallationContextSummaryFromAcadeRoot(
			acadeRoot || DEFAULT_ACADE_ROOT,
			options,
		));
	return buildLookupIndexFromInstallationSummary(summary);
}

async function runCli() {
	const acadeRoot =
		readCliArg("--acade-root") ||
		process.env.SUITE_AUTODESK_ACADE_ROOT ||
		DEFAULT_ACADE_ROOT;
	const outputPath = readCliArg("--output") || DEFAULT_OUTPUT_PATH;
	const payload = await buildLookupIndexFromAcadeRoot(acadeRoot);
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, `${JSON.stringify(payload, null, "\t")}\n`, "utf8");
	console.log(`Generated ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate AutoCAD Electrical lookup index:", error);
		process.exit(1);
	});
}

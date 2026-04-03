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
	"autocad-electrical-2026-menu-index.generated.json",
);
const MENU_INDEX_SCHEMA_VERSION = "suite.autodesk.acade.menu-index.v1";

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

function topCategories(menu, count = 8) {
	return (menu.topLevelEntries || [])
		.map((entry) => normalizeText(entry.label))
		.filter(Boolean)
		.slice(0, count);
}

function classifyMenuKind(fileName) {
	const normalized = String(fileName || "").toUpperCase();
	if (normalized.includes("PANEL") || normalized === "WD_PMENU.DAT") {
		return "panel";
	}
	if (
		normalized.includes("PID") ||
		normalized.includes("HYD") ||
		normalized.includes("PNEU")
	) {
		return "process";
	}
	if (normalized.includes("LOCS")) {
		return "utility";
	}
	if (
		normalized.endsWith("_MENU.DAT") ||
		normalized === "WD_MENU.DAT" ||
		normalized === "IEC_MENU.DAT"
	) {
		return "schematic";
	}
	return "other";
}

function menuFamilyInfo(fileName, kind) {
	const normalized = String(fileName || "").toUpperCase();
	if (normalized.includes("IEC-60617")) {
		return { id: "iec_60617", label: "IEC 60617" };
	}
	if (normalized.includes("ACE_IEC_MENU")) {
		return { id: "iec", label: "IEC" };
	}
	if (normalized.includes("ACE_IEEE")) {
		return { id: "ieee", label: "IEEE" };
	}
	if (normalized.includes("ACE_JIC")) {
		return { id: "jic", label: "JIC" };
	}
	if (normalized.includes("ACE_JIS")) {
		return { id: "jis", label: "JIS" };
	}
	if (normalized.includes("ACE_NFPA")) {
		return { id: "nfpa", label: "NFPA" };
	}
	if (normalized.includes("ACE_GB")) {
		return { id: "gb", label: "GB" };
	}
	if (normalized.includes("ACE_AS")) {
		return { id: "as", label: "AS" };
	}
	if (normalized.includes("ACE_PANEL")) {
		return { id: "panel_layout", label: "Panel Layout" };
	}
	if (normalized.includes("ACE_PID")) {
		return { id: "pid", label: "P&ID" };
	}
	if (normalized.includes("ACE_HYD")) {
		return { id: "hydraulic", label: "Hydraulic" };
	}
	if (normalized.includes("ACE_PNEU")) {
		return { id: "pneumatic", label: "Pneumatic" };
	}
	if (normalized === "WD_MENU.DAT") {
		return { id: "legacy_jic", label: "Legacy JIC" };
	}
	if (normalized === "IEC_MENU.DAT") {
		return { id: "legacy_iec", label: "Legacy IEC" };
	}
	if (normalized === "WD_PMENU.DAT") {
		return { id: "legacy_panel", label: "Legacy Panel" };
	}
	if (normalized === "WD_PNEU_MENU.DAT") {
		return { id: "legacy_pneumatic", label: "Legacy Pneumatic" };
	}
	if (normalized === "WD_LOCS.DAT") {
		return { id: "location_symbols", label: "Location Symbols" };
	}
	return {
		id: slugify(`${kind}-${fileName}`) || `menu-${kind || "other"}`,
		label: normalizeText(path.basename(fileName, path.extname(fileName))) || "Menu",
	};
}

function recommendedDefaults(menus) {
	const availableFamilyIds = new Set(menus.map((menu) => menu.familyId));
	const pick = (ids) => ids.filter((id) => availableFamilyIds.has(id));

	return {
		schematic: pick(["jic", "nfpa", "iec_60617", "iec"]),
		panel: pick(["panel_layout", "legacy_panel"]),
		process: pick(["pid", "hydraulic", "pneumatic"]),
		utility: pick(["location_symbols"]),
	};
}

export function buildMenuIndexFromInstallationSummary(summary) {
	const menus = (summary.menuSummaries || [])
		.map((menu) => {
			const kind = classifyMenuKind(menu.fileName);
			const family = menuFamilyInfo(menu.fileName, kind);
			const categories = topCategories(menu);
			return {
				id: slugify(menu.fileName),
				fileName: menu.fileName,
				kind,
				familyId: family.id,
				familyLabel: family.label,
				isLegacy: family.id.startsWith("legacy_"),
				title: normalizeText(menu.firstPageTitle),
				pageCount: Number(menu.pageCount || 0),
				totalEntryCount: Number(menu.totalEntryCount || 0),
				submenuCount: Number(menu.submenuCount || 0),
				commandActionCount: Number(menu.commandActionCount || 0),
				symbolInsertCount: Number(menu.symbolInsertCount || 0),
				topCategories: categories,
			};
		})
		.sort((left, right) => {
			const kindDelta = left.kind.localeCompare(right.kind);
			if (kindDelta !== 0) {
				return kindDelta;
			}
			const familyDelta = left.familyLabel.localeCompare(right.familyLabel);
			if (familyDelta !== 0) {
				return familyDelta;
			}
			return left.fileName.localeCompare(right.fileName);
		});

	const familiesById = new Map();
	for (const menu of menus) {
		const existing =
			familiesById.get(menu.familyId) ||
			{
				id: menu.familyId,
				label: menu.familyLabel,
				kind: menu.kind,
				menuCount: 0,
				totalEntryCount: 0,
				totalSymbolInsertCount: 0,
				topCategories: [],
				fileNames: [],
				includesLegacy: false,
			};
		existing.menuCount += 1;
		existing.totalEntryCount += menu.totalEntryCount;
		existing.totalSymbolInsertCount += menu.symbolInsertCount;
		existing.topCategories = unique([...existing.topCategories, ...menu.topCategories]).slice(0, 10);
		existing.fileNames = [...existing.fileNames, menu.fileName].sort((left, right) =>
			left.localeCompare(right),
		);
		existing.includesLegacy = existing.includesLegacy || menu.isLegacy;
		familiesById.set(menu.familyId, existing);
	}

	const families = [...familiesById.values()].sort((left, right) => {
		const kindDelta = left.kind.localeCompare(right.kind);
		if (kindDelta !== 0) {
			return kindDelta;
		}
		return left.label.localeCompare(right.label);
	});
	const standards = families.filter((family) => family.kind === "schematic");

	return {
		schemaVersion: MENU_INDEX_SCHEMA_VERSION,
		generatedAt: summary.generatedAt,
		source: {
			installationContext:
				"docs/development/autocad-electrical-2026-installation-context-reference.md",
			installationContextYaml:
				"docs/development/autocad-electrical-2026-installation-context.generated.yaml",
			integrationPlaybook:
				"docs/development/autocad-electrical-2026-suite-integration-playbook.md",
		},
		counts: {
			menus: menus.length,
			families: families.length,
			standards: standards.length,
			byKind: {
				schematic: menus.filter((menu) => menu.kind === "schematic").length,
				panel: menus.filter((menu) => menu.kind === "panel").length,
				process: menus.filter((menu) => menu.kind === "process").length,
				utility: menus.filter((menu) => menu.kind === "utility").length,
				other: menus.filter((menu) => menu.kind === "other").length,
			},
		},
		availableKinds: unique(menus.map((menu) => menu.kind)),
		families,
		standards,
		recommendedDefaults: recommendedDefaults(menus),
		menus,
	};
}

export async function buildMenuIndexFromAcadeRoot(acadeRoot, options = {}) {
	const summary =
		options.summary ||
		(await buildInstallationContextSummaryFromAcadeRoot(
			acadeRoot || DEFAULT_ACADE_ROOT,
			options,
		));
	return buildMenuIndexFromInstallationSummary(summary);
}

async function runCli() {
	const acadeRoot =
		readCliArg("--acade-root") ||
		process.env.SUITE_AUTODESK_ACADE_ROOT ||
		DEFAULT_ACADE_ROOT;
	const outputPath = readCliArg("--output") || DEFAULT_OUTPUT_PATH;
	const payload = await buildMenuIndexFromAcadeRoot(acadeRoot);
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, `${JSON.stringify(payload, null, "\t")}\n`, "utf8");
	console.log(`Generated ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate AutoCAD Electrical menu index:", error);
		process.exit(1);
	});
}

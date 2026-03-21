import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const scanExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

const useThemeAllowlist = new Set(["src/lib/palette.ts"].map(normalizeRelPath));

const visualInlineStyleAllowlist = new Set(
	[
		"src/routes/LoginPage.tsx",
		"src/routes/SignupPage.tsx",
		"src/routes/ProtectedRoute.tsx",
		"src/routes/agent/AgentPairingCallbackPage.tsx",
		"src/auth/AuthEnvDebugCard.tsx",
		"src/components/apps/autodraft-studio/AutoDraftComparePanel.tsx",
		"src/components/apps/dashboard/StatsCards.tsx",
		"src/components/apps/projects/ProjectCard.tsx",
		"src/components/apps/projects/ProjectFormModal.tsx",
		"src/components/apps/conduit-route/ConduitRouteApp.tsx",
		"src/components/apps/conduit-route/ConduitTerminalWorkflow.tsx",
		"src/components/apps/ground-grid-generator/GridBackground.tsx",
		"src/components/apps/ground-grid-generator/GridGeneratorDataColumn.tsx",
		"src/components/apps/ground-grid-generator/GridGeneratorDataDropzone.tsx",
		"src/components/apps/ground-grid-generator/GridGeneratorDataPreviewTables.tsx",
		"src/components/apps/ground-grid-generator/GridGeneratorPastePanel.tsx",
		"src/components/apps/ground-grid-generator/GridGeneratorPreviewColumn.tsx",
		"src/components/apps/ground-grid-generator/GridGeneratorTopBar.tsx",
		"src/components/apps/ground-grid-generator/GridManualEditorCanvas.tsx",
		"src/components/apps/ground-grid-generator/GridManualEditorTables.tsx",
		"src/components/apps/ground-grid-generator/GridManualEditorToolbar.tsx",
		"src/components/apps/ground-grid-generator/GridOverlayCard.tsx",
		"src/components/apps/ground-grid-generator/GridPreviewOverlay.tsx",
		"src/components/apps/ground-grid-generator/GridPreviewSvg.tsx",
		"src/components/apps/ground-grid-generator/PotentialContourOverlay.tsx",
		"src/components/apps/coordinatesgrabber/CoordinatesGrabberConfigTab.tsx",
		"src/components/apps/coordinatesgrabber/CoordinatesGrabberExportTab.tsx",
		"src/components/apps/coordinatesgrabber/CoordinatesGrabberLayerSearchPanels.tsx",
		"src/components/apps/coordinatesgrabber/CoordinatesGrabberValidationPanel.tsx",
		"src/routes/CommandCenterPage.tsx",
		"src/routes/settings/SettingsPage.tsx",
		"src/routes/settings/AccountSettings.tsx",
		"src/routes/settings/EmailConfig.tsx",
		"src/components/agent/AgentOrchestrationPanel.tsx",
	].map(normalizeRelPath),
);

const visualInlineStyleAllowlistPrefixes = [
	"src/components/apps/ground-grid-generator/",
	"src/components/apps/watchdog/",
].map(normalizeRelPath);

const DISALLOWED_VISUAL_STYLE_PATTERNS = [
	/\bbackground(?:Color|Image)?\s*:/,
	/\bcolor\s*:/,
	/\bborder(?:Color|Top|Right|Bottom|Left)?\s*:/,
	/\bboxShadow\s*:/,
	/\bfilter\s*:/,
	/\bbackdropFilter\s*:/,
	/\bWebkitBackdropFilter\s*:/,
	/linear-gradient\s*\(/,
	/radial-gradient\s*\(/,
];

function normalizeRelPath(filePath) {
	return path.normalize(filePath);
}

function listFilesRecursively(startPath) {
	const result = [];
	if (!fs.existsSync(startPath)) return result;

	const stack = [startPath];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;
		const stat = fs.statSync(current);
		if (stat.isDirectory()) {
			for (const entry of fs.readdirSync(current)) {
				stack.push(path.join(current, entry));
			}
			continue;
		}
		if (!scanExtensions.has(path.extname(current))) continue;
		result.push(current);
	}

	return result;
}

function lineNumberForIndex(text, index) {
	let line = 1;
	for (let cursor = 0; cursor < index; cursor += 1) {
		if (text[cursor] === "\n") {
			line += 1;
		}
	}
	return line;
}

function collectUseThemeViolations(relPath, text) {
	if (useThemeAllowlist.has(relPath)) {
		return [];
	}

	const violations = [];
	const pattern = /\buseTheme\s*\(/g;
	for (const match of text.matchAll(pattern)) {
		const index = match.index ?? -1;
		if (index < 0) continue;
		violations.push({
			file: relPath,
			line: lineNumberForIndex(text, index),
			message:
				"useTheme() is legacy-only. Use CSS tokens or useResolvedAppearance() on new surfaces.",
		});
	}

	return violations;
}

function isVisualInlineAllowlisted(relPath) {
	if (visualInlineStyleAllowlist.has(relPath)) {
		return true;
	}
	return visualInlineStyleAllowlistPrefixes.some((prefix) =>
		relPath.startsWith(prefix),
	);
}

function collectInlineStyleViolations(relPath, text) {
	if (isVisualInlineAllowlisted(relPath)) {
		return [];
	}

	const violations = [];
	const pattern = /style\s*=\s*\{\s*\{([\s\S]*?)\}\s*\}/g;
	for (const match of text.matchAll(pattern)) {
		const index = match.index ?? -1;
		if (index < 0) continue;
		const styleBody = match[1] ?? "";
		const hasVisualStyle = DISALLOWED_VISUAL_STYLE_PATTERNS.some((candidate) =>
			candidate.test(styleBody),
		);
		if (!hasVisualStyle) {
			continue;
		}
		violations.push({
			file: relPath,
			line: lineNumberForIndex(text, index),
			message:
				"Visual inline style properties are blocked outside the legacy allowlist. Move styling into CSS Modules/shared tokens or the approved appearance bridge.",
		});
	}

	return violations;
}

if (!fs.existsSync(srcRoot)) {
	console.error("guard-appearance-debt: src/ not found at repo root.");
	process.exit(1);
}

const violations = [];
for (const filePath of listFilesRecursively(srcRoot)) {
	const relPath = normalizeRelPath(path.relative(root, filePath));
	let text = "";
	try {
		text = fs.readFileSync(filePath, "utf8");
	} catch {
		continue;
	}

	violations.push(...collectUseThemeViolations(relPath, text));
	violations.push(...collectInlineStyleViolations(relPath, text));
}

if (violations.length === 0) {
	process.exit(0);
}

console.error(
	"Appearance debt guard failed. Keep new appearance work on CSS Modules/shared tokens and contain legacy useTheme() surfaces.",
);
for (const violation of violations) {
	console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
}
process.exit(1);

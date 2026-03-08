import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");

if (!fs.existsSync(packageJsonPath)) {
	console.error("guard-no-tailwind: package.json not found at repo root.");
	process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const dependencyBlocks = [
	pkg.dependencies ?? {},
	pkg.devDependencies ?? {},
	pkg.peerDependencies ?? {},
	pkg.optionalDependencies ?? {},
];

const bannedDependencyPatterns = [
	/^tailwindcss$/,
	/^tailwind-merge$/,
	/^@tailwindcss\//,
];

const bannedDependencies = new Set();
for (const deps of dependencyBlocks) {
	for (const name of Object.keys(deps)) {
		if (bannedDependencyPatterns.some((pattern) => pattern.test(name))) {
			bannedDependencies.add(name);
		}
	}
}

const bannedRootFiles = [
	"tailwind.config.js",
	"tailwind.config.cjs",
	"tailwind.config.mjs",
	"tailwind.config.ts",
];

const presentBannedRootFiles = bannedRootFiles.filter((file) =>
	fs.existsSync(path.join(root, file)),
);

const scanFolders = ["src", "backend", "dotnet", "scripts", "docs"];
const scanExtensions = new Set([
	".css",
	".js",
	".jsx",
	".ts",
	".tsx",
	".mjs",
	".cjs",
]);

const bannedContentPatterns = [
	{
		id: "tailwind-import",
		pattern: /@import\s+["']tailwindcss["']/,
		message: 'contains `@import "tailwindcss"`',
	},
	{
		id: "tailwind-theme-directive",
		pattern: /@theme\b/,
		message: "contains `@theme` directive",
	},
	{
		id: "tailwind-merge-import",
		pattern: /from\s+["']tailwind-merge["']|require\s*\(\s*["']tailwind-merge["']\s*\)/,
		message: "imports `tailwind-merge`",
	},
	{
		id: "tailwind-postcss-plugin",
		pattern: /@tailwindcss\/postcss/,
		message: "references `@tailwindcss/postcss`",
	},
];

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
				const next = path.join(current, entry);
				const rel = path.relative(root, next);
				if (rel.startsWith(`zeroclaw-main${path.sep}`)) continue;
				if (rel.startsWith(`node_modules${path.sep}`)) continue;
				if (rel.startsWith(`dist${path.sep}`)) continue;
				if (rel.startsWith(`.git${path.sep}`)) continue;
				stack.push(next);
			}
			continue;
		}
		if (!scanExtensions.has(path.extname(current))) continue;
		result.push(current);
	}
	return result;
}

const contentViolations = [];
const thisScriptRelPath = path.normalize(
	path.relative(root, fileURLToPath(import.meta.url)),
);
for (const folder of scanFolders) {
	const abs = path.join(root, folder);
	for (const filePath of listFilesRecursively(abs)) {
		const relPath = path.normalize(path.relative(root, filePath));
		if (relPath === thisScriptRelPath) continue;
		let text = "";
		try {
			text = fs.readFileSync(filePath, "utf8");
		} catch {
			continue;
		}
		for (const rule of bannedContentPatterns) {
			if (rule.pattern.test(text)) {
				contentViolations.push({
					file: relPath,
					message: rule.message,
				});
			}
		}
	}
}

if (
	bannedDependencies.size === 0 &&
	presentBannedRootFiles.length === 0 &&
	contentViolations.length === 0
) {
	process.exit(0);
}

console.error(
	"Tailwind usage is blocked for the Suite app. Use global CSS + CSS Modules.",
);

if (bannedDependencies.size > 0) {
	console.error(
		`Remove these dependencies: ${Array.from(bannedDependencies).join(", ")}`,
	);
}

if (presentBannedRootFiles.length > 0) {
	console.error(
		`Remove these config files: ${presentBannedRootFiles.join(", ")}`,
	);
}

if (contentViolations.length > 0) {
	console.error("Remove these Tailwind references:");
	for (const violation of contentViolations) {
		console.error(`- ${violation.file}: ${violation.message}`);
	}
}

process.exit(1);

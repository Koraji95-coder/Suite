import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanFolders = ["src", "dotnet"];
const scanExtensions = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".cs",
	".css",
]);

const legacyReleaseStateAllowList = new Set([
	path.normalize("src/lib/audience.ts"),
]);

const operationsRouteAllowList = new Set([
	path.normalize("src/App.tsx"),
	path.normalize("src/routes/appShellMeta.ts"),
]);

const staleStringRules = [
	{
		pattern: /\bshowDeveloperMeta\b/,
		message:
			"legacy Apps Hub developer-meta branch found; Apps Hub must stay product-only",
	},
	{
		pattern: /\bOpen Operations\b/,
		message:
			"legacy Operations copy found; use Developer Portal wording instead",
	},
	{
		pattern: /\bProject Operations\b/,
		message:
			"legacy project-operations copy found; use project delivery workflow wording instead",
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
				if (rel.startsWith(`node_modules${path.sep}`)) continue;
				if (rel.startsWith(`dist${path.sep}`)) continue;
				if (rel.startsWith(`.git${path.sep}`)) continue;
				const relSegments = rel.split(path.sep);
				if (relSegments.includes("bin")) continue;
				if (relSegments.includes("obj")) continue;
				stack.push(next);
			}
			continue;
		}

		if (!scanExtensions.has(path.extname(current))) continue;
		result.push(current);
	}

	return result;
}

const violations = [];

for (const folder of scanFolders) {
	for (const filePath of listFilesRecursively(path.join(root, folder))) {
		const relPath = path.normalize(path.relative(root, filePath));
		const text = fs.readFileSync(filePath, "utf8");

		if (
			text.includes("internal_beta") &&
			!legacyReleaseStateAllowList.has(relPath)
		) {
			violations.push({
				file: relPath,
				message:
					"legacy `internal_beta` release-state value is only allowed at the normalization boundary",
			});
		}

		if (
			text.includes("/app/operations") &&
			!operationsRouteAllowList.has(relPath)
		) {
			violations.push({
				file: relPath,
				message:
					"`/app/operations` is compatibility-only and should only live in the redirect route or shell meta",
			});
		}

		for (const rule of staleStringRules) {
			if (rule.pattern.test(text)) {
				violations.push({
					file: relPath,
					message: rule.message,
				});
			}
		}
	}
}

if (violations.length === 0) {
	process.exit(0);
}

console.error(
	"Suite structural split guards failed. Remove legacy workshop/product split residue from live codepaths.",
);
for (const violation of violations) {
	console.error(`- ${violation.file}: ${violation.message}`);
}
process.exit(1);

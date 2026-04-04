import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const scanFolders = ["src", "backend", "dotnet", "tools"];
const targetedFiles = [
	"AGENTS.md",
	"README.md",
	"docs/README.md",
];
const scanExtensions = new Set([
	".js",
	".jsx",
	".ts",
	".tsx",
	".mjs",
	".cjs",
	".py",
	".cs",
	".json",
	".md",
]);

const bannedContentPatterns = [
	{
		pattern: /zeroclaw-main[\\/]+web\b/i,
		message:
			"references `zeroclaw-main/web`; keep ZeroClaw web assets isolated from Suite codepaths",
	},
	{
		pattern: /agent-office\.html\b/i,
		message:
			"references `agent-office.html`; keep ZeroClaw workshop artifacts as reference-only",
	},
	{
		pattern: /\bSUITE_GATEWAY_USE_FULL_CLI\b/,
		message:
			"references the retired `SUITE_GATEWAY_USE_FULL_CLI` toggle; keep it out of active Suite docs and tooling",
	},
	{
		pattern: /run-legacy-zeroclaw-gateway\.mjs\b/i,
		message:
			"references `run-legacy-zeroclaw-gateway.mjs`; keep the removed legacy launcher out of active Suite docs and tooling",
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
const thisScriptRelPath = path.normalize(
	path.relative(root, fileURLToPath(import.meta.url)),
);

for (const folder of scanFolders) {
	const folderPath = path.join(root, folder);
	for (const filePath of listFilesRecursively(folderPath)) {
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
				violations.push({
					file: relPath,
					message: rule.message,
				});
			}
		}
	}
}

for (const relativePath of targetedFiles) {
	const filePath = path.join(root, relativePath);
	if (!fs.existsSync(filePath)) continue;
	let text = "";
	try {
		text = fs.readFileSync(filePath, "utf8");
	} catch {
		continue;
	}

	for (const rule of bannedContentPatterns) {
		if (rule.pattern.test(text)) {
			violations.push({
				file: path.normalize(relativePath),
				message: rule.message,
			});
		}
	}
}

if (violations.length === 0) {
	process.exit(0);
}

console.error(
	"ZeroClaw isolation is enforced for Suite codepaths. Keep ZeroClaw web/workshop artifacts isolated and reference-only.",
);
console.error("Remove these references:");
for (const violation of violations) {
	console.error(`- ${violation.file}: ${violation.message}`);
}
process.exit(1);

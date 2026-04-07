import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// Expand this list as more route groups are remediated and covered by the
// focused security pytest slice.
const monitoredFiles = [
	"backend/route_groups/api_auth_email_support.py",
	"backend/route_groups/api_autodraft.py",
	"backend/route_groups/api_automation_recipes.py",
	"backend/route_groups/api_batch_find_replace.py",
	"backend/route_groups/api_drawing_program.py",
	"backend/route_groups/api_health.py",
	"backend/route_groups/api_terminal_authoring.py",
	"backend/route_groups/api_transmittal.py",
	"backend/route_groups/api_transmittal_render.py",
	"backend/route_groups/api_watchdog.py",
	"backend/route_groups/api_work_ledger.py",
].map((relPath) => path.join(root, relPath));

const disallowedPatterns = [
	{
		pattern: /["']error["']\s*:\s*str\(exc\)/g,
		message: "HTTP error payloads must not echo raw exception text.",
	},
	{
		pattern: /["']message["']\s*:\s*str\(exc\)/g,
		message: "HTTP message payloads must not echo raw exception text.",
	},
	{
		pattern: /f["'][^\r\n]*\{str\(exc\)\}[^\r\n]*["']/g,
		message: "Response strings must not interpolate raw exception text.",
	},
	{
		pattern: /warnings\.append\(str\(exc\)\)/g,
		message: "Warnings returned to clients must not echo raw exception text.",
	},
];

function lineNumberForIndex(text, index) {
	let line = 1;
	for (let cursor = 0; cursor < index; cursor += 1) {
		if (text[cursor] === "\n") {
			line += 1;
		}
	}
	return line;
}

const violations = [];

for (const filePath of monitoredFiles) {
	if (!fs.existsSync(filePath)) {
		continue;
	}
	const relPath = path.relative(root, filePath);
	const text = fs.readFileSync(filePath, "utf8");
	for (const { pattern, message } of disallowedPatterns) {
		for (const match of text.matchAll(pattern)) {
			const index = match.index ?? -1;
			if (index < 0) {
				continue;
			}
			const line = lineNumberForIndex(text, index);
			const snippet = String(match[0] ?? "").trim();
			violations.push({
				file: relPath,
				line,
				message,
				snippet,
			});
		}
	}
}

if (violations.length === 0) {
	process.exit(0);
}

console.error(
	"Backend route security guard failed. Sanitize route responses instead of exposing raw exception text.",
);
for (const violation of violations) {
	console.error(
		`- ${violation.file}:${violation.line} ${violation.message} Found: ${violation.snippet}`,
	);
}
process.exit(1);

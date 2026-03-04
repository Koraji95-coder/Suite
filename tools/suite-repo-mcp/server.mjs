#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const SERVER_INFO = {
	name: "suite-repo-mcp",
	version: "0.1.0",
};

const MAX_OUTPUT_CHARS = 200_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const SOURCE_EXTENSIONS = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".py",
	".sql",
];

function toPosix(value) {
	return value.split(path.sep).join("/");
}

function repoRelative(absPath) {
	return toPosix(path.relative(REPO_ROOT, absPath));
}

function createTextResult(text, isError = false) {
	return {
		content: [{ type: "text", text }],
		isError,
	};
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function pascalCase(value) {
	const cleaned = value.replace(/[^a-zA-Z0-9]+/g, " ").trim();
	if (!cleaned) return "Generated";
	return cleaned
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

function timestampForMigration(date = new Date()) {
	const y = String(date.getUTCFullYear());
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const mm = String(date.getUTCMinutes()).padStart(2, "0");
	const ss = String(date.getUTCSeconds()).padStart(2, "0");
	return `${y}${m}${d}_${hh}${mm}${ss}`;
}

function resolveRepoPath(inputPath) {
	if (typeof inputPath !== "string" || !inputPath.trim()) {
		throw new Error("A non-empty repo path is required.");
	}
	const absPath = path.resolve(REPO_ROOT, inputPath);
	if (absPath !== REPO_ROOT && !absPath.startsWith(`${REPO_ROOT}${path.sep}`)) {
		throw new Error(`Path escapes repository root: ${inputPath}`);
	}
	return absPath;
}

async function exists(absPath) {
	try {
		await fs.access(absPath);
		return true;
	} catch {
		return false;
	}
}

async function statSafe(absPath) {
	try {
		return await fs.stat(absPath);
	} catch {
		return null;
	}
}

async function readJson(absPath) {
	const text = await fs.readFile(absPath, "utf8");
	return JSON.parse(text);
}

function trimOutput(text) {
	if (!text) return "";
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	return text.slice(-MAX_OUTPUT_CHARS);
}

function formatCommand(command, args) {
	return [command, ...(args || [])].join(" ");
}

function runProcess(command, args = [], options = {}) {
	const {
		cwd = REPO_ROOT,
		env = process.env,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	} = options;

	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				child.kill("SIGTERM");
			} catch {
				// ignore
			}
			setTimeout(() => {
				if (!settled) {
					try {
						child.kill("SIGKILL");
					} catch {
						// ignore
					}
				}
			}, 1200);
		}, timeoutMs);

		child.stdout.on("data", (chunk) => {
			stdout = trimOutput(stdout + chunk.toString("utf8"));
		});
		child.stderr.on("data", (chunk) => {
			stderr = trimOutput(stderr + chunk.toString("utf8"));
		});

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				ok: false,
				code: null,
				timedOut,
				stdout,
				stderr: trimOutput(`${stderr}\n${String(error.message || error)}`),
				command: formatCommand(command, args),
			});
		});

		child.on("close", (code, signal) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				ok: code === 0 && !timedOut,
				code,
				signal,
				timedOut,
				stdout,
				stderr,
				command: formatCommand(command, args),
			});
		});
	});
}

async function commandExists(command) {
	const result = await runProcess("which", [command], { timeoutMs: 4000 });
	return result.ok;
}

async function walkFiles(rootAbsPath, maxDepth = 20) {
	const out = [];
	const stack = [{ abs: rootAbsPath, depth: 0 }];
	const skipDirNames = new Set([
		".git",
		"node_modules",
		"dist",
		"build",
		"coverage",
		"target",
		".next",
		".turbo",
		".venv",
		"venv",
		"__pycache__",
	]);

	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		let entries = [];
		try {
			entries = await fs.readdir(current.abs, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const child = path.join(current.abs, entry.name);
			if (entry.isDirectory()) {
				if (skipDirNames.has(entry.name)) continue;
				if (current.depth < maxDepth) {
					stack.push({ abs: child, depth: current.depth + 1 });
				}
				continue;
			}
			if (entry.isFile()) out.push(child);
		}
	}

	return out;
}

async function findSlnFiles() {
	const files = await walkFiles(REPO_ROOT, 4);
	return files.filter((file) => file.endsWith(".sln"));
}

async function loadPackageJsonSafe() {
	const packagePath = path.join(REPO_ROOT, "package.json");
	if (!(await exists(packagePath))) return null;
	try {
		return await readJson(packagePath);
	} catch {
		return null;
	}
}

function normalizePathList(value) {
	if (!value) return ["src", "backend", "docs"];
	if (Array.isArray(value)) {
		return value
			.filter((item) => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? [trimmed] : ["src", "backend", "docs"];
	}
	return ["src", "backend", "docs"];
}

function parseSchemaArg(schemaArg) {
	if (!schemaArg) return null;
	if (typeof schemaArg === "string") {
		try {
			return JSON.parse(schemaArg);
		} catch {
			return { raw: schemaArg };
		}
	}
	if (typeof schemaArg === "object") return schemaArg;
	return null;
}

function summarizeResult(result) {
	const lines = [];
	lines.push(`Command: ${result.command}`);
	lines.push(
		`Exit: ${String(result.code)}${result.timedOut ? " (timed out)" : ""}`,
	);
	if (result.stdout?.trim()) {
		lines.push("\nstdout:\n" + result.stdout.trim());
	}
	if (result.stderr?.trim()) {
		lines.push("\nstderr:\n" + result.stderr.trim());
	}
	return lines.join("\n");
}

async function toolRunTests(args = {}) {
	const runner = String(args.runner || "auto").toLowerCase();
	const target = typeof args.target === "string" ? args.target.trim() : "";
	const pkg = await loadPackageJsonSafe();

	let selectedRunner = runner;
	if (selectedRunner === "auto") {
		if (pkg?.scripts?.test) {
			selectedRunner = "npm";
		} else if (
			(await exists(path.join(REPO_ROOT, "pytest.ini"))) ||
			(await exists(path.join(REPO_ROOT, "tests"))) ||
			(await exists(path.join(REPO_ROOT, "backend/tests")))
		) {
			selectedRunner = "pytest";
		} else {
			const slnFiles = await findSlnFiles();
			if (slnFiles.length > 0) {
				selectedRunner = "dotnet";
			} else {
				throw new Error(
					"No test runner detected. Add a test script to package.json, pytest config, or a .sln file.",
				);
			}
		}
	}

	if (!["npm", "pytest", "dotnet"].includes(selectedRunner)) {
		throw new Error(`Unsupported runner: ${selectedRunner}`);
	}

	let result;
	if (selectedRunner === "npm") {
		const commandArgs = ["run", "test"];
		if (target) commandArgs.push("--", target);
		result = await runProcess("npm", commandArgs, { timeoutMs: 180_000 });
	} else if (selectedRunner === "pytest") {
		const commandArgs = ["-m", "pytest"];
		if (target) commandArgs.push(target);
		result = await runProcess("python", commandArgs, { timeoutMs: 180_000 });
	} else {
		const commandArgs = ["test"];
		if (target) commandArgs.push(target);
		result = await runProcess("dotnet", commandArgs, { timeoutMs: 240_000 });
	}

	return createTextResult(
		`Runner: ${selectedRunner}\n${summarizeResult(result)}`,
		!result.ok,
	);
}

async function toolRunTypecheck(args = {}) {
	const scope = String(args.scope || "frontend").toLowerCase();
	const allowed = new Set(["frontend", "backend", "all"]);
	if (!allowed.has(scope)) {
		throw new Error("scope must be one of: frontend, backend, all");
	}

	const results = [];
	if (scope === "frontend" || scope === "all") {
		results.push(
			await runProcess("npm", ["run", "typecheck"], { timeoutMs: 180_000 }),
		);
	}
	if (scope === "backend" || scope === "all") {
		results.push(
			await runProcess("python", ["-m", "compileall", "-q", "backend"], {
				timeoutMs: 120_000,
			}),
		);
	}

	const ok = results.every((result) => result.ok);
	const body = results
		.map((result, index) => `# Task ${index + 1}\n${summarizeResult(result)}`)
		.join("\n\n");
	return createTextResult(body, !ok);
}

async function toolRunLintFix(args = {}) {
	const scopeArg = args.scope;
	const scopes = normalizePathList(scopeArg);
	const result = await runProcess(
		"npx",
		["biome", "check", "--write", ...scopes],
		{ timeoutMs: 240_000 },
	);
	return createTextResult(summarizeResult(result), !result.ok);
}

async function runSearch({
	pattern,
	paths: searchPaths,
	caseSensitive,
	maxResults,
}) {
	const paths = normalizePathList(searchPaths);
	const max = Math.max(1, Math.min(Number(maxResults) || 200, 2000));

	for (const pathValue of paths) {
		resolveRepoPath(pathValue);
	}

	const hasRipgrep = await commandExists("rg");
	let result;
	if (hasRipgrep) {
		const args = ["-n", "--no-heading", "--color", "never"];
		if (!caseSensitive) args.push("-i");
		args.push(pattern, ...paths);
		result = await runProcess("rg", args, { timeoutMs: 90_000 });
	} else {
		const args = ["-R", "-n", "--color=never"];
		if (!caseSensitive) args.push("-i");
		args.push(pattern, ...paths);
		result = await runProcess("grep", args, { timeoutMs: 90_000 });
	}

	const noMatch =
		result.code === 1 && !result.stdout.trim() && !result.stderr.trim();
	if (noMatch) {
		return createTextResult(`No matches found for pattern: ${pattern}`);
	}

	const lines = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, max);
	const truncated = lines.length >= max;
	const text = [
		`Pattern: ${pattern}`,
		`Paths: ${paths.join(", ")}`,
		`Matches: ${lines.length}${truncated ? "+" : ""}`,
		"",
		...lines,
	].join("\n");

	const isError = !(result.ok || noMatch || result.code === 1);
	return createTextResult(text, isError);
}

async function toolSearch(args = {}) {
	const pattern = typeof args.pattern === "string" ? args.pattern : "";
	if (!pattern.trim()) throw new Error("pattern is required");

	return runSearch({
		pattern,
		paths: args.paths,
		caseSensitive: Boolean(args.case_sensitive),
		maxResults: args.max_results,
	});
}

async function toolFindSymbolUsages(args = {}) {
	const symbol = typeof args.symbol === "string" ? args.symbol.trim() : "";
	if (!symbol) throw new Error("symbol is required");
	const pattern = `\\b${escapeRegExp(symbol)}\\b`;
	return runSearch({
		pattern,
		paths: args.paths,
		caseSensitive: Boolean(args.case_sensitive),
		maxResults: args.max_results,
	});
}

function extractImports(sourceText) {
	const imports = new Set();
	const patterns = [
		/\bimport\s+(?:type\s+)?(?:[^"']*?\sfrom\s*)?["']([^"']+)["']/g,
		/\bexport\s+[^"']*?\sfrom\s*["']([^"']+)["']/g,
		/\bimport\(\s*["']([^"']+)["']\s*\)/g,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(sourceText)) !== null) {
			imports.add(match[1]);
		}
	}
	return [...imports];
}

async function resolveImportSpecifier(fromAbsPath, specifier) {
	if (!specifier) return null;

	let baseAbs;
	if (specifier.startsWith("@/")) {
		baseAbs = path.resolve(REPO_ROOT, "src", specifier.slice(2));
	} else if (specifier.startsWith(".")) {
		baseAbs = path.resolve(path.dirname(fromAbsPath), specifier);
	} else {
		return { type: "external", value: specifier };
	}

	const stat = await statSafe(baseAbs);
	if (stat?.isFile()) return { type: "local", value: baseAbs };

	if (stat?.isDirectory()) {
		for (const ext of SOURCE_EXTENSIONS) {
			const indexCandidate = path.join(baseAbs, `index${ext}`);
			if (await exists(indexCandidate)) {
				return { type: "local", value: indexCandidate };
			}
		}
	}

	for (const ext of SOURCE_EXTENSIONS) {
		const candidate = `${baseAbs}${ext}`;
		if (await exists(candidate)) {
			return { type: "local", value: candidate };
		}
	}

	return { type: "unresolved", value: specifier };
}

async function toolDependencyGraph(args = {}) {
	const entry = typeof args.entry === "string" ? args.entry.trim() : "";
	if (!entry) throw new Error("entry is required (repo-relative path)");

	const maxDepth = Math.max(1, Math.min(Number(args.max_depth) || 4, 12));
	const entryAbs = resolveRepoPath(entry);
	if (!(await exists(entryAbs))) {
		throw new Error(`entry file does not exist: ${entry}`);
	}

	const visited = new Set();
	const edges = [];
	const externalDeps = new Map();
	const unresolvedDeps = new Map();
	const queue = [{ absPath: entryAbs, depth: 0 }];

	while (queue.length) {
		const current = queue.shift();
		if (!current) continue;
		const key = current.absPath;
		if (visited.has(key)) continue;
		visited.add(key);

		if (current.depth >= maxDepth) continue;
		let source = "";
		try {
			source = await fs.readFile(current.absPath, "utf8");
		} catch {
			continue;
		}

		const imports = extractImports(source);
		for (const specifier of imports) {
			const resolved = await resolveImportSpecifier(current.absPath, specifier);
			if (!resolved) continue;
			if (resolved.type === "local") {
				edges.push({
					from: repoRelative(current.absPath),
					to: repoRelative(resolved.value),
				});
				if (!visited.has(resolved.value)) {
					queue.push({ absPath: resolved.value, depth: current.depth + 1 });
				}
			} else if (resolved.type === "external") {
				externalDeps.set(specifier, (externalDeps.get(specifier) || 0) + 1);
			} else {
				unresolvedDeps.set(specifier, (unresolvedDeps.get(specifier) || 0) + 1);
			}
		}
	}

	const uniqueEdges = [];
	const seenEdge = new Set();
	for (const edge of edges) {
		const key = `${edge.from}->${edge.to}`;
		if (seenEdge.has(key)) continue;
		seenEdge.add(key);
		uniqueEdges.push(edge);
	}

	const nodeIdMap = new Map();
	let nextId = 1;
	const toNodeId = (name) => {
		if (!nodeIdMap.has(name)) {
			nodeIdMap.set(name, `N${nextId++}`);
		}
		return nodeIdMap.get(name);
	};

	const mermaidLines = ["graph TD"];
	for (const edge of uniqueEdges) {
		const fromId = toNodeId(edge.from);
		const toId = toNodeId(edge.to);
		mermaidLines.push(`  ${fromId}["${edge.from}"] --> ${toId}["${edge.to}"]`);
	}

	const external = [...externalDeps.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 40)
		.map(([name, count]) => `- ${name} (${count})`);
	const unresolved = [...unresolvedDeps.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 40)
		.map(([name, count]) => `- ${name} (${count})`);

	const text = [
		`Entry: ${entry}`,
		`Visited nodes: ${visited.size}`,
		`Internal edges: ${uniqueEdges.length}`,
		`External imports: ${externalDeps.size}`,
		`Unresolved imports: ${unresolvedDeps.size}`,
		"",
		"Mermaid graph:",
		"```mermaid",
		...mermaidLines,
		"```",
		"",
		"Top external imports:",
		external.length ? external.join("\n") : "- none",
		"",
		"Top unresolved imports:",
		unresolved.length ? unresolved.join("\n") : "- none",
	].join("\n");

	return createTextResult(text);
}

function componentTemplate(componentName, variant) {
	const bodyByVariant = {
		panel: `<FrameSection title={title} subtitle="Generated panel component">
			<div className="rounded-lg border px-3 py-2 text-sm" style={{
				borderColor: hexToRgba(palette.primary, 0.18),
				background: hexToRgba(palette.surfaceLight, 0.18),
				color: palette.textMuted,
			}}>
				Panel body
			</div>
		</FrameSection>`,
		card: `<div className="rounded-2xl border p-4" style={{
			borderColor: hexToRgba(palette.primary, 0.2),
			background: hexToRgba(palette.surface, 0.55),
		}}>
			<div className="text-sm font-semibold" style={{ color: palette.text }}>{title}</div>
			<div className="mt-1 text-xs" style={{ color: palette.textMuted }}>Generated card content.</div>
		</div>`,
		form: `<FrameSection title={title} subtitle="Generated form scaffold">
			<form className="grid gap-2">
				<input className="rounded-lg border px-3 py-2 text-sm" placeholder="Field" />
				<button type="button" className="rounded-lg border px-3 py-2 text-sm">Submit</button>
			</form>
		</FrameSection>`,
		list: `<FrameSection title={title} subtitle="Generated list scaffold">
			<ul className="list-disc pl-5 text-sm" style={{ color: palette.textMuted }}>
				<li>Item one</li>
				<li>Item two</li>
			</ul>
		</FrameSection>`,
	};

	const selectedBody = bodyByVariant[variant] || bodyByVariant.panel;

	return `import { FrameSection } from "@/components/apps/ui/PageFrame";
import { hexToRgba, useTheme } from "@/lib/palette";

export interface ${componentName}Props {
	title?: string;
}

export function ${componentName}({ title = "${componentName}" }: ${componentName}Props) {
	const { palette } = useTheme();

	return (
		${selectedBody}
	);
}

export default ${componentName};
`;
}

async function toolGenerateComponent(args = {}) {
	const rawName = typeof args.name === "string" ? args.name.trim() : "";
	if (!rawName) throw new Error("name is required");

	const componentName = pascalCase(rawName);
	const variant = String(args.variant || "panel").toLowerCase();
	const baseDir =
		typeof args.directory === "string" && args.directory.trim()
			? args.directory.trim()
			: "src/components/apps/generated";
	const force = Boolean(args.force);

	const targetDirAbs = resolveRepoPath(baseDir);
	await fs.mkdir(targetDirAbs, { recursive: true });

	const fileAbs = path.join(targetDirAbs, `${componentName}.tsx`);
	if ((await exists(fileAbs)) && !force) {
		throw new Error(
			`Component already exists: ${repoRelative(fileAbs)} (pass force=true to overwrite).`,
		);
	}

	const content = componentTemplate(componentName, variant);
	await fs.writeFile(fileAbs, content, "utf8");

	return createTextResult(
		`Generated component: ${repoRelative(fileAbs)}\nVariant: ${variant}`,
	);
}

function routeAppTemplate(name, slug, schema) {
	const schemaBlock = schema
		? `const DEFAULT_SCHEMA = ${JSON.stringify(schema, null, 2)} as const;\n`
		: "";
	const schemaView = schema
		? `<pre className="mt-2 overflow-x-auto rounded-md border p-2 text-xs" style={{
			borderColor: hexToRgba(palette.primary, 0.14),
			background: hexToRgba(palette.background, 0.5),
			color: palette.textMuted,
		}}>{JSON.stringify(DEFAULT_SCHEMA, null, 2)}</pre>`
		: `<p className="text-sm" style={{ color: palette.textMuted }}>Route scaffold for <code>${slug}</code>.</p>`;

	return `import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { hexToRgba, useTheme } from "@/lib/palette";

${schemaBlock}export function ${name}App() {
	const { palette } = useTheme();

	return (
		<PageFrame title="${name}" subtitle="Generated protected app route scaffold.">
			<FrameSection title="Overview">
				${schemaView}
			</FrameSection>
		</PageFrame>
	);
}

export default ${name}App;
`;
}

function protectedRouteTemplate(name, slug) {
	return `import { ${name}App } from "@/components/apps/${slug}/${name}App";

export default function ${name}RoutePage() {
	return <${name}App />;
}
`;
}

function publicRouteTemplate(name, schema) {
	const schemaBlock = schema
		? `const DEFAULT_SCHEMA = ${JSON.stringify(schema, null, 2)} as const;\n`
		: "";
	const schemaView = schema
		? `<pre className="mt-2 overflow-x-auto rounded-md border p-2 text-xs" style={{ color: "var(--text-muted)" }}>{JSON.stringify(DEFAULT_SCHEMA, null, 2)}</pre>`
		: `<p className="text-sm" style={{ color: "var(--text-muted)" }}>Public route scaffold.</p>`;

	return `import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

${schemaBlock}export default function ${name}Page() {
	return (
		<PageFrame title="${name}" subtitle="Generated public route scaffold.">
			<FrameSection title="Overview">
				${schemaView}
			</FrameSection>
		</PageFrame>
	);
}
`;
}

async function toolGenerateRoute(args = {}) {
	const rawName = typeof args.name === "string" ? args.name.trim() : "";
	if (!rawName) throw new Error("name is required");

	const name = pascalCase(rawName);
	const authPolicy = String(args.auth_policy || "protected").toLowerCase();
	if (!["protected", "public"].includes(authPolicy)) {
		throw new Error("auth_policy must be either 'protected' or 'public'");
	}

	const schema = parseSchemaArg(args.schema);
	const force = Boolean(args.force);
	const created = [];

	if (authPolicy === "protected") {
		const slug = slugify(rawName) || slugify(name);
		const componentDirAbs = resolveRepoPath(`src/components/apps/${slug}`);
		const routeDirAbs = resolveRepoPath(`src/routes/apps/${slug}`);
		await fs.mkdir(componentDirAbs, { recursive: true });
		await fs.mkdir(routeDirAbs, { recursive: true });

		const appFileAbs = path.join(componentDirAbs, `${name}App.tsx`);
		const routeFileAbs = path.join(routeDirAbs, `${name}RoutePage.tsx`);

		if (
			!force &&
			((await exists(appFileAbs)) || (await exists(routeFileAbs)))
		) {
			throw new Error(
				`Route files already exist for ${name}. Pass force=true to overwrite.`,
			);
		}

		await fs.writeFile(
			appFileAbs,
			routeAppTemplate(name, slug, schema),
			"utf8",
		);
		await fs.writeFile(
			routeFileAbs,
			protectedRouteTemplate(name, slug),
			"utf8",
		);
		created.push(repoRelative(appFileAbs), repoRelative(routeFileAbs));
	} else {
		const routeFileAbs = resolveRepoPath(`src/routes/${name}Page.tsx`);
		if (!force && (await exists(routeFileAbs))) {
			throw new Error(
				`Route file already exists: ${repoRelative(routeFileAbs)} (pass force=true).`,
			);
		}
		await fs.writeFile(routeFileAbs, publicRouteTemplate(name, schema), "utf8");
		created.push(repoRelative(routeFileAbs));
	}

	const registrationHint =
		authPolicy === "protected"
			? `Add route registration in src/App.tsx under /app, for example: path="apps/${slugify(rawName)}" -> <${name}RoutePage />`
			: `Add public route registration in src/App.tsx, for example: path="/${slugify(rawName)}" -> <${name}Page />`;

	return createTextResult(
		`Generated route scaffold (${authPolicy}):\n- ${created.join("\n- ")}\n\nNext step: ${registrationHint}`,
	);
}

async function toolGenerateDbMigration(args = {}) {
	const rawName = typeof args.name === "string" ? args.name.trim() : "";
	if (!rawName) throw new Error("name is required");

	const slug = slugify(rawName);
	if (!slug)
		throw new Error("name must contain at least one alphanumeric character");

	const migrationsDirAbs = resolveRepoPath("supabase/migrations");
	await fs.mkdir(migrationsDirAbs, { recursive: true });
	const timestamp = timestampForMigration();
	const fileAbs = path.join(migrationsDirAbs, `${timestamp}_${slug}.sql`);
	if (await exists(fileAbs)) {
		throw new Error(`Migration already exists: ${repoRelative(fileAbs)}`);
	}

	const sql = `-- Migration: ${rawName}\n-- Generated: ${new Date().toISOString()}\n\nBEGIN;\n\n-- TODO: add schema changes\n-- Example:\n-- ALTER TABLE public.projects ADD COLUMN example text;\n\nCOMMIT;\n`;
	await fs.writeFile(fileAbs, sql, "utf8");

	return createTextResult(`Generated migration: ${repoRelative(fileAbs)}`);
}

function buildTsLoggerCall(eventName, level, fields, context) {
	const normalizedLevel = ["debug", "info", "warn", "error"].includes(level)
		? level
		: "info";
	const payload = JSON.stringify(fields || {}, null, 2);
	return `logger.${normalizedLevel}("${eventName}", "${context}", ${payload});`;
}

function injectTsLoggerImport(sourceText) {
	if (
		sourceText.includes('from "@/lib/logger"') ||
		sourceText.includes("from '@/lib/logger'")
	) {
		return sourceText;
	}

	const importMatches = [...sourceText.matchAll(/^import .*;$/gm)];
	if (importMatches.length === 0) {
		return `import { logger } from "@/lib/logger";\n${sourceText}`;
	}

	const last = importMatches.at(-1);
	if (!last || typeof last.index !== "number") return sourceText;
	const insertionPoint = last.index + last[0].length;
	return `${sourceText.slice(0, insertionPoint)}\nimport { logger } from "@/lib/logger";${sourceText.slice(insertionPoint)}`;
}

function insertAfterMarker(sourceText, marker, insertionText) {
	const markerIndex = sourceText.indexOf(marker);
	if (markerIndex === -1) return null;
	const lineEnd = sourceText.indexOf("\n", markerIndex);
	if (lineEnd === -1) {
		return `${sourceText}\n${insertionText}`;
	}
	return `${sourceText.slice(0, lineEnd + 1)}${insertionText}\n${sourceText.slice(lineEnd + 1)}`;
}

async function toolAddStructuredLog(args = {}) {
	const filePath = typeof args.file === "string" ? args.file.trim() : "";
	const eventName =
		typeof args.event_name === "string" ? args.event_name.trim() : "";
	if (!filePath) throw new Error("file is required");
	if (!eventName) throw new Error("event_name is required");

	const level =
		typeof args.level === "string" ? args.level.trim().toLowerCase() : "info";
	const context =
		typeof args.context === "string" ? args.context.trim() : "MCP";
	const fields =
		typeof args.fields === "object" && args.fields ? args.fields : {};
	const marker = typeof args.insert_after === "string" ? args.insert_after : "";

	const fileAbs = resolveRepoPath(filePath);
	if (!(await exists(fileAbs))) {
		throw new Error(`file not found: ${filePath}`);
	}

	const ext = path.extname(fileAbs).toLowerCase();
	const sourceText = await fs.readFile(fileAbs, "utf8");

	if (!marker) {
		if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
			const snippet = buildTsLoggerCall(eventName, level, fields, context);
			return createTextResult(
				`No insert_after marker provided. Suggested snippet:\n\n${snippet}\n\nFile unchanged.`,
			);
		}
		const pySnippet = `logger.${level}("event=${eventName} fields=%s", ${JSON.stringify(fields)})`;
		return createTextResult(
			`No insert_after marker provided. Suggested snippet:\n\n${pySnippet}\n\nFile unchanged.`,
		);
	}

	if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
		let nextSource = injectTsLoggerImport(sourceText);
		const call = buildTsLoggerCall(eventName, level, fields, context);
		const inserted = insertAfterMarker(nextSource, marker, call);
		if (!inserted) {
			throw new Error(`insert_after marker not found: ${marker}`);
		}
		nextSource = inserted;
		await fs.writeFile(fileAbs, nextSource, "utf8");
		return createTextResult(`Added structured log to ${filePath}`);
	}

	if (ext === ".py") {
		const call = `logger.${level}("event=${eventName} fields=%s", ${JSON.stringify(fields)})`;
		const inserted = insertAfterMarker(sourceText, marker, call);
		if (!inserted) {
			throw new Error(`insert_after marker not found: ${marker}`);
		}
		await fs.writeFile(fileAbs, inserted, "utf8");
		return createTextResult(`Added structured log to ${filePath}`);
	}

	throw new Error(`Unsupported file type for structured logging: ${ext}`);
}

async function toolAddErrorBoundary(args = {}) {
	const pagePath = typeof args.page === "string" ? args.page.trim() : "";
	if (!pagePath) throw new Error("page is required");

	const pageAbs = resolveRepoPath(pagePath);
	if (!(await exists(pageAbs))) {
		throw new Error(`page file not found: ${pagePath}`);
	}
	if (!pageAbs.endsWith(".tsx")) {
		throw new Error("page must be a .tsx file");
	}

	const force = Boolean(args.force);
	const baseName = path.basename(pageAbs, ".tsx");
	const wrapperName = `${baseName}WithErrorBoundary`;
	const wrapperFileAbs = path.join(path.dirname(pageAbs), `${wrapperName}.tsx`);
	if ((await exists(wrapperFileAbs)) && !force) {
		throw new Error(
			`Wrapper already exists: ${repoRelative(wrapperFileAbs)} (pass force=true to overwrite).`,
		);
	}

	const wrapperContent = `import { ErrorBoundary } from "@/components/notification-system/ErrorBoundary";
import Page from "./${baseName}";

export default function ${wrapperName}() {
	return (
		<ErrorBoundary>
			<Page />
		</ErrorBoundary>
	);
}
`;

	await fs.writeFile(wrapperFileAbs, wrapperContent, "utf8");
	return createTextResult(
		`Generated error-boundary wrapper: ${repoRelative(wrapperFileAbs)}\nUse this wrapper in route registration to protect ${pagePath}.`,
	);
}

async function ensureApiErrorHelperFile() {
	const helperAbs = resolveRepoPath("backend/api_error_helpers.py");
	if (await exists(helperAbs)) return helperAbs;

	const content = `from functools import wraps
import logging
from flask import jsonify

logger = logging.getLogger(__name__)


def api_error_wrapper(route_name: str):
	def decorator(func):
		@wraps(func)
		def wrapped(*args, **kwargs):
			try:
				return func(*args, **kwargs)
			except ValueError as exc:
				return jsonify({"success": False, "error": str(exc), "route": route_name}), 400
			except Exception as exc:
				logger.exception("Unhandled API error in %s", route_name)
				return jsonify({"success": False, "error": str(exc), "route": route_name}), 500
		return wrapped
	return decorator
`;
	await fs.writeFile(helperAbs, content, "utf8");
	return helperAbs;
}

function insertImportIfMissing(sourceText, importLine) {
	if (sourceText.includes(importLine)) return sourceText;
	const importPattern = /^(?:from\s+.+\s+import\s+.+|import\s+.+)$/gm;
	const matches = [...sourceText.matchAll(importPattern)];
	if (matches.length === 0) {
		return `${importLine}\n${sourceText}`;
	}
	const last = matches.at(-1);
	if (!last || typeof last.index !== "number") return sourceText;
	const insertPos = last.index + last[0].length;
	return `${sourceText.slice(0, insertPos)}\n${importLine}${sourceText.slice(insertPos)}`;
}

function addDecoratorToFunction(sourceText, functionName, decoratorLine) {
	const defRegex = new RegExp(
		`^def\\s+${escapeRegExp(functionName)}\\s*\\(`,
		"m",
	);
	const defMatch = defRegex.exec(sourceText);
	if (!defMatch || typeof defMatch.index !== "number") {
		throw new Error(`Could not locate function: ${functionName}`);
	}

	const startOfDef = defMatch.index;
	const beforeDef = sourceText.slice(0, startOfDef);
	const lines = beforeDef.split("\n");

	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (!line) continue;
		if (!line.startsWith("@")) break;
		if (line === decoratorLine.trim()) {
			return sourceText;
		}
	}

	return `${beforeDef}${decoratorLine}\n${sourceText.slice(startOfDef)}`;
}

async function toolAddApiErrorWrapper(args = {}) {
	const route = typeof args.route === "string" ? args.route.trim() : "";
	if (!route) throw new Error("route is required (function name)");

	const file =
		typeof args.file === "string" && args.file.trim()
			? args.file.trim()
			: "backend/api_server.py";
	const fileAbs = resolveRepoPath(file);
	if (!(await exists(fileAbs))) {
		throw new Error(`target file not found: ${file}`);
	}

	await ensureApiErrorHelperFile();
	let sourceText = await fs.readFile(fileAbs, "utf8");
	sourceText = insertImportIfMissing(
		sourceText,
		"from api_error_helpers import api_error_wrapper",
	);
	sourceText = addDecoratorToFunction(
		sourceText,
		route,
		`@api_error_wrapper("${route}")`,
	);
	await fs.writeFile(fileAbs, sourceText, "utf8");

	return createTextResult(
		`Added @api_error_wrapper("${route}") to ${file}.\nHelper file ensured at backend/api_error_helpers.py.`,
	);
}

const PROMPTS = {
	"repo.pr_description": {
		description: "Generate a structured PR description for this repo.",
		template: ({ title = "PR Title", summary = "", tests = "" }) => `# ${title}

## Summary
${summary || "- Describe the change and why it exists."}

## Scope
- Frontend:
- Backend:
- Data/Schema:
- Docs:

## Validation
${tests || "- npm run typecheck\n- npx biome check ."}

## Risks
- List behavior changes and potential regressions.

## Rollback Plan
- Describe how to revert safely if needed.
`,
	},
	"repo.commit_message": {
		description: "Generate a conventional, scoped commit message.",
		template: ({
			type = "feat",
			scope = "core",
			summary = "describe change",
		}) => `${type}(${scope}): ${summary}`,
	},
	"repo.test_plan": {
		description: "Generate a focused test plan for a code change.",
		template: ({ change = "", risk = "" }) => `## Test Plan

### Change Under Test
${change || "- Describe the behavior and entry points."}

### Risks
${risk || "- Identify likely regressions and edge cases."}

### Checks
1. Run lint and typecheck (Biome + TS).
2. Run feature-specific unit/integration tests.
3. Exercise changed UI/API path manually.
4. Validate error states and invalid inputs.
`,
	},
};

const TOOLS = [
	{
		name: "repo.run_tests",
		description:
			"Run repo tests with auto-detected or explicit runner (npm, pytest, dotnet).",
		inputSchema: {
			type: "object",
			properties: {
				runner: {
					type: "string",
					enum: ["auto", "npm", "pytest", "dotnet"],
					default: "auto",
				},
				target: {
					type: "string",
					description: "Optional test target, pattern, or path.",
				},
			},
		},
		handler: toolRunTests,
	},
	{
		name: "repo.run_typecheck",
		description: "Run frontend, backend, or all type/syntax checks.",
		inputSchema: {
			type: "object",
			properties: {
				scope: {
					type: "string",
					enum: ["frontend", "backend", "all"],
					default: "frontend",
				},
			},
		},
		handler: toolRunTypecheck,
	},
	{
		name: "repo.run_lint_fix",
		description: "Run Biome lint+format autofix on selected scope.",
		inputSchema: {
			type: "object",
			properties: {
				scope: {
					anyOf: [
						{ type: "string" },
						{ type: "array", items: { type: "string" } },
					],
					description:
						"Path or list of paths to fix. Defaults to src/backend/docs.",
				},
			},
		},
		handler: toolRunLintFix,
	},
	{
		name: "repo.search",
		description:
			"Search the repo by regex pattern using ripgrep when available.",
		inputSchema: {
			type: "object",
			required: ["pattern"],
			properties: {
				pattern: { type: "string" },
				paths: {
					anyOf: [
						{ type: "string" },
						{ type: "array", items: { type: "string" } },
					],
				},
				case_sensitive: { type: "boolean", default: false },
				max_results: { type: "number", default: 200 },
			},
		},
		handler: toolSearch,
	},
	{
		name: "repo.find_symbol_usages",
		description:
			"Find likely symbol usages (word-boundary regex) across repo paths.",
		inputSchema: {
			type: "object",
			required: ["symbol"],
			properties: {
				symbol: { type: "string" },
				paths: {
					anyOf: [
						{ type: "string" },
						{ type: "array", items: { type: "string" } },
					],
				},
				case_sensitive: { type: "boolean", default: false },
				max_results: { type: "number", default: 200 },
			},
		},
		handler: toolFindSymbolUsages,
	},
	{
		name: "repo.dependency_graph",
		description:
			"Build a simple dependency graph from a local entry file (TS/JS import graph).",
		inputSchema: {
			type: "object",
			required: ["entry"],
			properties: {
				entry: {
					type: "string",
					description: "Repo-relative entry file path.",
				},
				max_depth: { type: "number", default: 4 },
			},
		},
		handler: toolDependencyGraph,
	},
	{
		name: "repo.generate_component",
		description: "Generate a repo-styled React component scaffold.",
		inputSchema: {
			type: "object",
			required: ["name"],
			properties: {
				name: { type: "string" },
				variant: {
					type: "string",
					enum: ["panel", "card", "form", "list"],
					default: "panel",
				},
				directory: { type: "string" },
				force: { type: "boolean", default: false },
			},
		},
		handler: toolGenerateComponent,
	},
	{
		name: "repo.generate_route",
		description:
			"Generate protected/public route scaffolds using repo conventions.",
		inputSchema: {
			type: "object",
			required: ["name"],
			properties: {
				name: { type: "string" },
				auth_policy: {
					type: "string",
					enum: ["protected", "public"],
					default: "protected",
				},
				schema: {
					anyOf: [{ type: "object" }, { type: "string" }],
					description: "Optional JSON schema metadata embedded in scaffold.",
				},
				force: { type: "boolean", default: false },
			},
		},
		handler: toolGenerateRoute,
	},
	{
		name: "repo.generate_db_migration",
		description: "Create a timestamped Supabase SQL migration scaffold.",
		inputSchema: {
			type: "object",
			required: ["name"],
			properties: {
				name: { type: "string" },
			},
		},
		handler: toolGenerateDbMigration,
	},
	{
		name: "repo.add_structured_log",
		description:
			"Add or suggest a structured log statement in TS/JS/Python files (requires insert_after to apply edits).",
		inputSchema: {
			type: "object",
			required: ["file", "event_name"],
			properties: {
				file: { type: "string" },
				event_name: { type: "string" },
				fields: { type: "object", additionalProperties: true },
				level: {
					type: "string",
					enum: ["debug", "info", "warn", "error"],
					default: "info",
				},
				context: { type: "string", default: "MCP" },
				insert_after: {
					type: "string",
					description: "Marker string; log is inserted on the following line.",
				},
			},
		},
		handler: toolAddStructuredLog,
	},
	{
		name: "repo.add_error_boundary",
		description:
			"Create an error-boundary wrapper component for a route/page component.",
		inputSchema: {
			type: "object",
			required: ["page"],
			properties: {
				page: { type: "string", description: "Repo-relative .tsx page path." },
				force: { type: "boolean", default: false },
			},
		},
		handler: toolAddErrorBoundary,
	},
	{
		name: "repo.add_api_error_wrapper",
		description:
			"Ensure a shared Flask API error wrapper and attach it to a route function.",
		inputSchema: {
			type: "object",
			required: ["route"],
			properties: {
				route: {
					type: "string",
					description: "Python function name (e.g., api_status).",
				},
				file: {
					type: "string",
					default: "backend/api_server.py",
					description: "Target Python file containing the route function.",
				},
			},
		},
		handler: toolAddApiErrorWrapper,
	},
];

const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));

function promptList() {
	return Object.entries(PROMPTS).map(([name, value]) => ({
		name,
		description: value.description,
		arguments: [],
	}));
}

function promptGet(name, args = {}) {
	const prompt = PROMPTS[name];
	if (!prompt) {
		throw new Error(`Unknown prompt: ${name}`);
	}
	const text = prompt.template(args);
	return {
		description: prompt.description,
		messages: [
			{
				role: "user",
				content: {
					type: "text",
					text,
				},
			},
		],
	};
}

let initialized = false;

function sendMessage(message) {
	const body = Buffer.from(JSON.stringify(message), "utf8");
	const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
	process.stdout.write(header);
	process.stdout.write(body);
}

function sendResponse(id, result) {
	sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
	sendMessage({
		jsonrpc: "2.0",
		id,
		error: {
			code,
			message,
			data,
		},
	});
}

async function handleRequest(message) {
	if (!message || typeof message !== "object") return;
	const { id, method, params } = message;
	if (!method || typeof method !== "string") return;

	try {
		if (method === "initialize") {
			initialized = true;
			return sendResponse(id, {
				protocolVersion: "2024-11-05",
				capabilities: {
					tools: {},
					prompts: {},
				},
				serverInfo: SERVER_INFO,
			});
		}

		if (method === "notifications/initialized") {
			return;
		}

		if (!initialized) {
			if (id !== undefined) {
				sendError(id, -32002, "Server not initialized");
			}
			return;
		}

		if (method === "tools/list") {
			return sendResponse(id, {
				tools: TOOLS.map(({ handler, ...definition }) => definition),
			});
		}

		if (method === "tools/call") {
			const name = params?.name;
			const args = params?.arguments || {};
			if (typeof name !== "string") {
				return sendError(id, -32602, "tools/call requires a string name");
			}
			const tool = TOOL_MAP.get(name);
			if (!tool) {
				return sendError(id, -32601, `Unknown tool: ${name}`);
			}

			try {
				const result = await tool.handler(args);
				return sendResponse(id, result);
			} catch (error) {
				return sendResponse(
					id,
					createTextResult(
						`Tool '${name}' failed: ${String(error?.message || error)}`,
						true,
					),
				);
			}
		}

		if (method === "prompts/list") {
			return sendResponse(id, {
				prompts: promptList(),
			});
		}

		if (method === "prompts/get") {
			const name = params?.name;
			const args = params?.arguments || {};
			if (typeof name !== "string") {
				return sendError(id, -32602, "prompts/get requires a string name");
			}
			const result = promptGet(name, args);
			return sendResponse(id, result);
		}

		if (id !== undefined) {
			sendError(id, -32601, `Method not found: ${method}`);
		}
	} catch (error) {
		if (id !== undefined) {
			sendError(
				id,
				-32000,
				"Internal server error",
				String(error?.stack || error),
			);
		}
	}
}

let buffer = Buffer.alloc(0);

function processInputBuffer() {
	while (true) {
		const headerEnd = buffer.indexOf("\r\n\r\n");
		if (headerEnd === -1) return;

		const header = buffer.slice(0, headerEnd).toString("utf8");
		const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
		if (!lengthMatch) {
			buffer = buffer.slice(headerEnd + 4);
			continue;
		}

		const contentLength = Number.parseInt(lengthMatch[1], 10);
		const messageStart = headerEnd + 4;
		const messageEnd = messageStart + contentLength;
		if (buffer.length < messageEnd) return;

		const payload = buffer.slice(messageStart, messageEnd).toString("utf8");
		buffer = buffer.slice(messageEnd);

		let message;
		try {
			message = JSON.parse(payload);
		} catch {
			continue;
		}

		handleRequest(message);
	}
}

process.stdin.on("data", (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	processInputBuffer();
});

process.stdin.on("error", () => {
	process.exit(1);
});

process.on("uncaughtException", (error) => {
	const text = `Uncaught exception: ${String(error?.stack || error)}`;
	sendMessage({
		jsonrpc: "2.0",
		method: "window/logMessage",
		params: {
			level: "error",
			message: text,
		},
	});
});

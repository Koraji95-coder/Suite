/**
 * Vite plugin: Architecture Code Analyzer (Phase 4.1)
 *
 * Scans src/components for TS/TSX files, counts lines, extracts import
 * relationships, and serves a graph-data.json manifest.
 *
 * - In dev: exposes GET /api/graph-data  +  triggers HMR on file change
 * - In build: writes public/graph-data.json so the SPA can fetch it at runtime
 */

import fs from "fs";
import path from "path";
import type { Plugin, ViteDevServer } from "vite";

export interface AnalyzedComponent {
	filePath: string;
	lines: number;
	imports: string[]; // relative basenames of imported local components
	group?: string;
}

export interface GraphManifest {
	timestamp: number;
	components: Record<string, AnalyzedComponent>;
}

/* ── helpers ───────────────────────────────────────────────────────── */

const IMPORT_RE = /import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const COMP_EXT = /\.(tsx?|jsx?)$/;

function isLocalImport(spec: string) {
	return spec.startsWith("./") || spec.startsWith("../");
}

function scanComponents(rootDir: string): GraphManifest {
	const componentsDir = path.join(rootDir, "src", "components");
	if (!fs.existsSync(componentsDir))
		return { timestamp: Date.now(), components: {} };

	const result: Record<string, AnalyzedComponent> = {};

	function walk(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!COMP_EXT.test(entry.name)) continue;

			const content = fs.readFileSync(full, "utf-8");
			const lines = content.split("\n").length;
			const imports: string[] = [];

			let m: RegExpExecArray | null;
			const re = new RegExp(IMPORT_RE.source, IMPORT_RE.flags);
			while ((m = re.exec(content)) !== null) {
				const spec = m[1];
				if (!isLocalImport(spec)) continue;
				// Resolve to basename without extension
				const resolved = path.resolve(path.dirname(full), spec);
				const rel = path.relative(componentsDir, resolved);
				const base = path.basename(rel).replace(COMP_EXT, "");
				if (base && base !== "index") imports.push(base);
			}

			const relPath = path.relative(componentsDir, full).replace(/\\/g, "/");
			const baseName = path.basename(full);
			result[baseName] = {
				filePath: relPath,
				lines,
				imports: [...new Set(imports)],
			};
		}
	}

	walk(componentsDir);
	return { timestamp: Date.now(), components: result };
}

/* ── plugin ────────────────────────────────────────────────────────── */

export default function codeAnalyzerPlugin(): Plugin {
	let root = "";
	let server: ViteDevServer | undefined;
	let cached: GraphManifest | null = null;

	function getManifest(): GraphManifest {
		if (!cached) cached = scanComponents(root);
		return cached;
	}

	function invalidate() {
		cached = null;
		// Notify connected clients via HMR
		if (server) {
			server.ws.send({ type: "custom", event: "graph-data:update", data: {} });
		}
	}

	return {
		name: "architecture-code-analyzer",

		configResolved(config) {
			root = config.root;
		},

		configureServer(srv) {
			server = srv;

			// Watch components directory for changes
			const componentsDir = path.join(root, "src", "components");
			srv.watcher.on("change", (file: string) => {
				if (file.startsWith(componentsDir) && COMP_EXT.test(file)) invalidate();
			});
			srv.watcher.on("add", (file: string) => {
				if (file.startsWith(componentsDir) && COMP_EXT.test(file)) invalidate();
			});
			srv.watcher.on("unlink", (file: string) => {
				if (file.startsWith(componentsDir) && COMP_EXT.test(file)) invalidate();
			});

			// REST endpoint
			srv.middlewares.use("/api/graph-data", (_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(getManifest()));
			});
		},

		// Production: emit graph-data.json into the build output
		writeBundle() {
			const outDir = path.join(root, "dist");
			if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
			fs.writeFileSync(
				path.join(outDir, "graph-data.json"),
				JSON.stringify(scanComponents(root), null, 2),
				"utf-8",
			);
		},
	};
}

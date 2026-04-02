import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_SNAPSHOT_SCHEMAS = Object.freeze([
	"public",
	"auth",
	"storage",
	"vault",
	"supabase_functions",
]);

export const DEFAULT_SNAPSHOT_EXCLUDES = Object.freeze([
	"auth.schema_migrations",
	"storage.migrations",
	"supabase_functions.migrations",
	"supabase_migrations.schema_migrations",
]);

export function getLocalAppData(envMap = process.env) {
	const localAppData = String(envMap.LOCALAPPDATA || "").trim();
	if (localAppData) {
		return localAppData;
	}

	const userProfile = String(envMap.USERPROFILE || "").trim();
	if (userProfile) {
		return path.join(userProfile, "AppData", "Local");
	}

	return os.tmpdir();
}

export function getSupabaseSnapshotRoot(envMap = process.env) {
	return path.join(getLocalAppData(envMap), "Suite", "supabase-snapshots");
}

export function ensureDirectory(directoryPath) {
	fs.mkdirSync(directoryPath, { recursive: true });
	return directoryPath;
}

export function normalizeSnapshotToken(value) {
	const normalized = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || null;
}

export function formatSnapshotTimestamp(date = new Date()) {
	const year = String(date.getUTCFullYear()).padStart(4, "0");
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");
	return `${year}${month}${day}-${hours}${minutes}${seconds}z`;
}

export function buildSnapshotId({
	createdAt = new Date(),
	workstationId = "",
	label = "",
} = {}) {
	const parts = [formatSnapshotTimestamp(createdAt)];
	const normalizedWorkstation = normalizeSnapshotToken(workstationId);
	if (normalizedWorkstation) {
		parts.push(normalizedWorkstation);
	}

	const normalizedLabel = normalizeSnapshotToken(label);
	if (normalizedLabel) {
		parts.push(normalizedLabel);
	}

	return parts.join("-");
}

export function extractFirstJsonObject(text) {
	const source = String(text || "");
	let startIndex = source.indexOf("{");
	while (startIndex >= 0) {
		let depth = 0;
		let inString = false;
		let escapeNext = false;
		for (let index = startIndex; index < source.length; index += 1) {
			const current = source[index];
			if (inString) {
				if (escapeNext) {
					escapeNext = false;
				} else if (current === "\\") {
					escapeNext = true;
				} else if (current === '"') {
					inString = false;
				}
				continue;
			}

			if (current === '"') {
				inString = true;
				continue;
			}

			if (current === "{") {
				depth += 1;
				continue;
			}

			if (current === "}") {
				depth -= 1;
				if (depth === 0) {
					const candidate = source.slice(startIndex, index + 1);
					try {
						JSON.parse(candidate);
						return candidate;
					} catch {
						break;
					}
				}
			}
		}

		startIndex = source.indexOf("{", startIndex + 1);
	}

	return null;
}

export function parseSupabaseStatusOutput(text) {
	const jsonText = extractFirstJsonObject(text);
	if (!jsonText) {
		return null;
	}

	try {
		return JSON.parse(jsonText);
	} catch {
		return null;
	}
}

export function summarizeDbUrl(dbUrl) {
	const trimmed = String(dbUrl || "").trim();
	if (!trimmed) {
		return null;
	}

	try {
		const parsed = new URL(trimmed);
		return {
			protocol: parsed.protocol.replace(/:$/, ""),
			host: parsed.hostname || null,
			port: parsed.port ? Number(parsed.port) : null,
			database: parsed.pathname.replace(/^\/+/, "") || null,
			username: parsed.username || null,
		};
	} catch {
		return null;
	}
}

export function summarizeSupabaseStatus(statusPayload) {
	if (!statusPayload || typeof statusPayload !== "object") {
		return null;
	}

	return {
		apiUrl:
			typeof statusPayload.API_URL === "string" ? statusPayload.API_URL : null,
		db: summarizeDbUrl(statusPayload.DB_URL),
		functionsUrl:
			typeof statusPayload.FUNCTIONS_URL === "string"
				? statusPayload.FUNCTIONS_URL
				: null,
		inbucketUrl:
			typeof statusPayload.INBUCKET_URL === "string"
				? statusPayload.INBUCKET_URL
				: null,
		restUrl:
			typeof statusPayload.REST_URL === "string" ? statusPayload.REST_URL : null,
		studioUrl:
			typeof statusPayload.STUDIO_URL === "string"
				? statusPayload.STUDIO_URL
				: null,
	};
}

function readJsonFile(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

export function getSnapshotManifestPath(snapshotDir) {
	return path.join(snapshotDir, "manifest.json");
}

export function readSnapshotManifest(snapshotDir) {
	return readJsonFile(getSnapshotManifestPath(snapshotDir));
}

export function listLocalSupabaseSnapshots(snapshotRoot = getSupabaseSnapshotRoot()) {
	if (!fs.existsSync(snapshotRoot)) {
		return [];
	}

	return fs
		.readdirSync(snapshotRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const snapshotDir = path.join(snapshotRoot, entry.name);
			const manifest = readSnapshotManifest(snapshotDir);
			const createdAt = manifest?.createdAt || null;
			const dataPath = manifest?.files?.data?.path || path.join(snapshotDir, "data.sql");
			const sizeBytes = fs.existsSync(dataPath) ? fs.statSync(dataPath).size : 0;
			return {
				snapshotId: manifest?.snapshotId || entry.name,
				snapshotDir,
				createdAt,
				workstationId: manifest?.workstationId || null,
				manifest,
				sizeBytes,
			};
		})
		.sort((left, right) => {
			const leftSortKey = String(left.createdAt || left.snapshotId || "");
			const rightSortKey = String(right.createdAt || right.snapshotId || "");
			return rightSortKey.localeCompare(leftSortKey);
		});
}

export function resolveSnapshotSelection(
	selection,
	snapshotRoot = getSupabaseSnapshotRoot(),
) {
	const normalizedSelection = String(selection || "").trim();
	const snapshots = listLocalSupabaseSnapshots(snapshotRoot);
	if (!normalizedSelection || normalizedSelection.toLowerCase() === "latest") {
		return snapshots[0] || null;
	}

	const directCandidates = [];
	if (path.isAbsolute(normalizedSelection)) {
		directCandidates.push(normalizedSelection);
	} else {
		directCandidates.push(path.join(snapshotRoot, normalizedSelection));
	}

	for (const candidate of directCandidates) {
		if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
			const manifest = readSnapshotManifest(candidate);
			const dataPath = manifest?.files?.data?.path || path.join(candidate, "data.sql");
			return {
				snapshotId: manifest?.snapshotId || path.basename(candidate),
				snapshotDir: candidate,
				createdAt: manifest?.createdAt || null,
				workstationId: manifest?.workstationId || null,
				manifest,
				sizeBytes: fs.existsSync(dataPath) ? fs.statSync(dataPath).size : 0,
			};
		}
	}

	return (
		snapshots.find(
			(snapshot) =>
				String(snapshot.snapshotId || "").toLowerCase() ===
				normalizedSelection.toLowerCase(),
		) || null
	);
}

export function hashFile(filePath) {
	const hash = crypto.createHash("sha256");
	hash.update(fs.readFileSync(filePath));
	return hash.digest("hex");
}

export function buildRepoMigrationFingerprint(repoRoot) {
	const migrationRoot = path.join(repoRoot, "supabase", "migrations");
	if (!fs.existsSync(migrationRoot)) {
		return {
			hash: null,
			count: 0,
			files: [],
			latest: null,
		};
	}

	const fileNames = fs
		.readdirSync(migrationRoot, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));

	const hash = crypto.createHash("sha256");
	for (const fileName of fileNames) {
		hash.update(fileName);
		hash.update("\n");
		hash.update(fs.readFileSync(path.join(migrationRoot, fileName)));
		hash.update("\n");
	}

	return {
		hash: fileNames.length > 0 ? hash.digest("hex") : null,
		count: fileNames.length,
		files: fileNames,
		latest: fileNames.length > 0 ? fileNames[fileNames.length - 1] : null,
	};
}

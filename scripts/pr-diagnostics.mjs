#!/usr/bin/env node
/**
 * pr-diagnostics.mjs
 *
 * Fetches all open PRs in a GitHub repo, reports on their CI status, flags
 * duplicates by title similarity, and highlights any PRs that are stuck in
 * "action_required" (CI approval pending) or have never had a CI run.
 *
 * Usage:
 *   node scripts/pr-diagnostics.mjs [--repo owner/name] [--json]
 *
 * Repository resolution order:
 *   1. --repo owner/name CLI argument
 *   2. GITHUB_REPOSITORY environment variable (set automatically by GitHub Actions)
 *   3. git remote get-url origin (derived from the local checkout)
 *
 * Authentication (optional — unauthenticated requests are rate-limited to 60/hr):
 *   - Set GITHUB_TOKEN environment variable, or
 *   - Log in via the GitHub CLI (`gh auth login`) for automatic token reuse.
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GITHUB_API = "https://api.github.com";

// ---------------------------------------------------------------------------
// Repository slug resolution
// ---------------------------------------------------------------------------

/** @returns {string|null} */
function repositorySlugFromArgs() {
	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "--repo") return process.argv[i + 1] ?? null;
		if (arg.startsWith("--repo=")) return arg.slice("--repo=".length) || null;
	}
	return null;
}

/** @returns {string|null} */
function repositorySlugFromGitRemote() {
	try {
		const remoteUrl = execSync("git remote get-url origin", {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		// SSH: git@github.com:owner/repo.git
		const sshMatch = remoteUrl.match(/^[^@]+@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/);
		if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

		// HTTPS: https://github.com/owner/repo.git
		const httpsMatch = remoteUrl.match(/^[a-z]+:\/\/[^/]+\/([^/]+)\/(.+?)(?:\.git)?$/i);
		if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;

		return null;
	} catch {
		return null;
	}
}

/**
 * Parses and validates an "owner/repo" slug string.
 * @param {string|null} slug
 * @returns {{ owner: string, repo: string }}
 */
export function parseRepositorySlug(slug) {
	if (typeof slug !== "string" || !slug) {
		throw new Error(
			"Unable to determine the GitHub repository. " +
				"Pass --repo owner/name, set GITHUB_REPOSITORY, or configure git remote origin.",
		);
	}
	const parts = slug.trim().split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error(
			`Invalid repository slug "${slug}". Expected format: owner/name. ` +
				"Pass --repo owner/name, set GITHUB_REPOSITORY, or configure git remote origin.",
		);
	}
	return { owner: parts[0], repo: parts[1] };
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function githubToken() {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
	// Fall back to gh CLI stored credentials when available
	try {
		return execSync("gh auth token", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch {
		return null;
	}
}

/**
 * Fetches a GitHub API endpoint, enriching errors with actionable guidance.
 *
 * @param {string} owner
 * @param {string} path  API path (starting with /)
 * @param {Record<string,string|number>} [params]
 */
async function ghFetch(owner, path, params = {}) {
	const token = githubToken();
	const url = new URL(`${GITHUB_API}${path}`);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

	const headers = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	const res = await fetch(url.toString(), { headers });

	if (!res.ok) {
		let hint = "";
		if (res.status === 401) hint = " — GITHUB_TOKEN is set but invalid or expired.";
		else if (res.status === 403) {
			hint = token
				? " — token lacks required scopes (needs repo + actions:read)."
				: " — unauthenticated rate limit exceeded. Set GITHUB_TOKEN or run `gh auth login`.";
		} else if (res.status === 404) hint = ` — repository "${owner}/…" not found or not accessible.`;
		throw new Error(`GitHub API ${path} → HTTP ${res.status} ${res.statusText}${hint}`);
	}

	return res.json();
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {Record<string,string|number>} [params]
 */
async function fetchAllPages(owner, repo, path, params = {}) {
	const results = [];
	let page = 1;
	while (true) {
		const items = await ghFetch(owner, path, { ...params, per_page: 100, page });
		results.push(...items);
		if (items.length < 100) break;
		page++;
	}
	return results;
}

// ---------------------------------------------------------------------------
// Duplicate detection — Jaccard similarity on title trigrams (connected components)
// ---------------------------------------------------------------------------

/** @param {string} str */
export function trigrams(str) {
	const s = str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
	const set = new Set();
	for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3));
	return set;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} Jaccard similarity in [0, 1]
 */
export function jaccard(a, b) {
	const ta = trigrams(a);
	const tb = trigrams(b);
	let intersection = 0;
	for (const t of ta) if (tb.has(t)) intersection++;
	const union = ta.size + tb.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

export const DUPLICATE_THRESHOLD = 0.45; // titles ≥ 45% similar are flagged as duplicates

/**
 * Groups PRs whose titles are similar using a connected-components BFS so that
 * transitive matches (A≈B and B≈C) end up in the same group even when A≉C.
 *
 * @param {Array<{number: number, title: string}>} prs
 * @returns {Array<Array<{number: number, title: string}>>}
 */
export function findDuplicateGroups(prs) {
	// Build undirected similarity graph
	/** @type {Map<number, Set<number>>} */
	const neighbors = new Map();
	for (let i = 0; i < prs.length; i++) {
		for (let j = i + 1; j < prs.length; j++) {
			if (jaccard(prs[i].title, prs[j].title) >= DUPLICATE_THRESHOLD) {
				if (!neighbors.has(prs[i].number)) neighbors.set(prs[i].number, new Set());
				if (!neighbors.has(prs[j].number)) neighbors.set(prs[j].number, new Set());
				neighbors.get(prs[i].number).add(prs[j].number);
				neighbors.get(prs[j].number).add(prs[i].number);
			}
		}
	}

	// BFS to find connected components (only PRs that have at least one similar peer)
	const prByNumber = new Map(prs.map((pr) => [pr.number, pr]));
	const visited = new Set();
	const groups = [];

	for (const pr of prs) {
		if (!neighbors.has(pr.number) || visited.has(pr.number)) continue;

		const group = [];
		const queue = [pr.number];
		visited.add(pr.number);

		while (queue.length > 0) {
			const num = queue.shift();
			group.push(prByNumber.get(num));
			for (const neighbor of neighbors.get(num) ?? []) {
				if (!visited.has(neighbor)) {
					visited.add(neighbor);
					queue.push(neighbor);
				}
			}
		}

		groups.push(group);
	}

	return groups;
}

// ---------------------------------------------------------------------------
// CI status per PR (named "CI" workflow only — avoids picking up CodeQL/njsscan)
// ---------------------------------------------------------------------------

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} headSha
 * @returns {Promise<{status: string, conclusion: string|null, run_number?: number, html_url?: string, error?: string}>}
 */
async function fetchCiStatus(owner, repo, headSha) {
	try {
		const runs = await ghFetch(owner, `/repos/${owner}/${repo}/actions/runs`, {
			head_sha: headSha,
			per_page: 20,
		});

		if (!runs.workflow_runs?.length) return { status: "no-runs", conclusion: null };

		// Only consider the workflow named "CI" — other workflows (CodeQL, njsscan)
		// run on the same SHA and must not be misreported as the CI gate.
		const ciRun = runs.workflow_runs.find((r) => r.name === "CI");
		if (!ciRun) return { status: "no-ci-run", conclusion: null };

		return {
			status: ciRun.status,
			conclusion: ciRun.conclusion,
			run_number: ciRun.run_number,
			html_url: ciRun.html_url,
		};
	} catch (err) {
		// Surface the error message so auth/network failures are visible in output
		return { status: "error", conclusion: null, error: err.message };
	}
}

// ---------------------------------------------------------------------------
// Main (only runs when invoked directly, not when imported for tests)
// ---------------------------------------------------------------------------

async function main() {
	const token = githubToken();
	if (!token) {
		console.error(
			"⚠  No GitHub token found. " +
				"Set GITHUB_TOKEN or run `gh auth login` for authenticated requests.\n" +
				"   Proceeding unauthenticated (rate-limited to 60 requests/hour).",
		);
	}

	const jsonOutput = process.argv.includes("--json");

	const slug =
		repositorySlugFromArgs() ?? process.env.GITHUB_REPOSITORY ?? repositorySlugFromGitRemote();
	const { owner, repo } = parseRepositorySlug(slug);

	console.error(`Fetching open PRs for ${owner}/${repo}…`);
	const prs = await fetchAllPages(owner, repo, `/repos/${owner}/${repo}/pulls`, { state: "open" });

	if (prs.length === 0) {
		console.log("No open PRs found.");
		return;
	}

	console.error(`Found ${prs.length} open PRs. Fetching CI status…`);

	// Fetch CI status for every PR in parallel (batched to avoid rate limits)
	const BATCH_SIZE = 8;
	const enriched = [];
	for (let i = 0; i < prs.length; i += BATCH_SIZE) {
		const batch = prs.slice(i, i + BATCH_SIZE);
		const statuses = await Promise.all(batch.map((pr) => fetchCiStatus(owner, repo, pr.head.sha)));
		for (let k = 0; k < batch.length; k++) {
			enriched.push({ ...batch[k], ci: statuses[k] });
		}
	}

	// Sort: action_required first, then error/no-runs, then failure, then rest
	enriched.sort((a, b) => {
		const priority = (pr) => {
			if (pr.ci.status === "action_required" || pr.ci.conclusion === "action_required") return 0;
			if (pr.ci.status === "error") return 1;
			if (pr.ci.status === "no-runs" || pr.ci.status === "no-ci-run") return 2;
			if (pr.ci.conclusion === "failure") return 3;
			return 4;
		};
		const diff = priority(a) - priority(b);
		return diff !== 0 ? diff : b.number - a.number;
	});

	const duplicateGroups = findDuplicateGroups(enriched);
	const duplicateNumbers = new Set(duplicateGroups.flat().map((pr) => pr.number));

	if (jsonOutput) {
		const report = {
			generated_at: new Date().toISOString(),
			repository: `${owner}/${repo}`,
			open_pr_count: enriched.length,
			duplicate_groups: duplicateGroups.map((g) => ({
				prs: g.map((pr) => ({ number: pr.number, title: pr.title })),
			})),
			prs: enriched.map((pr) => ({
				number: pr.number,
				title: pr.title,
				created_at: pr.created_at,
				branch: pr.head.ref,
				ci: pr.ci,
				is_duplicate_candidate: duplicateNumbers.has(pr.number),
				url: pr.html_url,
			})),
		};
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	// ── Human-readable report ──────────────────────────────────────────────

	const line = "─".repeat(80);

	console.log(`\n${line}`);
	console.log(`  PR Diagnostics  ·  ${owner}/${repo}  ·  ${new Date().toISOString()}`);
	console.log(`  ${enriched.length} open PRs`);
	console.log(line);

	// CI summary
	const byStatus = {};
	for (const pr of enriched) {
		const key =
			pr.ci.conclusion === "action_required" || pr.ci.status === "action_required"
				? "action_required"
				: pr.ci.status === "error"
					? "error"
					: pr.ci.conclusion ?? pr.ci.status ?? "unknown";
		byStatus[key] = (byStatus[key] ?? 0) + 1;
	}
	console.log("\nCI status summary:");
	for (const [k, v] of Object.entries(byStatus)) {
		const icon =
			k === "success"
				? "✅"
				: k === "action_required"
					? "⏳"
					: k === "failure"
						? "❌"
						: k === "no-runs" || k === "no-ci-run"
							? "⬜"
							: k === "error"
								? "🔴"
								: "❓";
		console.log(`  ${icon}  ${k}: ${v}`);
	}

	// Duplicate groups
	if (duplicateGroups.length > 0) {
		console.log(`\n⚠️  Possible duplicate PRs (${duplicateGroups.length} group(s)):`);
		for (const group of duplicateGroups) {
			console.log(`  • ${group.map((pr) => `#${pr.number}`).join(", ")} — "${group[0].title.slice(0, 60)}…"`);
		}
	}

	// Per-PR table
	console.log("\nAll open PRs:");
	console.log(`  ${"#".padEnd(5)} ${"CI".padEnd(18)} ${"Title".padEnd(55)} Branch`);
	console.log(`  ${"-".repeat(5)} ${"-".repeat(18)} ${"-".repeat(55)} ${"-".repeat(30)}`);

	for (const pr of enriched) {
		const ciLabel =
			pr.ci.conclusion === "action_required" || pr.ci.status === "action_required"
				? "⏳ needs-approval"
				: pr.ci.conclusion === "success"
					? "✅ success"
					: pr.ci.conclusion === "failure"
						? "❌ failure"
						: pr.ci.status === "in_progress"
							? "🔄 running"
							: pr.ci.status === "no-runs" || pr.ci.status === "no-ci-run"
								? "⬜ no-runs"
								: pr.ci.status === "error"
									? `🔴 err`
									: `❓ ${pr.ci.conclusion ?? pr.ci.status}`;

		const dup = duplicateNumbers.has(pr.number) ? " [dup?]" : "";
		const title = (pr.title.slice(0, 54) + (pr.title.length > 54 ? "…" : "")).padEnd(55);
		const num = `#${pr.number}`.padEnd(5);
		const ci = ciLabel.padEnd(18);
		const branch = pr.head.ref.slice(0, 30);
		console.log(`  ${num} ${ci} ${title}${dup} ${branch}`);
	}

	// Surface any API errors prominently
	const errored = enriched.filter((pr) => pr.ci.status === "error");
	if (errored.length > 0) {
		console.log(`\n🔴 API errors while fetching CI status (${errored.length} PR(s)):`);
		for (const pr of errored.slice(0, 5)) {
			console.log(`   #${pr.number}: ${pr.ci.error ?? "unknown error"}`);
		}
	}

	// Recommendations
	const actionRequired = enriched.filter(
		(pr) => pr.ci.status === "action_required" || pr.ci.conclusion === "action_required",
	);
	if (actionRequired.length > 0) {
		console.log(`\n📋 Next actions:`);
		console.log(`  ${actionRequired.length} PRs are blocked waiting for CI approval.`);
		console.log(`  → Merge .github/workflows/approve-copilot-ci.yml to unblock future PRs.`);
		console.log(`  → For existing PRs, go to the Actions tab and click "Approve and run" on each.`);
		console.log(
			`     Blocked PRs: ${actionRequired
				.slice(0, 8)
				.map((pr) => `#${pr.number}`)
				.join(", ")}${actionRequired.length > 8 ? "…" : ""}`,
		);
	}

	if (duplicateGroups.length > 0) {
		console.log(`\n  ${duplicateGroups.length} duplicate group(s) detected — consider closing redundant PRs.`);
	}

	console.log(`\n${line}\n`);
}

// Guard: only run main when this file is the direct entry point, not when
// imported by tests or other modules.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
	main().catch((err) => {
		console.error(`pr-diagnostics: ${err.message}`);
		process.exit(1);
	});
}

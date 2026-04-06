#!/usr/bin/env node
/**
 * pr-diagnostics.mjs
 *
 * Fetches all open PRs in the Suite repo, reports on their CI status, flags
 * duplicates by title similarity, and highlights any PRs that are stuck in
 * "action_required" (CI approval pending) or have never had a CI run.
 *
 * Usage:
 *   node scripts/pr-diagnostics.mjs [--json]
 *
 * Requires the GITHUB_TOKEN environment variable (or gh CLI auth) with at
 * least `repo` and `actions:read` scopes.
 */

import { execSync } from "node:child_process";

// Repository coordinates — prefer the GITHUB_REPOSITORY env var (set
// automatically by GitHub Actions) so the script is portable across forks.
// Falls back to the repo slug for local use.
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? "Koraji95-coder/Suite";
const [OWNER, REPO] = GITHUB_REPOSITORY.split("/");
const GITHUB_API = "https://api.github.com";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function githubToken() {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
	// Fall back to gh CLI stored credentials
	try {
		return execSync("gh auth token", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch {
		return null;
	}
}

async function ghFetch(path, params = {}) {
	const token = githubToken();
	const url = new URL(`${GITHUB_API}${path}`);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

	const headers = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	const res = await fetch(url.toString(), { headers });
	if (!res.ok) {
		throw new Error(`GitHub API ${path} → HTTP ${res.status} ${res.statusText}`);
	}
	return res.json();
}

async function fetchAllPages(path, params = {}) {
	const results = [];
	let page = 1;
	while (true) {
		const items = await ghFetch(path, { ...params, per_page: 100, page });
		results.push(...items);
		if (items.length < 100) break;
		page++;
	}
	return results;
}

// ---------------------------------------------------------------------------
// Duplicate detection — Jaccard similarity on title trigrams
// ---------------------------------------------------------------------------

function trigrams(str) {
	const s = str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
	const set = new Set();
	for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3));
	return set;
}

function jaccard(a, b) {
	const ta = trigrams(a);
	const tb = trigrams(b);
	let intersection = 0;
	for (const t of ta) if (tb.has(t)) intersection++;
	const union = ta.size + tb.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

const DUPLICATE_THRESHOLD = 0.45; // titles ≥ 45% similar are flagged as duplicates

function findDuplicateGroups(prs) {
	const groups = [];
	const visited = new Set();

	for (let i = 0; i < prs.length; i++) {
		if (visited.has(prs[i].number)) continue;
		const group = [prs[i]];
		for (let j = i + 1; j < prs.length; j++) {
			if (visited.has(prs[j].number)) continue;
			if (jaccard(prs[i].title, prs[j].title) >= DUPLICATE_THRESHOLD) {
				group.push(prs[j]);
				visited.add(prs[j].number);
			}
		}
		if (group.length > 1) {
			for (const pr of group) visited.add(pr.number);
			groups.push(group);
		}
	}
	return groups;
}

// ---------------------------------------------------------------------------
// CI status per PR (latest run from any workflow on the head SHA)
// ---------------------------------------------------------------------------

async function fetchCiStatus(headSha) {
	try {
		const runs = await ghFetch(`/repos/${OWNER}/${REPO}/actions/runs`, {
			head_sha: headSha,
			per_page: 10,
		});
		if (!runs.workflow_runs?.length) return { status: "no-runs", conclusion: null };

		// Find the most recent CI run
		const ciRun = runs.workflow_runs.find((r) => r.name === "CI") ?? runs.workflow_runs[0];
		return {
			status: ciRun.status,
			conclusion: ciRun.conclusion,
			run_number: ciRun.run_number,
			html_url: ciRun.html_url,
		};
	} catch {
		return { status: "unknown", conclusion: null };
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const jsonOutput = process.argv.includes("--json");

	console.error("Fetching open PRs…");
	const prs = await fetchAllPages(`/repos/${OWNER}/${REPO}/pulls`, { state: "open" });

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
		const statuses = await Promise.all(batch.map((pr) => fetchCiStatus(pr.head.sha)));
		for (let k = 0; k < batch.length; k++) {
			enriched.push({ ...batch[k], ci: statuses[k] });
		}
	}

	// Sort: action_required first, then no-runs, then by PR number desc
	enriched.sort((a, b) => {
		const priority = (pr) => {
			if (pr.ci.status === "action_required" || pr.ci.conclusion === "action_required") return 0;
			if (pr.ci.status === "no-runs") return 1;
			if (pr.ci.conclusion === "failure") return 2;
			return 3;
		};
		const diff = priority(a) - priority(b);
		return diff !== 0 ? diff : b.number - a.number;
	});

	const duplicateGroups = findDuplicateGroups(enriched);
	const duplicateNumbers = new Set(duplicateGroups.flat().map((pr) => pr.number));

	if (jsonOutput) {
		const report = {
			generated_at: new Date().toISOString(),
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
	console.log(`  Suite PR Diagnostics  ·  ${new Date().toISOString()}`);
	console.log(`  ${enriched.length} open PRs`);
	console.log(line);

	// CI summary
	const byStatus = {};
	for (const pr of enriched) {
		const key =
			pr.ci.conclusion === "action_required" || pr.ci.status === "action_required"
				? "action_required"
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
						: k === "no-runs"
							? "⬜"
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
	console.log(`  ${"#".padEnd(5)} ${"CI".padEnd(16)} ${"Title".padEnd(55)} Branch`);
	console.log(`  ${"-".repeat(5)} ${"-".repeat(16)} ${"-".repeat(55)} ${"-".repeat(30)}`);

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
							: pr.ci.status === "no-runs"
								? "⬜ no-runs"
								: `❓ ${pr.ci.conclusion ?? pr.ci.status}`;

		const dup = duplicateNumbers.has(pr.number) ? " [dup?]" : "";
		const title = (pr.title.slice(0, 54) + (pr.title.length > 54 ? "…" : "")).padEnd(55);
		const num = `#${pr.number}`.padEnd(5);
		const ci = ciLabel.padEnd(16);
		const branch = pr.head.ref.slice(0, 30);
		console.log(`  ${num} ${ci} ${title}${dup} ${branch}`);
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

main().catch((err) => {
	console.error(`pr-diagnostics: ${err.message}`);
	process.exit(1);
});

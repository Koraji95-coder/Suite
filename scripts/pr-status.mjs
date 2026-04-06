#!/usr/bin/env node
/**
 * pr-status.mjs
 *
 * Fetches and reports current open PR status for Suite (and optionally Office).
 * Uses the `gh` CLI for GitHub API access — run `gh auth login` first.
 *
 * Exit codes:
 *   0  — report printed successfully (even if PRs exist)
 *   1  — fatal error (gh missing, not authenticated, or unhandled exception)
 *
 * Usage:
 *   node scripts/pr-status.mjs                    # Suite repo only
 *   node scripts/pr-status.mjs --office            # Suite + Office repos
 *   node scripts/pr-status.mjs --repo owner/repo   # Any single repo
 */

import { spawnSync } from "node:child_process";
import process from "node:process";

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

/** Whether to include the Office repo in the report. */
const includeOffice = args.includes("--office");

/** Optional override: a single "owner/repo" string from --repo <value>. */
const customRepoIdx = args.indexOf("--repo");
const customRepo = customRepoIdx !== -1 ? args[customRepoIdx + 1] ?? null : null;

if (customRepoIdx !== -1 && !customRepo) {
	console.error("pr-status: --repo requires a value in the form owner/repo (e.g. Koraji95-coder/Suite).");
	process.exit(1);
}

if (customRepo && !/^[^/]+\/[^/]+$/.test(customRepo)) {
	console.error(`pr-status: invalid --repo value "${customRepo}". Expected format: owner/repo (e.g. Koraji95-coder/Suite).`);
	process.exit(1);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUITE_REPO = "Koraji95-coder/Suite";
const OFFICE_REPO = "Koraji95-coder/Office";

/** Repos to report on, in order. */
const repos = customRepo
	? [customRepo]
	: includeOffice
		? [SUITE_REPO, OFFICE_REPO]
		: [SUITE_REPO];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if `cmd` resolves on the current PATH.
 * Uses `where` on Windows, `which` elsewhere.
 * @param {string} cmd
 * @returns {boolean}
 */
function commandExists(cmd) {
	const probe =
		process.platform === "win32"
			? spawnSync("where", [cmd], { stdio: "ignore" })
			: spawnSync("which", [cmd], { stdio: "ignore" });
	return probe.status === 0;
}

/**
 * Runs `gh <ghArgs>` and parses stdout as JSON.
 * Throws with a descriptive message on non-zero exit or spawn error.
 * @param {string[]} ghArgs
 * @returns {unknown}
 */
function ghJson(ghArgs) {
	const result = spawnSync("gh", ghArgs, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	// spawnSync sets result.error when the process could not be started
	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		// Always include exit code; append stderr when it contains useful detail.
		const stderr = result.stderr.trim();
		const detail = stderr
			? `gh exited with code ${result.status}: ${stderr}`
			: `gh exited with code ${result.status}`;
		throw new Error(detail);
	}

	return JSON.parse(result.stdout.trim());
}

// ── PR classification ─────────────────────────────────────────────────────────

/**
 * Maps a PR title to a coarse category for grouping in the report.
 * Priority: security > fix > docs > tests > chore > wip > other.
 *
 * "security" uses a word-boundary regex (/\bsecurity\b/) to avoid false
 * positives from unrelated words that contain "security" as a substring
 * (e.g. "insecurity", "cybersecurity tooling").
 *
 * @param {string} title
 * @returns {"security"|"fix"|"docs"|"tests"|"chore"|"wip"|"other"}
 */
function categorizePr(title) {
	const t = title.toLowerCase();
	// Explicit security-scoped prefixes take highest priority, then a word-
	// boundary match on "security" anywhere in the title.
	if (
		t.startsWith("fix(security)") ||
		t.startsWith("security:") ||
		t.startsWith("[security]") ||
		/\bsecurity\b/.test(t)
	) {
		return "security";
	}
	if (t.startsWith("fix(") || t.startsWith("fix:")) return "fix";
	if (t.startsWith("docs:") || t.startsWith("[docs]")) return "docs";
	if (
		t.startsWith("test:") ||
		t.startsWith("[test") ||
		t.includes("integration test") ||
		t.includes("add integration")
	) {
		return "tests";
	}
	if (t.startsWith("chore:") || t.startsWith("refactor:") || t.startsWith("ci:")) return "chore";
	if (t.startsWith("[wip]")) return "wip";
	return "other";
}

/**
 * Derives a short human-readable CI status label from an array of check objects.
 * Precedence: failing > needs-approval/pending > passing > mixed.
 *
 * @param {{ conclusion: string|null, status: string }[]} checks
 * @returns {string}  emoji-prefixed label
 */
function ciStatusLabel(checks) {
	if (!checks || checks.length === 0) return "⏳ no checks";

	// Each check exposes a `conclusion` once completed; fall back to `status` while in-flight.
	const outcomes = checks.map((c) => c.conclusion ?? c.status);

	const isFailed = (o) => o === "failure" || o === "timed_out" || o === "cancelled";
	const isPending = (o) =>
		o === "action_required" ||
		o === "pending" ||
		o === "in_progress" ||
		o === "queued" ||
		o === "waiting";
	const isSuccess = (o) => o === "success" || o === "skipped" || o === "neutral";

	if (outcomes.some(isFailed)) return "❌ failing";
	if (outcomes.some(isPending)) return "⏸  needs approval / pending";
	if (outcomes.every(isSuccess)) return "✅ passing";
	return "⚠️  mixed";
}

// ── Duplicate detection ───────────────────────────────────────────────────────

/**
 * Groups PRs that likely address the same issue by comparing a normalized
 * version of their titles (conventional-commit prefixes and bracket tags stripped,
 * truncated to 60 chars, lower-cased).
 *
 * Returns only groups with 2+ members.
 *
 * @param {{ number: number, title: string }[]} prs
 * @returns {number[][]}  each element is an array of PR numbers in the same group
 */
function detectDuplicates(prs) {
	const normalize = (title) =>
		title
			.replace(/^\[.*?\]\s*/, "") // strip leading [TAG] markers
			.replace(/^(fix|docs|test|chore|feat|refactor)[(:]\S*\s*/, "") // strip conventional commit prefix
			.trim()
			.toLowerCase()
			.slice(0, 60); // compare only the first 60 chars to catch near-dupes

	/** @type {Record<string, number[]>} */
	const groups = {};
	for (const pr of prs) {
		const key = normalize(pr.title);
		if (!groups[key]) groups[key] = [];
		groups[key].push(pr.number);
	}

	return Object.values(groups).filter((group) => group.length > 1);
}

// ── Per-repo reporting ────────────────────────────────────────────────────────

/**
 * Fetches all open PRs for `repo`, annotates each with its CI check results,
 * groups them by category, flags duplicates, and prints a summary to stdout.
 *
 * Individual `gh pr checks` failures are silently swallowed (a PR can exist
 * before any checks have been registered), so `checks` may be an empty array.
 *
 * @param {string} repo  "owner/repo" string
 */
async function reportRepo(repo) {
	console.log(`\n${"─".repeat(70)}`);
	console.log(`📋  Open PRs: ${repo}`);
	console.log("─".repeat(70));

	// ── 1. List open PRs ──────────────────────────────────────────────────
	let prs;
	try {
		prs = ghJson([
			"pr",
			"list",
			"--repo",
			repo,
			"--state",
			"open",
			"--limit",
			"100",
			"--json",
			"number,title,isDraft,state,headRefName,createdAt,labels,author",
		]);
	} catch (err) {
		// Provide a targeted hint when the repo doesn't exist or isn't accessible.
		const msg = err.message.toLowerCase();
		const hint =
			msg.includes("not found") || msg.includes("could not resolve") || msg.includes("does not exist")
				? ` (repo not found or not accessible — check the name and your gh auth scope)`
				: "";
		console.error(`  Error fetching PRs from ${repo}: ${err.message}${hint}`);
		return;
	}

	if (prs.length === 0) {
		console.log("  ✅ No open PRs.");
		return;
	}

	// ── 2. Annotate each PR with its CI check results ─────────────────────
	const prsWithChecks = await Promise.all(
		prs.map(async (pr) => {
			let checks = [];
			try {
				checks = ghJson([
					"pr",
					"checks",
					String(pr.number),
					"--repo",
					repo,
					"--json",
					"name,status,conclusion",
				]);
			} catch {
				// Silently ignore: checks may not exist yet for very new or draft PRs.
			}
			return { ...pr, checks };
		}),
	);

	// ── 3. Group PRs by category for display ─────────────────────────────
	/** @type {Record<string, typeof prsWithChecks>} */
	const byCategory = {};
	for (const pr of prsWithChecks) {
		const cat = categorizePr(pr.title);
		if (!byCategory[cat]) byCategory[cat] = [];
		byCategory[cat].push(pr);
	}

	const CATEGORY_ORDER = ["security", "fix", "tests", "docs", "chore", "wip", "other"];
	const CATEGORY_LABEL = {
		security: "🔐  Security",
		fix: "🐛  Fixes",
		tests: "🧪  Tests",
		docs: "📚  Docs",
		chore: "🔧  Chore",
		wip: "🚧  WIP",
		other: "🗂  Other",
	};

	for (const cat of CATEGORY_ORDER) {
		const group = byCategory[cat];
		if (!group || group.length === 0) continue;
		console.log(`\n${CATEGORY_LABEL[cat] ?? cat}:`);
		for (const pr of group) {
			const draftTag = pr.isDraft ? " [DRAFT]" : "";
			const ciLabel = ciStatusLabel(pr.checks);
			console.log(
				`  #${String(pr.number).padEnd(5)} ${ciLabel.padEnd(32)} ${draftTag ? draftTag.padEnd(9) : "         "} ${pr.title}`,
			);
		}
	}

	// ── 4. Flag duplicate PRs ─────────────────────────────────────────────
	const duplicateGroups = detectDuplicates(prsWithChecks);
	if (duplicateGroups.length > 0) {
		console.log("\n⚠️   Possible duplicate PRs (may address the same issue):");
		for (const group of duplicateGroups) {
			const labels = group.map((prNumber) => {
				const pr = prsWithChecks.find((p) => p.number === prNumber);
				return `#${prNumber} "${pr?.title ?? "?"}"`;
			});
			console.log(`  ${labels.join("  ↔  ")}`);
		}
	}

	// ── 5. Print summary ──────────────────────────────────────────────────
	const drafts = prsWithChecks.filter((pr) => pr.isDraft);
	const passingCi = prsWithChecks.filter((pr) => ciStatusLabel(pr.checks) === "✅ passing");
	const failingCi = prsWithChecks.filter((pr) => ciStatusLabel(pr.checks) === "❌ failing");
	const pendingCi = prsWithChecks.filter((pr) =>
		ciStatusLabel(pr.checks).includes("needs approval"),
	);
	// "Ready to merge" = non-draft with all CI checks passing
	const readyToMerge = prsWithChecks.filter(
		(pr) => !pr.isDraft && ciStatusLabel(pr.checks) === "✅ passing",
	);

	console.log("\n── Summary ──────────────────────────────────────────────────────");
	console.log(`  Total open:        ${prs.length}`);
	console.log(`  Drafts:            ${drafts.length}`);
	console.log(`  CI passing:        ${passingCi.length}`);
	console.log(`  CI needs approval: ${pendingCi.length}`);
	console.log(`  CI failing:        ${failingCi.length}`);
	console.log(`  Ready to merge:    ${readyToMerge.length} (non-draft + CI passing)`);
	if (duplicateGroups.length > 0) {
		console.log(`  Duplicate groups:  ${duplicateGroups.length} (review before merging)`);
	}
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
	// Ensure gh CLI is available before attempting any API calls.
	if (!commandExists("gh")) {
		console.error(
			"pr-status: `gh` CLI is not installed or not on PATH.\n" +
				"Install from https://cli.github.com/ and run `gh auth login` first.",
		);
		process.exit(1);
	}

	// Verify that the user is authenticated with GitHub.
	const authCheck = spawnSync("gh", ["auth", "status"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (authCheck.status !== 0) {
		console.error("pr-status: `gh` is not authenticated. Run `gh auth login` first.");
		process.exit(1);
	}

	console.log(`pr-status: checking ${repos.join(", ")}`);
	for (const repo of repos) {
		await reportRepo(repo);
	}
	console.log(`\n${"─".repeat(70)}`);
}

main().catch((err) => {
	console.error(`pr-status: ${err.message}`);
	process.exit(1);
});

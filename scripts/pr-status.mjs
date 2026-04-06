#!/usr/bin/env node
/**
 * pr-status.mjs
 *
 * Fetches and reports current open PR status for Suite (and optionally Office).
 * Uses the `gh` CLI for GitHub API access.
 *
 * Usage:
 *   node scripts/pr-status.mjs              # Suite repo only
 *   node scripts/pr-status.mjs --office     # Include Office repo
 *   node scripts/pr-status.mjs --repo owner/repo  # Custom repo
 */

import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const includeOffice = args.includes("--office");
const customRepoIdx = args.indexOf("--repo");
const customRepo = customRepoIdx !== -1 ? args[customRepoIdx + 1] : null;

const SUITE_REPO = "Koraji95-coder/Suite";
const OFFICE_REPO = "Koraji95-coder/Office";

const repos = customRepo
	? [customRepo]
	: includeOffice
		? [SUITE_REPO, OFFICE_REPO]
		: [SUITE_REPO];

function commandExists(cmd) {
	const probe =
		process.platform === "win32"
			? spawnSync("where", [cmd], { stdio: "ignore" })
			: spawnSync("which", [cmd], { stdio: "ignore" });
	return probe.status === 0;
}

function ghJson(args) {
	const result = spawnSync("gh", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || `gh exited with code ${result.status}`);
	}
	return JSON.parse(result.stdout.trim());
}

function categorizePr(title) {
	const t = title.toLowerCase();
	if (t.startsWith("fix(security)") || t.startsWith("[security]") || t.includes("security")) {
		return "security";
	}
	if (t.startsWith("fix(") || t.startsWith("fix:")) return "fix";
	if (t.startsWith("docs:") || t.startsWith("[docs]")) return "docs";
	if (t.startsWith("test:") || t.startsWith("[test") || t.includes("integration test") || t.includes("add integration")) {
		return "tests";
	}
	if (t.startsWith("chore:") || t.startsWith("refactor:") || t.startsWith("ci:")) return "chore";
	if (t.startsWith("[wip]")) return "wip";
	return "other";
}

function ciStatusLabel(checks) {
	if (!checks || checks.length === 0) return "⏳ no checks";
	const conclusions = checks.map((c) => c.conclusion || c.status);
	if (conclusions.some((c) => c === "failure" || c === "timed_out" || c === "cancelled")) {
		return "❌ failing";
	}
	if (conclusions.some((c) => c === "action_required" || c === "pending" || c === "in_progress" || c === "queued" || c === "waiting")) {
		return "⏸  needs approval / pending";
	}
	if (conclusions.every((c) => c === "success" || c === "skipped" || c === "neutral")) {
		return "✅ passing";
	}
	return "⚠️  mixed";
}

function detectDuplicates(prs) {
	// Group PRs by the first ~40 chars of normalized title (strip fix/docs/test prefix)
	const normalize = (title) =>
		title
			.replace(/^\[.*?\]\s*/, "")
			.replace(/^(fix|docs|test|chore|feat|refactor)[(:]\S*\s*/, "")
			.trim()
			.toLowerCase()
			.slice(0, 60);

	const groups = {};
	for (const pr of prs) {
		const key = normalize(pr.title);
		if (!groups[key]) groups[key] = [];
		groups[key].push(pr.number);
	}
	const duplicateSets = Object.values(groups).filter((g) => g.length > 1);
	return duplicateSets;
}

async function reportRepo(repo) {
	console.log(`\n${"─".repeat(70)}`);
	console.log(`📋  Open PRs: ${repo}`);
	console.log("─".repeat(70));

	let prs;
	try {
		prs = ghJson([
			"pr", "list",
			"--repo", repo,
			"--state", "open",
			"--limit", "100",
			"--json", "number,title,isDraft,state,headRefName,createdAt,labels,author,checksUrl",
		]);
	} catch (err) {
		console.error(`  Error fetching PRs: ${err.message}`);
		return;
	}

	if (prs.length === 0) {
		console.log("  ✅ No open PRs.");
		return;
	}

	// Fetch check status for each PR
	const withChecks = [];
	for (const pr of prs) {
		let checks = [];
		try {
			const checksRaw = ghJson([
				"pr", "checks", String(pr.number),
				"--repo", repo,
				"--json", "name,status,conclusion",
			]);
			checks = checksRaw;
		} catch {
			// gh pr checks may fail if no checks have been posted yet
		}
		withChecks.push({ ...pr, checks });
	}

	// Group by category
	const byCategory = {};
	for (const pr of withChecks) {
		const cat = categorizePr(pr.title);
		if (!byCategory[cat]) byCategory[cat] = [];
		byCategory[cat].push(pr);
	}

	const catOrder = ["security", "fix", "tests", "docs", "chore", "wip", "other"];
	const catLabel = {
		security: "🔐  Security",
		fix: "🐛  Fixes",
		tests: "🧪  Tests",
		docs: "📚  Docs",
		chore: "🔧  Chore",
		wip: "🚧  WIP",
		other: "🗂  Other",
	};

	for (const cat of catOrder) {
		const group = byCategory[cat];
		if (!group || group.length === 0) continue;
		console.log(`\n${catLabel[cat] ?? cat}:`);
		for (const pr of group) {
			const draftTag = pr.isDraft ? " [DRAFT]" : "";
			const ciLabel = ciStatusLabel(pr.checks);
			console.log(`  #${String(pr.number).padEnd(5)} ${ciLabel.padEnd(32)} ${draftTag ? draftTag.padEnd(9) : "         "} ${pr.title}`);
		}
	}

	// Duplicate detection
	const dups = detectDuplicates(withChecks);
	if (dups.length > 0) {
		console.log(`\n⚠️   Possible duplicate PRs (may address the same issue):`);
		for (const group of dups) {
			const groupPrs = group.map((n) => {
				const p = withChecks.find((pr) => pr.number === n);
				return `#${n} "${p?.title ?? "?"}"`;
			});
			console.log(`  ${groupPrs.join("  ↔  ")}`);
		}
	}

	// Summary
	const readyToMerge = withChecks.filter(
		(pr) => !pr.isDraft && ciStatusLabel(pr.checks) === "✅ passing",
	);
	const drafts = withChecks.filter((pr) => pr.isDraft);
	const failing = withChecks.filter((pr) => ciStatusLabel(pr.checks) === "❌ failing");
	const needsApproval = withChecks.filter((pr) =>
		ciStatusLabel(pr.checks).includes("needs approval"),
	);

	console.log(`\n── Summary ──────────────────────────────────────────────────────`);
	console.log(`  Total open:       ${prs.length}`);
	console.log(`  Drafts:           ${drafts.length}`);
	console.log(`  CI passing:       ${withChecks.filter((p) => ciStatusLabel(p.checks) === "✅ passing").length}`);
	console.log(`  CI needs approval:${needsApproval.length}`);
	console.log(`  CI failing:       ${failing.length}`);
	console.log(`  Ready to merge:   ${readyToMerge.length} (non-draft + CI passing)`);
	if (dups.length > 0) {
		console.log(`  Duplicate groups: ${dups.length} (review before merging)`);
	}
}

async function main() {
	if (!commandExists("gh")) {
		console.error(
			"pr-status: `gh` CLI is not installed or not on PATH.\n" +
			"Install from https://cli.github.com/ and run `gh auth login` first.",
		);
		process.exit(1);
	}

	// Verify auth
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

import { describe, expect, it } from "vitest";
import { categorizePr, ciStatusLabel, detectDuplicates } from "./pr-status.mjs";

// ── categorizePr ──────────────────────────────────────────────────────────────

describe("categorizePr", () => {
	describe("security", () => {
		it("classifies fix(security): prefix as security", () => {
			expect(categorizePr("fix(security): remove raw error from response")).toBe("security");
		});
		it("classifies security: prefix as security", () => {
			expect(categorizePr("security: tighten auth flow")).toBe("security");
		});
		it("classifies [Security] tag as security", () => {
			expect(categorizePr("[Security] Remove raw server response text")).toBe("security");
		});
		it("classifies title containing the word security as security", () => {
			expect(categorizePr("remove security leak in email auth")).toBe("security");
		});
		it("does not classify 'insecurity' as security (word boundary)", () => {
			// 'insecurity' contains 'security' as a suffix — should fall through to 'fix'
			expect(categorizePr("fix: address insecurity in the UX copy")).toBe("fix");
		});
	});

	describe("fix", () => {
		it("classifies fix: prefix as fix", () => {
			expect(categorizePr("fix: correct button label")).toBe("fix");
		});
		it("classifies fix(scope): prefix without security scope as fix", () => {
			expect(categorizePr("fix(auth): stop leaking raw server response text")).toBe("fix");
		});
		it("classifies plain fix(scope) without security scope as fix", () => {
			expect(categorizePr("fix(auth): normalize redirect url")).toBe("fix");
		});
	});

	describe("docs", () => {
		it("classifies docs: prefix as docs", () => {
			expect(categorizePr("docs: update setup guide")).toBe("docs");
		});
		it("classifies [docs] tag as docs", () => {
			expect(categorizePr("[docs] fix typo in API reference")).toBe("docs");
		});
	});

	describe("tests", () => {
		it("classifies test: prefix as tests", () => {
			expect(categorizePr("test: add coverage for auth module")).toBe("tests");
		});
		it("classifies [tests] tag as tests", () => {
			expect(categorizePr("[tests] add integration test for email flow")).toBe("tests");
		});
		it("classifies 'add integration test' phrase as tests", () => {
			expect(categorizePr("feat: add integration test for autocad pipeline")).toBe("tests");
		});
	});

	describe("chore", () => {
		it("classifies chore: prefix as chore", () => {
			expect(categorizePr("chore: bump dependencies")).toBe("chore");
		});
		it("classifies refactor: prefix as chore", () => {
			expect(categorizePr("refactor: simplify auth helpers")).toBe("chore");
		});
		it("classifies ci: prefix as chore", () => {
			expect(categorizePr("ci: pin node version in workflow")).toBe("chore");
		});
	});

	describe("wip", () => {
		it("classifies [wip] tag as wip", () => {
			expect(categorizePr("[wip] rough draft of new dashboard")).toBe("wip");
		});
	});

	describe("other", () => {
		it("classifies feat: prefix as other", () => {
			expect(categorizePr("feat: add pr:status script")).toBe("other");
		});
		it("classifies unrecognised prefix as other", () => {
			expect(categorizePr("perf: reduce bundle size")).toBe("other");
		});
	});
});

// ── ciStatusLabel ─────────────────────────────────────────────────────────────

describe("ciStatusLabel", () => {
	it("returns no-checks label for empty array", () => {
		expect(ciStatusLabel([])).toBe("⏳ no checks");
	});

	it("returns no-checks label for null/undefined", () => {
		expect(ciStatusLabel(null)).toBe("⏳ no checks");
		expect(ciStatusLabel(undefined)).toBe("⏳ no checks");
	});

	it("returns failing for a failure conclusion", () => {
		expect(ciStatusLabel([{ conclusion: "failure", status: "completed" }])).toBe("❌ failing");
	});

	it("returns failing for timed_out conclusion", () => {
		expect(ciStatusLabel([{ conclusion: "timed_out", status: "completed" }])).toBe("❌ failing");
	});

	it("returns failing for cancelled conclusion", () => {
		expect(ciStatusLabel([{ conclusion: "cancelled", status: "completed" }])).toBe("❌ failing");
	});

	it("returns pending for action_required conclusion", () => {
		expect(ciStatusLabel([{ conclusion: "action_required", status: "completed" }])).toBe(
			"⏸  needs approval / pending",
		);
	});

	it("returns pending for in_progress status (no conclusion yet)", () => {
		expect(ciStatusLabel([{ conclusion: null, status: "in_progress" }])).toBe(
			"⏸  needs approval / pending",
		);
	});

	it("returns pending for queued status", () => {
		expect(ciStatusLabel([{ conclusion: null, status: "queued" }])).toBe(
			"⏸  needs approval / pending",
		);
	});

	it("returns passing for success conclusion", () => {
		expect(ciStatusLabel([{ conclusion: "success", status: "completed" }])).toBe("✅ passing");
	});

	it("returns passing for skipped conclusion", () => {
		expect(ciStatusLabel([{ conclusion: "skipped", status: "completed" }])).toBe("✅ passing");
	});

	it("returns passing for neutral conclusion", () => {
		expect(ciStatusLabel([{ conclusion: "neutral", status: "completed" }])).toBe("✅ passing");
	});

	it("returns passing when all checks are success or skipped", () => {
		expect(
			ciStatusLabel([
				{ conclusion: "success", status: "completed" },
				{ conclusion: "skipped", status: "completed" },
				{ conclusion: "neutral", status: "completed" },
			]),
		).toBe("✅ passing");
	});

	it("failure takes priority over pending", () => {
		expect(
			ciStatusLabel([
				{ conclusion: "action_required", status: "completed" },
				{ conclusion: "failure", status: "completed" },
			]),
		).toBe("❌ failing");
	});

	it("pending takes priority over passing", () => {
		expect(
			ciStatusLabel([
				{ conclusion: "success", status: "completed" },
				{ conclusion: "action_required", status: "completed" },
			]),
		).toBe("⏸  needs approval / pending");
	});

	it("returns mixed for unrecognised conclusion not in any bucket", () => {
		// An outcome that isn't failed, pending, or success → mixed
		expect(ciStatusLabel([{ conclusion: "unknown_future_value", status: "completed" }])).toBe(
			"⚠️  mixed",
		);
	});
});

// ── detectDuplicates ──────────────────────────────────────────────────────────

describe("detectDuplicates", () => {
	it("returns empty array when there are no duplicates", () => {
		const prs = [
			{ number: 1, title: "fix: auth redirect" },
			{ number: 2, title: "docs: update readme" },
			{ number: 3, title: "chore: bump deps" },
		];
		expect(detectDuplicates(prs)).toEqual([]);
	});

	it("groups two PRs with the same normalized title", () => {
		// Both have the same body after stripping their conventional-commit prefixes
		const prs = [
			{ number: 10, title: "fix: remove raw error text from email auth" },
			{ number: 11, title: "feat: remove raw error text from email auth" },
		];
		const groups = detectDuplicates(prs);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toContain(10);
		expect(groups[0]).toContain(11);
	});

	it("groups three PRs with effectively the same normalized title", () => {
		// fix(auth):, fix(security):, and [Security] all strip to the same body
		const prs = [
			{ number: 57, title: "fix: stop leaking raw server response text from email auth" },
			{ number: 63, title: "feat: stop leaking raw server response text from email auth" },
			{ number: 71, title: "chore: stop leaking raw server response text from email auth" },
		];
		const groups = detectDuplicates(prs);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toHaveLength(3);
	});

	it("does not group PRs with clearly different titles", () => {
		const prs = [
			{ number: 1, title: "fix: normalize redirect URL on login" },
			{ number: 2, title: "fix: correct button label in settings" },
			{ number: 3, title: "chore: upgrade vitest to v3" },
		];
		expect(detectDuplicates(prs)).toEqual([]);
	});

	it("treats titles as duplicates only on the first 60 chars after normalization", () => {
		// Both titles share the same first 60 chars after stripping the prefix
		const shared = "a".repeat(60);
		const prs = [
			{ number: 10, title: `fix: ${shared}one` },
			{ number: 11, title: `fix: ${shared}two` },
		];
		const groups = detectDuplicates(prs);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toContain(10);
		expect(groups[0]).toContain(11);
	});

	it("returns empty array for a single PR", () => {
		expect(detectDuplicates([{ number: 1, title: "fix: something" }])).toEqual([]);
	});

	it("returns empty array for an empty list", () => {
		expect(detectDuplicates([])).toEqual([]);
	});
});

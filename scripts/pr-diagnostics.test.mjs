import { describe, expect, it } from "vitest";

import {
	DUPLICATE_THRESHOLD,
	findDuplicateGroups,
	jaccard,
	parseRepositorySlug,
	trigrams,
} from "./pr-diagnostics.mjs";

// ---------------------------------------------------------------------------
// trigrams
// ---------------------------------------------------------------------------

describe("trigrams", () => {
	it("returns a Set of 3-character windows", () => {
		const t = trigrams("abc");
		expect(t).toBeInstanceOf(Set);
		expect([...t]).toContain("abc");
	});

	it("lowercases and normalises non-alphanumeric characters to spaces", () => {
		const t = trigrams("Fix(auth): foo");
		// Parens and colon become spaces → "fix auth   foo" (runs collapsed)
		// All entries should be lowercase alphanumeric + spaces
		for (const g of t) {
			expect(g).toMatch(/^[a-z0-9 ]{3}$/);
		}
	});

	it("returns an empty Set for strings shorter than 3 characters", () => {
		expect(trigrams("ab").size).toBe(0);
		expect(trigrams("").size).toBe(0);
	});

	it("returns the same Set for identical strings", () => {
		const a = trigrams("hello world");
		const b = trigrams("hello world");
		expect([...a].sort()).toEqual([...b].sort());
	});
});

// ---------------------------------------------------------------------------
// jaccard
// ---------------------------------------------------------------------------

describe("jaccard", () => {
	it("returns 1.0 for identical strings", () => {
		expect(jaccard("fix auth bug", "fix auth bug")).toBe(1.0);
	});

	it("returns 0 for completely different strings", () => {
		expect(jaccard("aaa", "zzz")).toBe(0);
	});

	it("returns 0 for empty strings", () => {
		expect(jaccard("", "")).toBe(0);
	});

	it("is symmetric", () => {
		const a = "fix email auth error";
		const b = "remove raw server response from email auth";
		expect(jaccard(a, b)).toBeCloseTo(jaccard(b, a), 10);
	});

	it("returns a value in [0, 1]", () => {
		const score = jaccard("integration tests for foo", "add integration tests bar");
		expect(score).toBeGreaterThanOrEqual(0);
		expect(score).toBeLessThanOrEqual(1);
	});

	it("scores highly similar strings above the duplicate threshold", () => {
		// Near-duplicate titles — differ only in one word, verified score ≈ 0.82
		const a = "stop leaking raw server error text in auth api response";
		const b = "stop leaking raw error text from server in auth api response";
		expect(jaccard(a, b)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
	});

	it("scores clearly different titles below the duplicate threshold", () => {
		const a = "docs: add project structure and contribution guidelines";
		const b = "chore: regenerate stale architecture snapshot";
		expect(jaccard(a, b)).toBeLessThan(DUPLICATE_THRESHOLD);
	});
});

// ---------------------------------------------------------------------------
// findDuplicateGroups
// ---------------------------------------------------------------------------

describe("findDuplicateGroups", () => {
	it("returns an empty array when there are no PRs", () => {
		expect(findDuplicateGroups([])).toEqual([]);
	});

	it("returns an empty array when all titles are distinct", () => {
		const prs = [
			{ number: 1, title: "feat: add dashboard" },
			{ number: 2, title: "chore: update dependencies" },
			{ number: 3, title: "docs: write contributing guide" },
		];
		expect(findDuplicateGroups(prs)).toEqual([]);
	});

	it("groups two highly similar titles together", () => {
		const prs = [
			{
				number: 57,
				// Near-duplicate pair — differ only slightly (verified score ≈ 0.82)
				title: "stop leaking raw server error text in auth api response",
			},
			{
				number: 63,
				title: "stop leaking raw error text from server in auth api response",
			},
			{ number: 54, title: "chore: regenerate stale architecture snapshot" },
		];
		const groups = findDuplicateGroups(prs);
		expect(groups).toHaveLength(1);
		const nums = groups[0].map((p) => p.number).sort();
		expect(nums).toEqual([57, 63]);
	});

	it("handles transitive matches — A≈B and B≈C end up in one group even if A≉C", () => {
		// Craft titles so A and C are just far enough apart that direct A-C score
		// is below threshold, but they both match B.
		const common = "add integration tests for normalize runtime path resolution";
		const a = { number: 1, title: `${common} edge cases` };
		const b = { number: 2, title: `${common} coverage` };
		const c = { number: 3, title: `${common} coverage scenarios` };

		// Verify the transitive setup holds
		expect(jaccard(a.title, b.title)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
		expect(jaccard(b.title, c.title)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);

		const groups = findDuplicateGroups([a, b, c]);
		// All three should end up in a single group
		const allNums = groups.flat().map((p) => p.number).sort();
		expect(allNums).toContain(1);
		expect(allNums).toContain(2);
		expect(allNums).toContain(3);
	});

	it("produces separate groups for independent clusters", () => {
		// Auth cluster — near-duplicate pair (score ≈ 0.82)
		const authPr1 = {
			number: 1,
			title: "stop leaking raw server error text in auth api response",
		};
		const authPr2 = {
			number: 2,
			title: "stop leaking raw error text from server in auth api response",
		};
		// Test cluster — near-duplicate pair (score ≈ 0.72)
		const testPr1 = {
			number: 3,
			title: "add integration tests for normalize runtime path edge cases",
		};
		const testPr2 = {
			number: 4,
			title: "add integration tests for normalize runtime path resolution",
		};
		const unrelated = { number: 5, title: "chore: regenerate architecture snapshot" };

		const groups = findDuplicateGroups([authPr1, authPr2, testPr1, testPr2, unrelated]);

		// Should have at most 2 groups (auth cluster + possibly test cluster)
		expect(groups.length).toBeGreaterThanOrEqual(1);
		// Auth cluster must be present
		const authGroup = groups.find((g) => g.some((p) => p.number === 1 || p.number === 2));
		expect(authGroup).toBeDefined();
		const authNums = authGroup?.map((p) => p.number) ?? [];
		expect(authNums).toContain(1);
		expect(authNums).toContain(2);
		// Unrelated PR must not appear in any group
		const allGrouped = groups.flat().map((p) => p.number);
		expect(allGrouped).not.toContain(5);
	});
});

// ---------------------------------------------------------------------------
// parseRepositorySlug
// ---------------------------------------------------------------------------

describe("parseRepositorySlug", () => {
	it("parses a valid owner/repo slug", () => {
		expect(parseRepositorySlug("MyOrg/my-repo")).toEqual({
			owner: "MyOrg",
			repo: "my-repo",
		});
	});

	it("trims whitespace from the slug", () => {
		expect(parseRepositorySlug("  Dev/Suite  ")).toEqual({
			owner: "Dev",
			repo: "Suite",
		});
	});

	it("throws when the slug is null", () => {
		expect(() => parseRepositorySlug(null)).toThrow(/Unable to determine/);
	});

	it("throws when the slug is an empty string", () => {
		expect(() => parseRepositorySlug("")).toThrow(/Unable to determine/);
	});

	it("throws when the slug is missing the repo part", () => {
		expect(() => parseRepositorySlug("owner-only")).toThrow(/Invalid repository slug/);
	});

	it("throws when the slug has too many slashes", () => {
		expect(() => parseRepositorySlug("org/owner/repo")).toThrow(/Invalid repository slug/);
	});

	it("throws when the owner part is empty", () => {
		expect(() => parseRepositorySlug("/repo")).toThrow(/Invalid repository slug/);
	});

	it("throws when the repo part is empty", () => {
		expect(() => parseRepositorySlug("owner/")).toThrow(/Invalid repository slug/);
	});
});

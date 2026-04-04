import type {
	AutoDraftAction,
	AutoDraftExecuteRevisionContext,
} from "./autodraftService";

export type AutoDraftCommitReviewStatus =
	| "ready"
	| "needs_context"
	| "review";

export type AutoDraftCommitReviewFamily =
	| "note"
	| "title_block"
	| "text_replacement"
	| "text_delete"
	| "text_swap"
	| "dimension"
	| "unsupported";

export type AutoDraftCommitReviewItem = {
	id: string;
	family: AutoDraftCommitReviewFamily;
	familyLabel: string;
	status: AutoDraftCommitReviewStatus;
	title: string;
	summary: string;
	target: string;
	reason: string;
};

export type AutoDraftCommitReviewSummary = {
	readyCount: number;
	needsContextCount: number;
	reviewCount: number;
	items: ReadonlyArray<AutoDraftCommitReviewItem>;
};

type TitleBlockFieldKey = "revision" | "drawing_number" | "title" | "date";

const TITLE_BLOCK_FIELD_MATCHERS: Array<{
	key: TitleBlockFieldKey;
	label: string;
	patterns: RegExp[];
}> = [
	{
		key: "revision",
		label: "Revision",
		patterns: [
			/\bcurrent\s+rev(?:ision)?\b/i,
			/\brev(?:ision)?\b/i,
			/\bsheet\s+rev(?:ision)?\b/i,
		],
	},
	{
		key: "drawing_number",
		label: "Drawing number",
		patterns: [
			/\bdrawing\s+number\b/i,
			/\bdrawing\s+no\b/i,
			/\bdwg\s+no\b/i,
			/\bsheet\s+number\b/i,
		],
	},
	{
		key: "title",
		label: "Drawing title",
		patterns: [/\bdrawing\s+title\b/i, /\bsheet\s+title\b/i, /\btitle\b/i],
	},
	{
		key: "date",
		label: "Issued date",
		patterns: [/\bissue\s+date\b/i, /\brevision\s+date\b/i, /\bdate\b/i],
	},
];

function asString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function resolveTitleBlockField(
	action: AutoDraftAction,
): { key: TitleBlockFieldKey; label: string } | null {
	const candidates = [asString(action.markup?.text), action.action].filter(Boolean);
	for (const candidate of candidates) {
		for (const matcher of TITLE_BLOCK_FIELD_MATCHERS) {
			if (matcher.patterns.some((pattern) => pattern.test(candidate))) {
				return { key: matcher.key, label: matcher.label };
			}
		}
	}
	return null;
}

function resolveTitleBlockTargetValue(
	fieldKey: TitleBlockFieldKey,
	revisionContext: AutoDraftExecuteRevisionContext | undefined,
): string {
	if (!revisionContext) return "";
	switch (fieldKey) {
		case "revision":
			return asString(revisionContext.revision);
		case "drawing_number":
			return asString(revisionContext.drawingNumber);
		case "title":
			return asString(revisionContext.title);
		case "date":
			return "";
	}
}

function buildNoteReviewItem(action: AutoDraftAction): AutoDraftCommitReviewItem {
	const noteText = asString(action.markup?.text) || action.action;
	return {
		id: action.id,
		family: "note",
		familyLabel: "Note",
		status: "ready",
		title: noteText,
		summary: "Commit-ready note/callout write through the CAD bridge.",
		target: "Target family: note entity",
		reason: "",
	};
}

function buildTitleBlockReviewItem(
	action: AutoDraftAction,
	revisionContext: AutoDraftExecuteRevisionContext | undefined,
): AutoDraftCommitReviewItem {
	const field = resolveTitleBlockField(action);
	if (!field) {
		return {
			id: action.id,
			family: "title_block",
			familyLabel: "Title block",
			status: "review",
			title: action.action,
			summary: "Structured title block commit is enabled, but the target field is still ambiguous.",
			target: "",
			reason: "Preview can run, but commit will skip until the field can be resolved.",
		};
	}

	const targetValue = resolveTitleBlockTargetValue(field.key, revisionContext);
	if (!targetValue) {
		return {
			id: action.id,
			family: "title_block",
			familyLabel: "Title block",
			status: "needs_context",
			title: action.action,
			summary: `${field.label} update is supported, but commit still needs revision context.`,
			target: `Field: ${field.label}`,
			reason: `Add ${field.label.toLowerCase()} in execution context before committing.`,
		};
	}

	return {
		id: action.id,
		family: "title_block",
		familyLabel: "Title block",
		status: "ready",
		title: action.action,
		summary: `${field.label} is ready for attribute-backed commit.`,
		target: `${field.label}: ${targetValue}`,
		reason: "",
	};
}

function buildTextReplacementReviewItem(
	action: AutoDraftAction,
): AutoDraftCommitReviewItem {
	const replacement = action.replacement;
	if (
		replacement?.status === "resolved" &&
		asString(replacement.target_entity_id) &&
		asString(replacement.new_text)
	) {
		return {
			id: action.id,
			family: "text_replacement",
			familyLabel: "Text update",
			status: "ready",
			title: action.action,
			summary: "Resolved text replacement is ready for commit.",
			target: `${asString(replacement.old_text) || "Existing text"} -> ${replacement.new_text} (${replacement.target_entity_id})`,
			reason: "",
		};
	}
	return {
		id: action.id,
		family: "text_replacement",
		familyLabel: "Text update",
		status: "review",
		title: action.action,
		summary: "Text replacement commit requires a resolved entity target.",
		target: "",
		reason: "Resolve the replacement target in compare review before committing.",
	};
}

function buildTextDeleteReviewItem(
	action: AutoDraftAction,
): AutoDraftCommitReviewItem {
	const hasBounds = Boolean(action.markup?.bounds);
	if (hasBounds) {
		return {
			id: action.id,
			family: "text_delete",
			familyLabel: "Text delete",
			status: "ready",
			title: action.action,
			summary:
				"Text deletion is commit-enabled when preview resolves a single CAD text target.",
			target: "Preview resolves target from markup bounds",
			reason: "",
		};
	}
	return {
		id: action.id,
		family: "text_delete",
		familyLabel: "Text delete",
		status: "review",
		title: action.action,
		summary: "Text deletion commit needs a resolvable markup target.",
		target: "",
		reason: "Markup bounds are required before preview can resolve the CAD text target.",
	};
}

function buildDimensionReviewItem(
	action: AutoDraftAction,
): AutoDraftCommitReviewItem {
	const targetValue = asString(action.markup?.text);
	if (targetValue && action.markup?.bounds) {
		return {
			id: action.id,
			family: "dimension",
			familyLabel: "Dimension",
			status: "ready",
			title: action.action,
			summary:
				"Dimension text override is commit-enabled when preview resolves a single CAD dimension target.",
			target: `Override: ${targetValue}`,
			reason: "",
		};
	}
	return {
		id: action.id,
		family: "dimension",
		familyLabel: "Dimension",
		status: "review",
		title: action.action,
		summary: "Dimension commit needs explicit override text and a resolvable markup target.",
		target: "",
		reason: "Dimension text and markup bounds are required before preview can resolve the CAD target.",
	};
}

function buildTextSwapReviewItem(
	action: AutoDraftAction,
): AutoDraftCommitReviewItem {
	const calloutPoints = Array.isArray(action.markup?.meta?.callout_points)
		? action.markup?.meta?.callout_points
		: [];
	const hasBounds = Boolean(action.markup?.bounds);
	if (calloutPoints.length >= 2 || hasBounds) {
		return {
			id: action.id,
			family: "text_swap",
			familyLabel: "Text swap",
			status: "ready",
			title: action.action,
			summary:
				"Text swap is commit-enabled when preview resolves two CAD text targets.",
			target:
				calloutPoints.length >= 2
					? "Preview resolves two text targets from callout endpoints"
					: "Preview resolves two text targets from markup bounds",
			reason: "",
		};
	}
	return {
		id: action.id,
		family: "text_swap",
		familyLabel: "Text swap",
		status: "review",
		title: action.action,
		summary: "Text swap commit needs two resolvable CAD text targets.",
		target: "",
		reason:
			"Provide two callout endpoints or bounds that isolate exactly two CAD text targets.",
	};
}

function buildUnsupportedReviewItem(
	action: AutoDraftAction,
): AutoDraftCommitReviewItem {
	return {
		id: action.id,
		family: "unsupported",
		familyLabel: "Manual",
		status: "review",
		title: action.action,
		summary: "This action family is not commit-enabled through the bridge yet.",
		target: "",
		reason: `Category ${action.category} remains preview-only in the current tranche.`,
	};
}

function compareStatus(
	left: AutoDraftCommitReviewStatus,
	right: AutoDraftCommitReviewStatus,
) {
	const order: Record<AutoDraftCommitReviewStatus, number> = {
		ready: 0,
		needs_context: 1,
		review: 2,
	};
	return order[left] - order[right];
}

export function buildAutoDraftCommitReview(
	actions: ReadonlyArray<AutoDraftAction>,
	revisionContext?: AutoDraftExecuteRevisionContext,
): AutoDraftCommitReviewSummary {
	const items = actions
		.map((action) => {
			if (action.category === "NOTE") {
				return buildNoteReviewItem(action);
			}
			if (action.category === "TITLE_BLOCK") {
				return buildTitleBlockReviewItem(action, revisionContext);
			}
			if (action.category === "ADD" && action.replacement) {
				return buildTextReplacementReviewItem(action);
			}
			if (action.category === "DELETE") {
				return buildTextDeleteReviewItem(action);
			}
			if (action.category === "SWAP") {
				return buildTextSwapReviewItem(action);
			}
			if (action.category === "DIMENSION") {
				return buildDimensionReviewItem(action);
			}
			return buildUnsupportedReviewItem(action);
		})
		.sort((left, right) => {
			const statusOrder = compareStatus(left.status, right.status);
			if (statusOrder !== 0) {
				return statusOrder;
			}
			return left.familyLabel.localeCompare(right.familyLabel) || left.id.localeCompare(right.id);
		});

	return {
		readyCount: items.filter((item) => item.status === "ready").length,
		needsContextCount: items.filter((item) => item.status === "needs_context")
			.length,
		reviewCount: items.filter((item) => item.status === "review").length,
		items,
	};
}

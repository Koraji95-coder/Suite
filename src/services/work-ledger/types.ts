import type { Database } from "@/supabase/database";

type WorkLedgerBaseRow = Database["public"]["Tables"]["work_ledger_entries"]["Row"];
type WorkLedgerBaseInsert =
	Database["public"]["Tables"]["work_ledger_entries"]["Insert"];
type WorkLedgerBaseUpdate =
	Database["public"]["Tables"]["work_ledger_entries"]["Update"];

export type WorkLedgerRow = WorkLedgerBaseRow & {
	lifecycle_state?: WorkLedgerLifecycleState | null;
};
export type WorkLedgerInsert = WorkLedgerBaseInsert & {
	lifecycle_state?: WorkLedgerLifecycleState | null;
};
export type WorkLedgerUpdate = WorkLedgerBaseUpdate & {
	lifecycle_state?: WorkLedgerLifecycleState | null;
};
export type WorkLedgerPublishJobRow =
	Database["public"]["Tables"]["work_ledger_publish_jobs"]["Row"];

export type WorkLedgerSourceKind =
	| "manual"
	| "git_checkpoint"
	| "agent_run"
	| "watchdog"
	| "architecture"
	| "project";

export type WorkLedgerPublishState = "draft" | "ready" | "published";
export type WorkLedgerLifecycleState =
	| "planned"
	| "active"
	| "completed"
	| "archived";

export interface WorkLedgerInput {
	title: string;
	summary: string;
	sourceKind?: WorkLedgerSourceKind;
	commitRefs?: string[];
	projectId?: string | null;
	appArea?: string | null;
	architecturePaths?: string[];
	hotspotIds?: string[];
	lifecycleState?: WorkLedgerLifecycleState;
	publishState?: WorkLedgerPublishState;
	externalReference?: string | null;
	externalUrl?: string | null;
}

export interface WorkLedgerFilters {
	projectId?: string | null;
	appArea?: string | null;
	lifecycleState?: WorkLedgerLifecycleState | "all";
	publishState?: WorkLedgerPublishState | "all";
	pathQuery?: string;
	search?: string;
	limit?: number;
}

export interface WorktalePublishPayload {
	title: string;
	summary: string;
	markdown: string;
	json: Record<string, unknown>;
}

export interface WorktaleReadinessChecks {
	cliInstalled: boolean;
	cliPath: string;
	repoPath: string;
	repoExists: boolean;
	gitRepository: boolean;
	gitEmailConfigured: boolean;
	gitEmail: string;
	bootstrapped: boolean;
	postCommitHookInstalled: boolean;
	postPushHookInstalled: boolean;
}

export interface WorktaleReadinessResponse {
	ok: boolean;
	publisher: "worktale";
	workstationId: string;
	ready: boolean;
	checks: WorktaleReadinessChecks;
	issues: string[];
	recommendedActions: string[];
}

export interface WorkLedgerPublishResult {
	ok: boolean;
	entry: WorkLedgerRow;
	job: WorkLedgerPublishJobRow;
	artifacts: {
		artifactDir: string;
		markdownPath: string;
		jsonPath: string;
	};
	publisher: "worktale";
	workstationId: string;
	ready: boolean;
	checks: WorktaleReadinessChecks;
	issues: string[];
	recommendedActions: string[];
}

export interface WorkLedgerOpenArtifactFolderResult {
	ok: boolean;
	entryId: string;
	jobId: string;
	artifactDir: string;
}

export interface WorkLedgerDraftSuggestion {
	suggestionId: string;
	sourceKey: string;
	sourceKind: WorkLedgerSourceKind;
	title: string;
	summary: string;
	commitRefs: string[];
	projectId?: string | null;
	appArea?: string | null;
	architecturePaths: string[];
	hotspotIds: string[];
	lifecycleState: WorkLedgerLifecycleState;
	publishState: WorkLedgerPublishState;
	externalReference?: string | null;
	createdAt: string;
	details?: Record<string, unknown>;
}

export interface WorkLedgerDraftSuggestionsResponse {
	ok: boolean;
	count: number;
	sources: {
		git: number;
		agent: number;
		watchdog: number;
	};
	suggestions: WorkLedgerDraftSuggestion[];
}

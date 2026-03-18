import type { Database } from "@/supabase/database";

export type WorkLedgerRow =
	Database["public"]["Tables"]["work_ledger_entries"]["Row"];
export type WorkLedgerInsert =
	Database["public"]["Tables"]["work_ledger_entries"]["Insert"];
export type WorkLedgerUpdate =
	Database["public"]["Tables"]["work_ledger_entries"]["Update"];
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

export interface WorkLedgerInput {
	title: string;
	summary: string;
	sourceKind?: WorkLedgerSourceKind;
	commitRefs?: string[];
	projectId?: string | null;
	appArea?: string | null;
	architecturePaths?: string[];
	hotspotIds?: string[];
	publishState?: WorkLedgerPublishState;
	externalReference?: string | null;
	externalUrl?: string | null;
}

export interface WorkLedgerFilters {
	projectId?: string | null;
	appArea?: string | null;
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

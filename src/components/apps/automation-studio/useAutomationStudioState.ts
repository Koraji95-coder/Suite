import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import { logger } from "@/lib/logger";
import {
	projectDeliverableRegisterService,
	type ProjectDeliverableRegisterSnapshot,
} from "@/services/projectDeliverableRegisterService";
import {
	projectAutomationReceiptService,
	type ProjectAutomationReceiptRecord,
} from "@/services/projectAutomationReceiptService";
import {
	projectIssueSetService,
	type ProjectIssueSetRecord,
} from "@/services/projectIssueSetService";
import { supabase } from "@/supabase/client";
import type { AutomationStudioContext } from "./automationStudioModels";

export interface AutomationStudioProjectOption {
	id: string;
	name: string;
	description: string;
	watchdogRootPath: string | null;
	pdfPackageRootPath: string | null;
}

export function useAutomationStudioState(args: {
	preferredProjectId?: string;
	preferredIssueSetId?: string;
	preferredRegisterSnapshotId?: string;
	preferredDrawingId?: string;
}) {
	const [projectOptions, setProjectOptions] = useState<
		AutomationStudioProjectOption[]
	>([]);
	const [selectedProjectId, setSelectedProjectId] = useState(
		args.preferredProjectId ?? "",
	);
	const [issueSets, setIssueSets] = useState<ProjectIssueSetRecord[]>([]);
	const [selectedIssueSetId, setSelectedIssueSetId] = useState(
		args.preferredIssueSetId ?? "",
	);
	const [registerSnapshot, setRegisterSnapshot] =
		useState<ProjectDeliverableRegisterSnapshot | null>(null);
	const [receipts, setReceipts] = useState<ProjectAutomationReceiptRecord[]>([]);
	const [loadingProjects, setLoadingProjects] = useState(true);
	const [loadingContext, setLoadingContext] = useState(false);
	const [messages, setMessages] = useState<string[]>([]);

	useEffect(() => {
		let cancelled = false;
		const loadProjects = async () => {
			setLoadingProjects(true);
			try {
				const {
					data: { user },
					error: authError,
				} = await supabase.auth.getUser();
				if (authError || !user) {
					if (!cancelled) {
						setProjectOptions([]);
						setSelectedProjectId("");
					}
					return;
				}

				const { data, error } = await supabase
					.from("projects")
					.select(
						"id, name, description, watchdog_root_path, pdf_package_root_path",
					)
					.eq("user_id", user.id)
					.order("created_at", { ascending: false });

				if (error) {
					throw error;
				}

				if (cancelled) {
					return;
				}

				const nextProjects = (
					(data ?? []) as Array<{
						id: string;
						name: string;
						description: string | null;
						watchdog_root_path: string | null;
						pdf_package_root_path: string | null;
					}>
				).map((project) => ({
					id: project.id,
					name: project.name,
					description: project.description ?? "",
					watchdogRootPath: project.watchdog_root_path,
					pdfPackageRootPath: project.pdf_package_root_path,
				}));

				startTransition(() => {
					setProjectOptions(nextProjects);
					setSelectedProjectId((current) => {
						if (
							args.preferredProjectId &&
							nextProjects.some((project) => project.id === args.preferredProjectId)
						) {
							return args.preferredProjectId;
						}
						if (
							current &&
							nextProjects.some((project) => project.id === current)
						) {
							return current;
						}
						return nextProjects[0]?.id ?? "";
					});
				});
			} catch (error) {
				logger.error(
					"Failed to load Automation Studio project options.",
					"AutomationStudio",
					error,
				);
				if (!cancelled) {
					setMessages(["Unable to load project options for Automation Studio."]);
				}
			} finally {
				if (!cancelled) {
					setLoadingProjects(false);
				}
			}
		};

		void loadProjects();
		return () => {
			cancelled = true;
		};
	}, [args.preferredProjectId]);

	const refreshProjectContext = useCallback(async () => {
		if (!selectedProjectId) {
			setIssueSets([]);
			setRegisterSnapshot(null);
			setReceipts([]);
			return;
		}

		setLoadingContext(true);
		const [issueSetsResult, registerResult, receiptsResult] = await Promise.all([
			projectIssueSetService.fetchIssueSets(selectedProjectId),
			projectDeliverableRegisterService.fetchSnapshot(selectedProjectId),
			projectAutomationReceiptService.fetchReceipts(selectedProjectId),
		]);

		startTransition(() => {
			setIssueSets(issueSetsResult.data);
			setRegisterSnapshot(registerResult.data);
			setReceipts(receiptsResult.data);
			setMessages(
				[
					...(issueSetsResult.error ? [issueSetsResult.error.message] : []),
					...(registerResult.error ? [registerResult.error.message] : []),
					...(receiptsResult.error ? [receiptsResult.error.message] : []),
				].filter(Boolean),
			);
			setSelectedIssueSetId((current) => {
				if (
					args.preferredIssueSetId &&
					issueSetsResult.data.some(
						(issueSet) => issueSet.id === args.preferredIssueSetId,
					)
				) {
					return args.preferredIssueSetId;
				}
				if (
					current &&
					issueSetsResult.data.some((issueSet) => issueSet.id === current)
				) {
					return current;
				}
				return issueSetsResult.data[0]?.id ?? "";
			});
		});
		setLoadingContext(false);
	}, [args.preferredIssueSetId, selectedProjectId]);

	useEffect(() => {
		void refreshProjectContext();
	}, [refreshProjectContext]);

	const selectedProject = useMemo(
		() =>
			projectOptions.find((project) => project.id === selectedProjectId) ?? null,
		[projectOptions, selectedProjectId],
	);
	const selectedIssueSet = useMemo(
		() => issueSets.find((issueSet) => issueSet.id === selectedIssueSetId) ?? null,
		[issueSets, selectedIssueSetId],
	);
	const selectedRegisterRows = useMemo(() => {
		if (!registerSnapshot) {
			return [];
		}
		if (selectedIssueSet?.selectedRegisterRowIds.length) {
			const scopedIds = new Set(selectedIssueSet.selectedRegisterRowIds);
			return registerSnapshot.rows.filter((row) => scopedIds.has(row.id));
		}
		return registerSnapshot.rows.filter((row) => row.issueSetEligible);
	}, [registerSnapshot, selectedIssueSet]);

	const latestReceipt = useMemo(() => {
		if (selectedIssueSetId) {
			return (
				receipts.find(
					(receipt) => (receipt.issueSetId || null) === selectedIssueSetId,
				) ?? null
			);
		}
		return receipts[0] ?? null;
	}, [receipts, selectedIssueSetId]);

	const studioContext = useMemo(
		() =>
			({
				projectId: selectedProjectId || null,
				projectName: selectedProject?.name ?? null,
				issueSetId: selectedIssueSet?.id ?? null,
				issueSetLabel: selectedIssueSet
					? `${selectedIssueSet.issueTag} • ${selectedIssueSet.name}`
					: null,
				registerSnapshotId:
					args.preferredRegisterSnapshotId ??
					selectedIssueSet?.registerSnapshotId ??
					registerSnapshot?.id ??
					null,
				drawingId: args.preferredDrawingId ?? null,
				selectedDrawingPaths: selectedIssueSet?.selectedDrawingPaths ?? [],
				drawingRootPath:
					registerSnapshot?.dwgRootPath ??
					selectedProject?.watchdogRootPath ??
					null,
				watchdogRootPath: selectedProject?.watchdogRootPath ?? null,
				pdfPackageRootPath: selectedProject?.pdfPackageRootPath ?? null,
			}) satisfies AutomationStudioContext,
		[
			args.preferredDrawingId,
			args.preferredRegisterSnapshotId,
			registerSnapshot?.id,
			registerSnapshot?.dwgRootPath,
			selectedIssueSet,
			selectedProject?.pdfPackageRootPath,
			selectedProject?.name,
			selectedProject?.watchdogRootPath,
			selectedProjectId,
		],
	);

	const workflowLinks = useMemo(() => {
		if (!selectedProjectId) {
			return [];
		}
		return [
			{
				label: "Review",
				to: buildProjectDetailHref(selectedProjectId, "review", {
					issueSet: selectedIssueSet?.id ?? null,
				}),
			},
			{
				label: "Issue Sets",
				to: buildProjectDetailHref(selectedProjectId, "issue-sets", {
					issueSet: selectedIssueSet?.id ?? null,
				}),
			},
			{
				label: "Transmittal",
				to: `/app/apps/transmittal-builder?project=${encodeURIComponent(selectedProjectId)}${
					selectedIssueSet?.id
						? `&issueSet=${encodeURIComponent(selectedIssueSet.id)}`
						: ""
				}`,
			},
		];
	}, [selectedIssueSet?.id, selectedProjectId]);

	return {
		projectOptions,
		selectedProject,
		selectedProjectId,
		setSelectedProjectId,
		issueSets,
		selectedIssueSet,
		selectedIssueSetId,
		setSelectedIssueSetId,
		registerSnapshot,
		selectedRegisterRows,
		receipts,
		latestReceipt,
		studioContext,
		workflowLinks,
		loadingProjects,
		loadingContext,
		messages,
		refreshProjectContext,
	};
}

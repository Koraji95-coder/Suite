import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import { standardsCheckerActionService } from "./actionService";
import { standardsCheckerBackendService } from "./backendService";
import {
	type AutodeskReferenceStandardFamily,
	type AutodeskStandardsReferenceSummary,
	fetchAutodeskStandardsReferenceSummary,
} from "./referenceCatalogService";
import {
	type CheckResult,
	categories,
	type ProjectStandardsLatestReview,
	type ProjectStandardsProfileInput,
	type StandardsCategory,
	type StandardsCheckerMode,
	sampleStandards,
} from "./standardsCheckerModels";

interface StandardsCheckerProjectOption {
	id: string;
	name: string;
}

interface StandardsCheckerCadFamilyOption {
	id: string;
	label: string;
	kind: string;
}

function resolveDefaultCadFamilyId(
	reference: AutodeskStandardsReferenceSummary | null,
): string {
	const standards = reference?.standards ?? [];
	const recommendedDefaults = reference?.recommendedDefaults ?? [];
	for (const recommendedId of recommendedDefaults) {
		const matched = standards.find((family) => family.id === recommendedId);
		if (matched) {
			return matched.id;
		}
	}
	return standards[0]?.id ?? "";
}

function buildCadFamilyOptions(
	reference: AutodeskStandardsReferenceSummary | null,
	selectedCadFamilyId: string,
): StandardsCheckerCadFamilyOption[] {
	const baseOptions = (reference?.standards ?? []).map(
		(family: AutodeskReferenceStandardFamily) => ({
			id: family.id,
			label: family.label,
			kind: family.kind,
		}),
	);
	if (
		selectedCadFamilyId &&
		!baseOptions.some((option) => option.id === selectedCadFamilyId)
	) {
		baseOptions.unshift({
			id: selectedCadFamilyId,
			label: selectedCadFamilyId.toUpperCase(),
			kind: "saved",
		});
	}
	return baseOptions;
}

function normalizeIdSet(values: Iterable<string>) {
	return Array.from(values)
		.map((value) => String(value || "").trim().toLowerCase())
		.filter(Boolean)
		.sort();
}

function latestReviewMatchesProfile(args: {
	latestReview: ProjectStandardsLatestReview;
	cadFamilyId: string;
	standardsCategory: StandardsCategory;
	selectedStandardIds: string[];
}) {
	const latestCadFamilyId = String(args.latestReview.cadFamilyId || "").trim();
	if (latestCadFamilyId !== args.cadFamilyId) {
		return false;
	}
	if (args.latestReview.standardsCategory !== args.standardsCategory) {
		return false;
	}
	const latestIds = normalizeIdSet(args.latestReview.selectedStandardIds);
	const selectedIds = normalizeIdSet(args.selectedStandardIds);
	return JSON.stringify(latestIds) === JSON.stringify(selectedIds);
}

export function useStandardsCheckerState(preferredProjectId?: string) {
	const [mode, setMode] = useState<StandardsCheckerMode>("standards");
	const [activeCategory, setActiveCategory] = useState<StandardsCategory>(
		categories[0],
	);
	const [projectOptions, setProjectOptions] = useState<
		StandardsCheckerProjectOption[]
	>([]);
	const [selectedProjectId, setSelectedProjectId] = useState("");
	const [selectedCadFamilyId, setSelectedCadFamilyId] = useState("");
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [loadingProjectProfile, setLoadingProjectProfile] = useState(false);
	const [savingProjectProfile, setSavingProjectProfile] = useState(false);
	const [projectProfileStatus, setProjectProfileStatus] = useState<string | null>(
		null,
	);
	const [reviewStatus, setReviewStatus] = useState<string | null>(null);
	const [selectedStandards, setSelectedStandards] = useState<Set<string>>(
		new Set(),
	);
	const [results, setResults] = useState<CheckResult[]>([]);
	const [running, setRunning] = useState(false);
	const [autodeskStandardsReference, setAutodeskStandardsReference] =
		useState<AutodeskStandardsReferenceSummary | null>(null);
	const defaultCadFamilyId = useMemo(
		() => resolveDefaultCadFamilyId(autodeskStandardsReference),
		[autodeskStandardsReference],
	);

	useEffect(() => {
		let active = true;

		const loadProjects = async () => {
			setLoadingProjects(true);
			try {
				const {
					data: { user },
					error: authError,
				} = await supabase.auth.getUser();
				if (authError || !user) {
					if (active) {
						setProjectOptions([]);
						setSelectedProjectId("");
					}
					return;
				}

				const { data, error } = await supabase
					.from("projects")
					.select("id, name")
					.eq("user_id", user.id)
					.order("created_at", { ascending: false });

				if (error) {
					throw error;
				}

				if (!active) {
					return;
				}

				const nextOptions = (
					(data ?? []) as Array<{ id: string; name: string }>
				).map((project) => ({
					id: project.id,
					name: project.name,
				}));

				setProjectOptions(nextOptions);
				setSelectedProjectId((current) => {
					if (
						preferredProjectId &&
						nextOptions.some((project) => project.id === preferredProjectId)
					) {
						return preferredProjectId;
					}
					return current && nextOptions.some((project) => project.id === current)
						? current
						: "";
				});
			} catch (error) {
				if (!active) {
					return;
				}
				logger.error(
					"Failed to load project options for standards review",
					"StandardsChecker",
					error,
				);
				setProjectOptions([]);
			} finally {
				if (active) {
					setLoadingProjects(false);
				}
			}
		};

		void loadProjects();
		return () => {
			active = false;
		};
	}, [preferredProjectId]);

	useEffect(() => {
		let active = true;

		const loadAutodeskStandardsReference = async () => {
			try {
				const result = await fetchAutodeskStandardsReferenceSummary();
				if (active) {
					setAutodeskStandardsReference(result);
				}
			} catch {
				if (active) {
					setAutodeskStandardsReference(null);
				}
			}
		};

		void loadAutodeskStandardsReference();
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (selectedProjectId) {
			return;
		}
		setSelectedCadFamilyId((current) => current || defaultCadFamilyId);
	}, [defaultCadFamilyId, selectedProjectId]);

	useEffect(() => {
		if (!selectedProjectId) {
			setActiveCategory(categories[0]);
			setSelectedStandards(new Set());
			setSelectedCadFamilyId(defaultCadFamilyId);
			setProjectProfileStatus(null);
			setReviewStatus(null);
			setLoadingProjectProfile(false);
			setResults([]);
			return;
		}

		let active = true;
		setLoadingProjectProfile(true);
		setProjectProfileStatus(null);
		setReviewStatus(null);
		setResults([]);

		const loadProjectProfile = async () => {
			const { data, error } = await standardsCheckerBackendService.fetchProfile(
				selectedProjectId,
			);
			if (!active) {
				return;
			}
			if (error || !data) {
				logger.error(
					"Failed to load project standards profile",
					"StandardsChecker",
					error,
				);
				setActiveCategory(categories[0]);
				setSelectedStandards(new Set());
				setSelectedCadFamilyId(defaultCadFamilyId);
				setProjectProfileStatus(
					"Unable to load project standards defaults. Using the local browser selection state.",
				);
				setLoadingProjectProfile(false);
				return;
			}

			setActiveCategory(data.standardsCategory);
			setSelectedStandards(new Set(data.selectedStandardIds));
			const resolvedCadFamilyId = data.cadFamilyId ?? defaultCadFamilyId;
			setSelectedCadFamilyId(resolvedCadFamilyId);
			setProjectProfileStatus(
				"Project standards defaults are loaded from hosted core for this project.",
			);

			const latestReview = await standardsCheckerBackendService.fetchLatestReview(
				selectedProjectId,
			);
			if (!active) {
				return;
			}

			if (latestReview.data && latestReview.data.results.length > 0) {
				if (
					latestReviewMatchesProfile({
						latestReview: latestReview.data,
						cadFamilyId: resolvedCadFamilyId,
						standardsCategory: data.standardsCategory,
						selectedStandardIds: data.selectedStandardIds,
					})
				) {
					setResults(latestReview.data.results);
					setReviewStatus(
						"Latest native standards review loaded from hosted core.",
					);
				} else {
					setReviewStatus(
						"Saved standards defaults changed since the last native standards review. Run review again.",
					);
				}
			}

			setLoadingProjectProfile(false);
		};

		void loadProjectProfile();
		return () => {
			active = false;
		};
	}, [defaultCadFamilyId, selectedProjectId]);

	const filteredStandards = useMemo(
		() =>
			sampleStandards.filter(
				(standard) => standard.category === activeCategory,
			),
		[activeCategory],
	);
	const cadFamilyOptions = useMemo(
		() => buildCadFamilyOptions(autodeskStandardsReference, selectedCadFamilyId),
		[autodeskStandardsReference, selectedCadFamilyId],
	);

	const clearReviewState = () => {
		setResults([]);
		setReviewStatus(null);
	};

	const toggleStandard = (id: string) => {
		clearReviewState();
		setSelectedStandards((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const handleProjectChange = (projectId: string) => {
		setSelectedProjectId(projectId);
	};

	const handleCategoryChange = (category: StandardsCategory) => {
		clearReviewState();
		setActiveCategory(category);
	};

	const handleCadFamilyChange = (cadFamilyId: string) => {
		clearReviewState();
		setSelectedCadFamilyId(cadFamilyId);
	};

	const runChecks = async () => {
		if (selectedStandards.size === 0 || !selectedProjectId) return;
		setRunning(true);
		clearReviewState();
		try {
			const outcome = await standardsCheckerActionService.runReview({
				projectId: selectedProjectId,
				cadFamilyId: selectedCadFamilyId || null,
				standardsCategory: activeCategory,
				selectedStandardIds: Array.from(selectedStandards),
			});
			setResults(outcome.results);
			if (outcome.warnings.length > 0) {
				setReviewStatus(
					`${outcome.message} ${outcome.warnings.join(" ")}`.trim(),
				);
			} else {
				setReviewStatus(outcome.message);
			}
		} finally {
			setRunning(false);
		}
	};

	const getResultForStandard = (id: string) =>
		results.find((result) => result.standardId === id);

	const saveProjectDefaults = async () => {
		if (!selectedProjectId) {
			return;
		}

		const payload: ProjectStandardsProfileInput = {
			cadFamilyId: selectedCadFamilyId || null,
			standardsCategory: activeCategory,
			selectedStandardIds: Array.from(selectedStandards),
		};

		setSavingProjectProfile(true);
		try {
			const profile = await standardsCheckerBackendService.saveProfile(
				selectedProjectId,
				payload,
			);
			setActiveCategory(profile.standardsCategory);
			setSelectedStandards(new Set(profile.selectedStandardIds));
			setSelectedCadFamilyId(profile.cadFamilyId ?? defaultCadFamilyId);
			clearReviewState();
			setProjectProfileStatus(
				"Project standards defaults saved to hosted core.",
			);
			setReviewStatus(
				"Project standards defaults changed. Run native review again to refresh results.",
			);
		} catch (error) {
			logger.error(
				"Failed to save project standards profile",
				"StandardsChecker",
				error,
			);
			setProjectProfileStatus(
				error instanceof Error && error.message
					? error.message
					: "Unable to save project standards defaults.",
			);
		} finally {
			setSavingProjectProfile(false);
		}
	};

	const passCount = useMemo(
		() => results.filter((result) => result.status === "pass").length,
		[results],
	);
	const warningCount = useMemo(
		() => results.filter((result) => result.status === "warning").length,
		[results],
	);
	const failCount = useMemo(
		() => results.filter((result) => result.status === "fail").length,
		[results],
	);
	const selectedProject = useMemo(
		() =>
			projectOptions.find((project) => project.id === selectedProjectId) ?? null,
		[projectOptions, selectedProjectId],
	);
	const cadReferenceSummary = useMemo(() => {
		const families = autodeskStandardsReference?.standards ?? [];
		if (families.length === 0) {
			return null;
		}

		const familyLabels = families.slice(0, 4).map((family) => family.label);
		const remainingFamilyCount = Math.max(families.length - familyLabels.length, 0);
		const familySummary =
			remainingFamilyCount > 0
				? `${familyLabels.join(", ")}, +${remainingFamilyCount} more`
				: familyLabels.join(", ");
		const recommendedDefaults = autodeskStandardsReference?.recommendedDefaults ?? [];
		const recommendedSummary =
			recommendedDefaults.length > 0
				? ` Recommended CAD defaults: ${recommendedDefaults
						.map((entry) => entry.toUpperCase())
						.join(", ")}.`
				: "";

		return `ACADE on this workstation exposes CAD standards families such as ${familySummary}.${recommendedSummary} Keep Suite review as the package-level gate.`;
	}, [autodeskStandardsReference]);

	return {
		activeCategory,
		cadFamilyOptions,
		cadReferenceSummary,
		failCount,
		filteredStandards,
		getResultForStandard,
		loadingProjects,
		loadingProjectProfile,
		mode,
		passCount,
		projectProfileStatus,
		projectOptions,
		results,
		reviewStatus,
		running,
		saveProjectDefaults,
		savingProjectProfile,
		selectedCadFamilyId,
		selectedProjectId,
		selectedProjectName: selectedProject?.name ?? null,
		selectedStandards,
		setSelectedProjectId: handleProjectChange,
		setActiveCategory: handleCategoryChange,
		setSelectedCadFamilyId: handleCadFamilyChange,
		setMode,
		toggleStandard,
		runChecks,
		warningCount,
	};
}

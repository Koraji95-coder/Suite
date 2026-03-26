import { useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import {
	type CheckResult,
	categories,
	type StandardsCategory,
	type StandardsCheckerMode,
	sampleStandards,
} from "./standardsCheckerModels";

const CHECK_RUN_DELAY_MS = 1500;

interface StandardsCheckerProjectOption {
	id: string;
	name: string;
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
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [selectedStandards, setSelectedStandards] = useState<Set<string>>(
		new Set(),
	);
	const [results, setResults] = useState<CheckResult[]>([]);
	const [running, setRunning] = useState(false);
	const runTimeoutRef = useRef<number | null>(null);

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
		return () => {
			if (runTimeoutRef.current) window.clearTimeout(runTimeoutRef.current);
		};
	}, []);

	const filteredStandards = useMemo(
		() =>
			sampleStandards.filter(
				(standard) => standard.category === activeCategory,
			),
		[activeCategory],
	);

	const toggleStandard = (id: string) => {
		setSelectedStandards((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const runChecks = () => {
		if (selectedStandards.size === 0) return;
		setRunning(true);
		setResults([]);

		if (runTimeoutRef.current) window.clearTimeout(runTimeoutRef.current);

		runTimeoutRef.current = window.setTimeout(() => {
			const nextResults: CheckResult[] = [];

			selectedStandards.forEach((id) => {
				const random = Math.random();
				let status: CheckResult["status"];
				let message: string;

				if (random < 0.5) {
					status = "pass";
					message = "All criteria met. Design compliant.";
				} else if (random < 0.8) {
					status = "warning";
					message = "Minor deviations detected. Review recommended.";
				} else {
					status = "fail";
					message = "Non-compliance found. Corrective action required.";
				}

				nextResults.push({ standardId: id, status, message });
			});

			setResults(nextResults);
			setRunning(false);
		}, CHECK_RUN_DELAY_MS);
	};

	const getResultForStandard = (id: string) =>
		results.find((result) => result.standardId === id);

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

	return {
		activeCategory,
		failCount,
		filteredStandards,
		getResultForStandard,
		loadingProjects,
		mode,
		passCount,
		projectOptions,
		results,
		running,
		selectedProjectId,
		selectedProjectName: selectedProject?.name ?? null,
		selectedStandards,
		setSelectedProjectId,
		setActiveCategory,
		setMode,
		toggleStandard,
		runChecks,
		warningCount,
	};
}

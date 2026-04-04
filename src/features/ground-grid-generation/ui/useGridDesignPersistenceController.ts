import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
import type { ProjectOption } from "./GridGeneratorPanelModels";
import { toConductorRows, toRodRows } from "./gridGeneratorStateShared";
import { DEFAULT_CONFIG, type GridConfig, type GridConductor, type GridDesign, type GridRod } from "./types";

interface UseGridDesignPersistenceControllerOptions {
	designIdParam: string | null;
	addLog: (source: "grabber" | "generator" | "system", message: string) => void;
	rods: GridRod[];
	conductors: GridConductor[];
	config: GridConfig;
	setRods: (rows: GridRod[]) => void;
	setConductors: (rows: GridConductor[]) => void;
	setConfig: (config: GridConfig) => void;
	resetPlacementState: () => void;
}

export function useGridDesignPersistenceController({
	designIdParam,
	addLog,
	rods,
	conductors,
	config,
	setRods,
	setConductors,
	setConfig,
	resetPlacementState,
}: UseGridDesignPersistenceControllerOptions) {
	const { showToast } = useToast();
	const [designs, setDesigns] = useState<GridDesign[]>([]);
	const [currentDesign, setCurrentDesign] = useState<GridDesign | null>(null);
	const [designName, setDesignName] = useState("New Ground Grid Design");
	const [projects, setProjects] = useState<ProjectOption[]>([]);
	const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const replaceDesignEntities = useCallback(
		async (designId: string) => {
			const [backupRodsRes, backupCondsRes] = await Promise.all([
				supabase
					.from("ground_grid_rods")
					.select("*")
					.eq("design_id", designId)
					.order("sort_order"),
				supabase
					.from("ground_grid_conductors")
					.select("*")
					.eq("design_id", designId)
					.order("sort_order"),
			]);
			if (backupRodsRes.error) throw backupRodsRes.error;
			if (backupCondsRes.error) throw backupCondsRes.error;

			const backupRods = (backupRodsRes.data || []) as GridRod[];
			const backupConds = (backupCondsRes.data || []) as GridConductor[];

			try {
				const { error: deleteRodsErr } = await supabase
					.from("ground_grid_rods")
					.delete()
					.eq("design_id", designId);
				if (deleteRodsErr) throw deleteRodsErr;

				const { error: deleteCondsErr } = await supabase
					.from("ground_grid_conductors")
					.delete()
					.eq("design_id", designId);
				if (deleteCondsErr) throw deleteCondsErr;

				if (rods.length > 0) {
					const { error: rodsErr } = await supabase
						.from("ground_grid_rods")
						.insert(toRodRows(designId, rods));
					if (rodsErr) throw rodsErr;
				}

				if (conductors.length > 0) {
					const { error: condsErr } = await supabase
						.from("ground_grid_conductors")
						.insert(toConductorRows(designId, conductors));
					if (condsErr) throw condsErr;
				}
			} catch (saveErr: unknown) {
				let rollbackErrorText = "";
				try {
					await supabase.from("ground_grid_rods").delete().eq("design_id", designId);
					await supabase
						.from("ground_grid_conductors")
						.delete()
						.eq("design_id", designId);
					if (backupRods.length > 0) {
						const { error: restoreRodsErr } = await supabase
							.from("ground_grid_rods")
							.insert(toRodRows(designId, backupRods));
						if (restoreRodsErr) throw restoreRodsErr;
					}
					if (backupConds.length > 0) {
						const { error: restoreCondsErr } = await supabase
							.from("ground_grid_conductors")
							.insert(toConductorRows(designId, backupConds));
						if (restoreCondsErr) throw restoreCondsErr;
					}
				} catch (rollbackErr: unknown) {
					rollbackErrorText =
						rollbackErr && typeof rollbackErr === "object" && "message" in rollbackErr
							? ` Rollback failed: ${(rollbackErr as { message: string }).message}`
							: ` Rollback failed: ${String(rollbackErr)}`;
				}
				const message =
					saveErr && typeof saveErr === "object" && "message" in saveErr
						? (saveErr as { message: string }).message
						: String(saveErr);
				throw new Error(`${message}${rollbackErrorText}`);
			}
		},
		[conductors, rods],
	);

	const loadDesigns = useCallback(async () => {
		const { data } = await supabase
			.from("ground_grid_designs")
			.select("*")
			.order("updated_at", { ascending: false });
		if (data) setDesigns(data as GridDesign[]);
	}, []);

	const loadProjects = useCallback(async () => {
		const { data } = await supabase
			.from("projects")
			.select("id, name, color")
			.order("name");
		if (data) setProjects(data as ProjectOption[]);
	}, []);

	const loadDesign = useCallback(
		async (design: GridDesign) => {
			setCurrentDesign(design);
			setDesignName(design.name);
			setLinkedProjectId(design.project_id);
			if (design.config && Object.keys(design.config).length > 0) {
				setConfig({ ...DEFAULT_CONFIG, ...design.config });
			}

			const [rodsRes, condsRes] = await Promise.all([
				supabase
					.from("ground_grid_rods")
					.select("*")
					.eq("design_id", design.id)
					.order("sort_order"),
				supabase
					.from("ground_grid_conductors")
					.select("*")
					.eq("design_id", design.id)
					.order("sort_order"),
			]);

			const loadedRods = (rodsRes.data || []) as GridRod[];
			const loadedConds = (condsRes.data || []) as GridConductor[];
			setRods(loadedRods);
			setConductors(loadedConds);
			resetPlacementState();
		},
		[setRods, setConductors, resetPlacementState, setConfig],
	);

	useEffect(() => {
		void loadDesigns();
		void loadProjects();
	}, [loadDesigns, loadProjects]);

	useEffect(() => {
		if (designIdParam && designs.length > 0) {
			const found = designs.find((design) => design.id === designIdParam);
			if (found) {
				void loadDesign(found);
			}
		}
	}, [designIdParam, designs, loadDesign]);

	const saveDesign = useCallback(async () => {
		setSaving(true);
		addLog("generator", "[PROCESSING] Saving design...");
		try {
			const configPayload = config as unknown as Json;
			if (currentDesign) {
				const { error: updateErr } = await supabase
					.from("ground_grid_designs")
					.update({
						name: designName,
						project_id: linkedProjectId,
						config: configPayload,
						updated_at: new Date().toISOString(),
					})
					.eq("id", currentDesign.id);
				if (updateErr) throw updateErr;

				await replaceDesignEntities(currentDesign.id);

				addLog("generator", "[SUCCESS] Design saved");
				showToast("success", "Design saved");
			} else {
				const { data, error: insertErr } = await supabase
					.from("ground_grid_designs")
					.insert({
						name: designName,
						project_id: linkedProjectId,
						config: configPayload,
					})
					.select()
					.maybeSingle();
				if (insertErr) throw insertErr;

				if (data) {
					const design = data as GridDesign;
					setCurrentDesign(design);

					if (rods.length > 0) {
						const { error: rodsErr } = await supabase
							.from("ground_grid_rods")
							.insert(toRodRows(design.id, rods));
						if (rodsErr) throw rodsErr;
					}
					if (conductors.length > 0) {
						const { error: condsErr } = await supabase
							.from("ground_grid_conductors")
							.insert(toConductorRows(design.id, conductors));
						if (condsErr) throw condsErr;
					}

					addLog("generator", "[SUCCESS] Design created");
					showToast("success", "Design created");
					void loadDesigns();
				}
			}
		} catch (error: unknown) {
			const message =
				error && typeof error === "object" && "message" in error
					? (error as { message: string }).message
					: String(error);
			addLog("generator", `[ERROR] Save failed: ${message}`);
			showToast("error", `Failed to save: ${message}`);
		} finally {
			setSaving(false);
		}
	}, [
		addLog,
		config,
		conductors,
		currentDesign,
		designName,
		linkedProjectId,
		loadDesigns,
		replaceDesignEntities,
		rods,
		showToast,
	]);

	const deleteDesign = useCallback(async () => {
		if (!currentDesign) return;
		await supabase
			.from("ground_grid_designs")
			.delete()
			.eq("id", currentDesign.id);
		setCurrentDesign(null);
		setDesignName("New Ground Grid Design");
		setRods([]);
		setConductors([]);
		resetPlacementState();
		setLinkedProjectId(null);
		void loadDesigns();
		showToast("success", "Design deleted");
	}, [currentDesign, setRods, setConductors, resetPlacementState, loadDesigns, showToast]);

	const newDesign = useCallback(() => {
		setCurrentDesign(null);
		setDesignName("New Ground Grid Design");
		setRods([]);
		setConductors([]);
		resetPlacementState();
		setLinkedProjectId(null);
		setConfig(DEFAULT_CONFIG);
	}, [setRods, setConductors, resetPlacementState, setConfig]);

	const handleDesignSelect = useCallback(
		(designId: string) => {
			const selected = designs.find((design) => design.id === designId);
			if (selected) {
				void loadDesign(selected);
			}
		},
		[designs, loadDesign],
	);

	const handleProjectSelect = useCallback((projectId: string) => {
		setLinkedProjectId(projectId === "__none" ? null : projectId);
	}, []);

	const linkedProject = projects.find(
		(project) => project.id === linkedProjectId,
	);

	return {
		currentDesign,
		deleteDesign,
		designName,
		designs,
		handleDesignSelect,
		handleProjectSelect,
		linkedProject,
		linkedProjectId,
		newDesign,
		projects,
		saveDesign,
		saving,
		setDesignName,
	};
}


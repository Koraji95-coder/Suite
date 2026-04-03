import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GridDesign } from "@/components/apps/ground-grid-generator/types";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
import type { Project } from "@/features/project-core";

export function useProjectDetailGridDesigns(
	project: Project,
	enabled: boolean = true,
) {
	const navigate = useNavigate();
	const [gridDesigns, setGridDesigns] = useState<GridDesign[]>([]);

	useEffect(() => {
		if (!enabled) {
			setGridDesigns([]);
			return;
		}
		if (!project?.id) {
			return;
		}
		void (async () => {
			try {
				const { data, error } = await supabase
					.from("ground_grid_designs")
					.select("*")
					.eq("project_id", project.id)
					.order("updated_at", { ascending: false });
				if (error) {
					logger.error("ProjectDetail", "Failed to load ground grid designs", {
						projectId: project.id,
						error: error.message,
					});
				} else if (data) {
					setGridDesigns(data as GridDesign[]);
				}
			} catch (err: unknown) {
				logger.error(
					"ProjectDetail",
					"Unexpected error loading ground grid designs",
					{ projectId: project.id },
					err instanceof Error ? err : new Error(String(err)),
				);
			}
		})();
	}, [enabled, project?.id]);

	const createLinkedDesign = async () => {
		const { data } = await supabase
			.from("ground_grid_designs")
			.insert({
				name: `${project.name} - Grid Design`,
				project_id: project.id,
				config: {} as Json,
			})
			.select()
			.maybeSingle();
		if (data) {
			navigate(`/app/apps/ground-grid?design=${data.id}`);
		}
	};

	const openGridDesign = (designId: string) => {
		navigate(`/app/apps/ground-grid?design=${designId}`);
	};

	return {
		createLinkedDesign,
		gridDesigns,
		openGridDesign,
	};
}

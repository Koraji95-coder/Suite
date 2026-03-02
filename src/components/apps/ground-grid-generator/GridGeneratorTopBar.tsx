import {
	Database,
	FolderKanban,
	Loader,
	Plus,
	Save,
	Trash2,
} from "lucide-react";
import type { CSSProperties } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/apps/ui/select";
import { hexToRgba } from "@/lib/palette";
import type { ProjectOption } from "./GridGeneratorPanelModels";
import type { GridDesign } from "./types";

interface GridGeneratorTopBarProps {
	designs: GridDesign[];
	currentDesign: GridDesign | null;
	designName: string;
	saving: boolean;
	projects: ProjectOption[];
	linkedProjectId: string | null;
	linkedProject: ProjectOption | undefined;
	palettePrimary: string;
	paletteSurfaceLight: string;
	paletteText: string;
	btnStyle: (active?: boolean) => CSSProperties;
	onNewDesign: () => void;
	onDesignSelect: (designId: string) => void;
	onDesignNameChange: (value: string) => void;
	onSaveDesign: () => void;
	onDeleteDesign: () => void;
	onProjectSelect: (projectId: string) => void;
}

export function GridGeneratorTopBar({
	designs,
	currentDesign,
	designName,
	saving,
	projects,
	linkedProjectId,
	linkedProject,
	palettePrimary,
	paletteSurfaceLight,
	paletteText,
	btnStyle,
	onNewDesign,
	onDesignSelect,
	onDesignNameChange,
	onSaveDesign,
	onDeleteDesign,
	onProjectSelect,
}: GridGeneratorTopBarProps) {
	return (
		<div
			style={{
				display: "flex",
				flexWrap: "wrap",
				gap: 8,
				alignItems: "center",
			}}
		>
			<button onClick={onNewDesign} style={btnStyle()}>
				<Plus size={14} /> New
			</button>

			<Select value={currentDesign?.id} onValueChange={onDesignSelect}>
				<SelectTrigger
					className="h-8 min-w-[240px] border px-3 py-1.5 text-xs font-semibold [border-color:color-mix(in_srgb,var(--primary)_25%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_75%,transparent)] [color:var(--text)]"
					id="grid-design-selector"
				>
					<span className="inline-flex items-center gap-2 truncate">
						<Database className="h-3.5 w-3.5 [color:var(--primary)]" />
						<span className="truncate">
							{currentDesign ? currentDesign.name : "Load Design"}
						</span>
					</span>
				</SelectTrigger>
				<SelectContent className="max-h-64 min-w-[260px] border-[color:color-mix(in_srgb,var(--primary)_25%,transparent)] [background:var(--surface)]">
					{designs.length === 0 ? (
						<div className="px-3 py-2 text-xs [color:var(--text-muted)]">
							No saved designs
						</div>
					) : (
						designs.map((design) => (
							<SelectItem
								key={design.id}
								value={design.id}
								className="items-start py-2 text-left"
							>
								<div className="w-full">
									<div className="text-xs font-semibold [color:var(--text)]">
										{design.name}
									</div>
									<div className="text-[10px] [color:var(--text-muted)]">
										{design.status} --{" "}
										{new Date(design.updated_at).toLocaleDateString()}
									</div>
								</div>
							</SelectItem>
						))
					)}
				</SelectContent>
			</Select>

			<input
				value={designName}
				onChange={(e) => onDesignNameChange(e.target.value)}
				style={{
					flex: 1,
					minWidth: 180,
					padding: "6px 10px",
					fontSize: 13,
					fontWeight: 600,
					background: hexToRgba(paletteSurfaceLight, 0.3),
					border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
					borderRadius: 6,
					color: paletteText,
					outline: "none",
				}}
			/>

			<button onClick={onSaveDesign} disabled={saving} style={btnStyle()}>
				{saving ? (
					<Loader size={14} className="animate-spin" />
				) : (
					<Save size={14} />
				)}
				Save
			</button>

			{currentDesign && (
				<button
					onClick={onDeleteDesign}
					style={{
						...btnStyle(),
						borderColor: hexToRgba("#ef4444", 0.3),
						color: "#ef4444",
					}}
				>
					<Trash2 size={14} /> Delete
				</button>
			)}

			<Select
				value={linkedProjectId ?? "__none"}
				onValueChange={onProjectSelect}
			>
				<SelectTrigger
					className="h-8 min-w-[220px] border px-3 py-1.5 text-xs font-semibold [border-color:color-mix(in_srgb,var(--primary)_25%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_75%,transparent)] [color:var(--text)]"
					id="grid-project-selector"
				>
					<span className="inline-flex items-center gap-2 truncate">
						<FolderKanban className="h-3.5 w-3.5 [color:var(--primary)]" />
						<span className="truncate">
							{linkedProject ? linkedProject.name : "Link Project"}
						</span>
					</span>
				</SelectTrigger>
				<SelectContent className="max-h-60 min-w-[220px] border-[color:color-mix(in_srgb,var(--primary)_25%,transparent)] [background:var(--surface)]">
					<SelectItem
						value="__none"
						className="text-xs [color:var(--text-muted)]"
					>
						No Project
					</SelectItem>
					{projects.map((project) => (
						<SelectItem key={project.id} value={project.id} className="text-xs">
							<span className="inline-flex items-center gap-2">
								<span
									className="h-2 w-2 rounded-full"
									style={{ background: project.color }}
								/>
								<span className="[color:var(--text)]">{project.name}</span>
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

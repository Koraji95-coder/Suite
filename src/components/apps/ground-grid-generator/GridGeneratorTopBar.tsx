import {
	Database,
	FolderKanban,
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
import { Progress } from "@/components/primitives/Progress";
import type { ProjectOption } from "./GridGeneratorPanelModels";
import styles from "./GridGeneratorTopBar.module.css";
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
		<div className={styles.topBar}>
			<button onClick={onNewDesign} style={btnStyle()}>
				<Plus size={14} /> New
			</button>

			<div className={styles.designSelectWrap}>
				<Select value={currentDesign?.id} onValueChange={onDesignSelect}>
					<SelectTrigger
						className={styles.selectTriggerDesign}
						id="grid-design-selector"
					>
						<div className={styles.selectTriggerContent}>
							<Database className={styles.selectTriggerIcon} />
							<span className={styles.selectTriggerText}>
								{currentDesign ? currentDesign.name : "Load Design"}
							</span>
						</div>
					</SelectTrigger>
					<SelectContent className={styles.selectContentDesign}>
						{designs.length === 0 ? (
							<div className={styles.emptyState}>No saved designs</div>
						) : (
							designs.map((design) => (
								<SelectItem
									key={design.id}
									value={design.id}
									className={styles.selectItemDesign}
								>
									<div className={styles.selectItemBody}>
										<div className={styles.selectItemTitle}>{design.name}</div>
										<div className={styles.selectItemMeta}>
											{design.status} --{" "}
											{new Date(design.updated_at).toLocaleDateString()}
										</div>
									</div>
								</SelectItem>
							))
						)}
					</SelectContent>
				</Select>
			</div>

			<input
				value={designName}
				onChange={(e) => onDesignNameChange(e.target.value)}
				className={styles.designNameInput}
				style={{
					background: hexToRgba(paletteSurfaceLight, 0.3),
					border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
					color: paletteText,
				}}
			name="gridgeneratortopbar_input_103"
			/>

			<button onClick={onSaveDesign} disabled={saving} style={btnStyle()}>
				{saving ? (
					<Progress
						className={styles.saveProgress}
						value={100}
						size="sm"
						color="primary"
						indeterminate
						animated
						showValue={false}
					/>
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

			<div className={styles.projectSelectWrap}>
				<Select
					value={linkedProjectId ?? "__none"}
					onValueChange={onProjectSelect}
				>
					<SelectTrigger
						className={styles.selectTriggerProject}
						id="grid-project-selector"
					>
						<div className={styles.selectTriggerContent}>
							<FolderKanban className={styles.selectTriggerIcon} />
							<span className={styles.selectTriggerText}>
								{linkedProject ? linkedProject.name : "Link Project"}
							</span>
						</div>
					</SelectTrigger>
					<SelectContent className={styles.selectContentProject}>
						<SelectItem value="__none" className={styles.projectNoSelection}>
							No Project
						</SelectItem>
						{projects.map((project) => (
							<SelectItem
								key={project.id}
								value={project.id}
								className={styles.projectItem}
							>
								<span className={styles.projectItemBody}>
									<span
										className={styles.projectDot}
										style={{ background: project.color }}
									/>
									<span className={styles.projectName}>{project.name}</span>
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

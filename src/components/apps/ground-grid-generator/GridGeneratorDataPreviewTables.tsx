import type { CSSProperties, ReactNode } from "react";
import type { GridConductor, GridPlacement, GridRod } from "./types";
import styles from "./GridGeneratorDataPreviewTables.module.css";

interface GridGeneratorDataPreviewTablesProps {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	palettePrimary: string;
	paletteText: string;
	paletteTextMuted: string;
}

interface SectionWrapperProps {
	title: string;
	accent: string;
	primary: string;
	text: string;
	textMuted: string;
	children: ReactNode;
	note?: string;
	footer?: string;
}

function sectionVars(
	accent: string,
	primary: string,
	text: string,
	textMuted: string,
): CSSProperties {
	return {
		"--gg-section-accent": accent,
		"--gg-primary": primary,
		"--gg-text": text,
		"--gg-text-muted": textMuted,
	} as CSSProperties;
}

function SectionWrapper({
	title,
	accent,
	primary,
	text,
	textMuted,
	children,
	note,
	footer,
}: SectionWrapperProps) {
	return (
		<div className={styles.section} style={sectionVars(accent, primary, text, textMuted)}>
			<div className={styles.sectionHeader}>{title}</div>
			{note ? <div className={styles.sectionHint}>{note}</div> : null}
			{children}
			{footer ? <div className={styles.footerNote}>{footer}</div> : null}
		</div>
	);
}

export function GridGeneratorDataPreviewTables({
	rods,
	conductors,
	placements,
	palettePrimary,
	paletteText,
	paletteTextMuted,
}: GridGeneratorDataPreviewTablesProps) {
	const tees = placements.filter((placement) => placement.type === "TEE");
	const crosses = placements.filter((placement) => placement.type === "CROSS");
	const testWells = placements.filter(
		(placement) => placement.type === "GROUND_ROD_WITH_TEST_WELL",
	);

	return (
		<>
			{rods.length > 0 ? (
				<SectionWrapper
					title={`Ground Rods (${rods.length})`}
					accent="#22c55e"
					primary={palettePrimary}
					text={paletteText}
					textMuted={paletteTextMuted}
					note={`${Math.max(0, rods.length - testWells.length)} standard rods + ${testWells.length} test wells included in rod total.`}
				>
					<div className={styles.tableWrapTall}>
						<table className={styles.table}>
							<thead>
								<tr className={styles.tableHeadRow}>
									<th className={styles.th}>Label</th>
									<th className={styles.th}>X</th>
									<th className={styles.th}>Y</th>
									<th className={styles.th}>Depth</th>
									<th className={styles.th}>Dia</th>
								</tr>
							</thead>
							<tbody>
								{rods.map((rod, index) => (
									<tr key={`rod-${index}`} className={styles.row}>
										<td className={styles.strongCell}>{rod.label}</td>
										<td className={styles.monoCell}>{rod.grid_x}</td>
										<td className={styles.monoCell}>{rod.grid_y}</td>
										<td className={styles.monoCell}>{rod.depth}</td>
										<td className={styles.monoCell}>{rod.diameter}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</SectionWrapper>
			) : null}

			{conductors.length > 0 ? (
				<SectionWrapper
					title={`Conductors (${conductors.length})`}
					accent="#f59e0b"
					primary={palettePrimary}
					text={paletteText}
					textMuted={paletteTextMuted}
				>
					<div className={styles.tableWrapTall}>
						<table className={styles.table}>
							<thead>
								<tr className={styles.tableHeadRow}>
									<th className={styles.th}>Label</th>
									<th className={styles.th}>X1</th>
									<th className={styles.th}>Y1</th>
									<th className={styles.th}>X2</th>
									<th className={styles.th}>Y2</th>
								</tr>
							</thead>
							<tbody>
								{conductors.map((conductor, index) => (
									<tr key={`conductor-${index}`} className={styles.row}>
										<td className={styles.strongCell}>{conductor.label}</td>
										<td className={styles.monoCell}>{conductor.x1}</td>
										<td className={styles.monoCell}>{conductor.y1}</td>
										<td className={styles.monoCell}>{conductor.x2}</td>
										<td className={styles.monoCell}>{conductor.y2}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</SectionWrapper>
			) : null}

			{tees.length > 0 ? (
				<SectionWrapper
					title={`Inferred Tees (${tees.length})`}
					accent="#60a5fa"
					primary={palettePrimary}
					text={paletteText}
					textMuted={paletteTextMuted}
					note="Inferred from conductor topology and rod exclusions."
				>
					<div className={styles.tableWrapShort}>
						<table className={styles.table}>
							<thead>
								<tr className={styles.tableHeadRow}>
									<th className={styles.th}>#</th>
									<th className={styles.th}>Grid X</th>
									<th className={styles.th}>Grid Y</th>
									<th className={styles.th}>Rotation</th>
								</tr>
							</thead>
							<tbody>
								{tees.map((tee, index) => (
									<tr key={`tee-${index}`} className={styles.row}>
										<td className={styles.strongCell}>T{index + 1}</td>
										<td className={styles.monoCell}>{tee.grid_x}</td>
										<td className={styles.monoCell}>{tee.grid_y}</td>
										<td className={styles.monoCell}>
											{tee.rotation_deg.toFixed(1)} deg
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</SectionWrapper>
			) : null}

			{crosses.length > 0 ? (
				<SectionWrapper
					title={`Inferred Crosses (${crosses.length})`}
					accent="#06b6d4"
					primary={palettePrimary}
					text={paletteText}
					textMuted={paletteTextMuted}
					note="Inferred from conductor topology and rod exclusions."
				>
					<div className={styles.tableWrapShort}>
						<table className={styles.table}>
							<thead>
								<tr className={styles.tableHeadRow}>
									<th className={styles.th}>#</th>
									<th className={styles.th}>Grid X</th>
									<th className={styles.th}>Grid Y</th>
								</tr>
							</thead>
							<tbody>
								{crosses.map((cross, index) => (
									<tr key={`cross-${index}`} className={styles.row}>
										<td className={styles.strongCell}>X{index + 1}</td>
										<td className={styles.monoCell}>{cross.grid_x}</td>
										<td className={styles.monoCell}>{cross.grid_y}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</SectionWrapper>
			) : null}

			{testWells.length > 0 ? (
				<SectionWrapper
					title={`Test Wells (${testWells.length})`}
					accent="#ef4444"
					primary={palettePrimary}
					text={paletteText}
					textMuted={paletteTextMuted}
					footer="*TEST WELLS ARE INCLUDED IN GROUND ROD TOTALS"
				>
					<div className={styles.tableWrapShort}>
						<table className={styles.table}>
							<thead>
								<tr className={styles.tableHeadRow}>
									<th className={styles.th}>#</th>
									<th className={styles.th}>Grid X</th>
									<th className={styles.th}>Grid Y</th>
								</tr>
							</thead>
							<tbody>
								{testWells.map((testWell, index) => (
									<tr key={`test-well-${index}`} className={styles.row}>
										<td className={styles.strongCell}>TW{index + 1}</td>
										<td className={styles.monoCell}>{testWell.grid_x}</td>
										<td className={styles.monoCell}>{testWell.grid_y}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</SectionWrapper>
			) : null}
		</>
	);
}

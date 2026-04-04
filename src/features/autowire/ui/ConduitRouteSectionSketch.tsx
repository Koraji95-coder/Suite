import type { SectionPreset } from "./conduitRouteTypes";
import styles from "./ConduitRouteApp.module.css";

export function ConduitRouteSectionSketch({
	preset,
}: {
	preset: SectionPreset["id"];
}) {
	if (preset === "stub_up") {
		return (
			<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
				<rect
					x="0"
					y="90"
					width="320"
					height="80"
					className={styles.sectionSoil}
				/>
				<line x1="0" y1="90" x2="320" y2="90" className={styles.sectionGrade} />
				<rect
					x="92"
					y="56"
					width="130"
					height="38"
					className={styles.sectionConcrete}
				/>
				{[0, 1, 2, 3].map((index) => (
					<g key={index}>
						<rect
							x={108 + index * 28}
							y={22}
							width="12"
							height="68"
							className={styles.sectionConduit}
						/>
						<circle
							cx={114 + index * 28}
							cy={54}
							r="2.8"
							className={styles.sectionCableA}
						/>
					</g>
				))}
			</svg>
		);
	}

	if (preset === "duct_bank") {
		return (
			<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
				<rect
					x="0"
					y="80"
					width="320"
					height="90"
					className={styles.sectionSoil}
				/>
				<line x1="0" y1="80" x2="320" y2="80" className={styles.sectionGrade} />
				<rect
					x="70"
					y="34"
					width="180"
					height="108"
					className={styles.sectionConcrete}
				/>
				{Array.from({ length: 3 }).map((_, row) =>
					Array.from({ length: 4 }).map((__, col) => (
						<circle
							key={`${row}_${col}`}
							cx={96 + col * 44}
							cy={58 + row * 30}
							r="10"
							className={styles.sectionConduitHole}
						/>
					)),
				)}
			</svg>
		);
	}

	if (preset === "trench") {
		return (
			<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
				<rect
					x="0"
					y="56"
					width="320"
					height="114"
					className={styles.sectionSoil}
				/>
				<rect
					x="72"
					y="56"
					width="176"
					height="90"
					className={styles.sectionVoid}
				/>
				<rect
					x="80"
					y="74"
					width="160"
					height="8"
					className={styles.sectionTray}
				/>
				<rect
					x="80"
					y="97"
					width="160"
					height="8"
					className={styles.sectionTray}
				/>
				<rect
					x="80"
					y="120"
					width="160"
					height="8"
					className={styles.sectionTray}
				/>
				{Array.from({ length: 7 }).map((_, index) => (
					<circle
						key={`wire_${index}`}
						cx={94 + index * 18}
						cy="78"
						r="3"
						className={styles.sectionCableA}
					/>
				))}
			</svg>
		);
	}

	return (
		<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
			<rect
				x="0"
				y="94"
				width="320"
				height="76"
				className={styles.sectionSoil}
			/>
			<line x1="0" y1="94" x2="320" y2="94" className={styles.sectionGrade} />
			<rect
				x="124"
				y="18"
				width="18"
				height="152"
				className={styles.sectionWall}
			/>
			{[0, 1, 2].map((index) => (
				<g key={`entry_${index}`}>
					<rect
						x="44"
						y={32 + index * 36}
						width="96"
						height="10"
						className={styles.sectionConduit}
					/>
					<rect
						x="142"
						y={30 + index * 36}
						width="16"
						height="14"
						className={styles.sectionSeal}
					/>
					<rect
						x="160"
						y={32 + index * 36}
						width="70"
						height="10"
						className={styles.sectionConduit}
					/>
				</g>
			))}
		</svg>
	);
}

import { Shuffle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";
import {
	buildProjectCode,
	type ProjectConfig,
	type SwapRule,
} from "./drawingListManagerModels";

interface DrawingListManagerConfigPanelsProps {
	palette: ColorScheme;
	projectConfig: ProjectConfig;
	setProjectConfig: Dispatch<SetStateAction<ProjectConfig>>;
	templateCounts: Record<string, number>;
	setTemplateCounts: Dispatch<SetStateAction<Record<string, number>>>;
	swapRules: SwapRule[];
	setSwapRules: Dispatch<SetStateAction<SwapRule[]>>;
	onApplySwap: () => void;
}

export function DrawingListManagerConfigPanels({
	palette,
	projectConfig,
	setProjectConfig,
	templateCounts,
	setTemplateCounts,
	swapRules,
	setSwapRules,
	onApplySwap,
}: DrawingListManagerConfigPanelsProps) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
				gap: 18,
				alignItems: "start",
			}}
		>
			<div
				style={{
					padding: 18,
					borderRadius: 16,
					background: `linear-gradient(135deg, ${hexToRgba(palette.surfaceLight, 0.4)} 0%, ${hexToRgba(palette.surface, 0.8)} 100%)`,
					border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				}}
			>
				<h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
					Project Standard
				</h3>
				<div style={{ display: "grid", gap: 12, marginTop: 14 }}>
					<label
						style={{
							display: "grid",
							gap: 6,
							fontSize: 12,
							color: palette.textMuted,
						}}
					>
						Project number (XXX)
						<input
							value={projectConfig.projectNumber}
							onChange={(event) => {
								const next = event.target.value
									.toUpperCase()
									.replace(/^R3P-/, "");
								setProjectConfig((prev) => ({
									...prev,
									projectNumber: next,
								}));
							}}
							placeholder="25074"
							style={{
								padding: "8px 10px",
								borderRadius: 8,
								border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
								background: hexToRgba(palette.surfaceLight, 0.35),
								color: palette.text,
							}}
						/>
					</label>
					<label
						style={{
							display: "grid",
							gap: 6,
							fontSize: 12,
							color: palette.textMuted,
						}}
					>
						Default revision
						<input
							value={projectConfig.revisionDefault}
							onChange={(event) =>
								setProjectConfig((prev) => ({
									...prev,
									revisionDefault: event.target.value.toUpperCase(),
								}))
							}
							style={{
								padding: "8px 10px",
								borderRadius: 8,
								border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
								background: hexToRgba(palette.surfaceLight, 0.35),
								color: palette.text,
								width: "100%",
							}}
						/>
					</label>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							fontSize: 12,
							color: palette.textMuted,
						}}
					>
						<input
							type="checkbox"
							checked={projectConfig.enforceProjectCode}
							onChange={(event) =>
								setProjectConfig((prev) => ({
									...prev,
									enforceProjectCode: event.target.checked,
								}))
							}
						/>
						Enforce project code in naming convention
					</label>
					<div
						style={{
							fontSize: 12,
							color: palette.textMuted,
							display: "grid",
							gap: 6,
						}}
					>
						Naming pattern
						<div
							style={{
								padding: "8px 10px",
								borderRadius: 8,
								background: hexToRgba(palette.primary, 0.08),
								border: `1px dashed ${hexToRgba(palette.primary, 0.3)}`,
								color: palette.text,
								fontSize: 12,
							}}
						>
							{buildProjectCode(projectConfig.projectNumber)}-DISC-TYPE-### REV
						</div>
					</div>
				</div>
			</div>

			<div
				style={{
					padding: 18,
					borderRadius: 16,
					background: `linear-gradient(135deg, ${hexToRgba(palette.surfaceLight, 0.25)} 0%, ${hexToRgba(palette.surface, 0.85)} 100%)`,
					border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				}}
			>
				<h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
					Drawing Types & Counts
				</h3>
				<p
					style={{
						margin: "6px 0 0 0",
						fontSize: 12,
						color: palette.textMuted,
					}}
				>
					Set how many drawings of each type to generate.
				</p>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
						gap: 12,
						marginTop: 12,
					}}
				>
					{projectConfig.allowedDisciplines.flatMap((discipline) =>
						projectConfig.allowedSheetTypes.map((sheetType) => {
							const typeKey = `${discipline}-${sheetType}`;
							const count = templateCounts[typeKey] || 0;
							return (
								<div
									key={typeKey}
									style={{
										padding: 12,
										borderRadius: 8,
										border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
										background: hexToRgba(palette.surfaceLight, 0.4),
									}}
								>
									<label
										style={{
											display: "block",
											fontSize: 12,
											fontWeight: 500,
											marginBottom: 6,
										}}
									>
										{typeKey}
									</label>
									<input
										type="number"
										min={0}
										max={99}
										value={count}
										onChange={(event) =>
											setTemplateCounts((prev) => ({
												...prev,
												[typeKey]: Math.max(0, Number(event.target.value)),
											}))
										}
										style={{
											width: "100%",
											padding: "6px 8px",
											borderRadius: 6,
											border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
											background: hexToRgba(palette.surfaceLight, 0.35),
											color: palette.text,
											fontSize: 12,
											boxSizing: "border-box",
										}}
									/>
								</div>
							);
						}),
					)}
				</div>
			</div>

			<div
				style={{
					padding: 18,
					borderRadius: 16,
					background: `linear-gradient(135deg, ${hexToRgba(palette.surfaceLight, 0.2)} 0%, ${hexToRgba(palette.surface, 0.75)} 100%)`,
					border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				}}
			>
				<h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
					Hot Swap Names
				</h3>
				<p
					style={{
						margin: "6px 0 0",
						fontSize: 12,
						color: palette.textMuted,
					}}
				>
					Replace naming fragments across titles and regenerate naming
					consistency.
				</p>
				<div
					style={{
						display: "grid",
						gap: 8,
						marginTop: 12,
						maxHeight: 240,
						overflowY: "auto",
						paddingRight: 8,
					}}
				>
					{swapRules.map((rule) => (
						<div
							key={rule.id}
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 8,
							}}
						>
							<input
								value={rule.from}
								onChange={(event) =>
									setSwapRules((prev) =>
										prev.map((item) =>
											item.id === rule.id
												? { ...item, from: event.target.value }
												: item,
										),
									)
								}
								placeholder="From"
								style={{
									padding: "6px 8px",
									borderRadius: 8,
									border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
									background: hexToRgba(palette.surfaceLight, 0.35),
									color: palette.text,
									fontSize: 12,
								}}
							/>
							<input
								value={rule.to}
								onChange={(event) =>
									setSwapRules((prev) =>
										prev.map((item) =>
											item.id === rule.id
												? { ...item, to: event.target.value }
												: item,
										),
									)
								}
								placeholder="To"
								style={{
									padding: "6px 8px",
									borderRadius: 8,
									border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
									background: hexToRgba(palette.surfaceLight, 0.35),
									color: palette.text,
									fontSize: 12,
								}}
							/>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={onApplySwap}
					style={{
						marginTop: 12,
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
						padding: "8px 12px",
						borderRadius: 8,
						border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						background: hexToRgba(palette.primary, 0.12),
						color: palette.primary,
						fontSize: 12,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					<Shuffle size={14} />
					Apply Swap Rules
				</button>
			</div>
		</div>
	);
}

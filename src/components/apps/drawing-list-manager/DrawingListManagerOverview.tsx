import {
	AlertTriangle,
	CheckCircle2,
	Download,
	FileSpreadsheet,
	ListChecks,
	Wand2,
} from "lucide-react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface DrawingListManagerOverviewProps {
	palette: ColorScheme;
	summary: {
		total: number;
		flagged: number;
		missing: number;
	};
	onGenerateList: () => void;
	onExport: () => void;
}

export function DrawingListManagerOverview({
	palette,
	summary,
	onGenerateList,
	onExport,
}: DrawingListManagerOverviewProps) {
	return (
		<>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 16,
				}}
			>
				<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
					<div
						style={{
							width: 52,
							height: 52,
							borderRadius: 16,
							background: `linear-gradient(145deg, ${hexToRgba(palette.primary, 0.2)} 0%, ${hexToRgba(palette.primary, 0.05)} 100%)`,
							border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<FileSpreadsheet size={26} color={palette.primary} />
					</div>
					<div>
						<h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
							Drawing List Manager
						</h1>
						<p style={{ margin: 0, color: palette.textMuted, fontSize: 13 }}>
							Validate naming, generate lists, and audit drawing folders in
							seconds.
						</p>
					</div>
				</div>
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<button
						type="button"
						onClick={onGenerateList}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "10px 16px",
							borderRadius: 10,
							border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
							background: hexToRgba(palette.primary, 0.16),
							color: palette.primary,
							fontWeight: 600,
							cursor: "pointer",
						}}
					>
						<Wand2 size={16} />
						Generate List
					</button>
					<button
						type="button"
						onClick={onExport}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "10px 16px",
							borderRadius: 10,
							border: `1px solid ${hexToRgba(palette.surfaceLight, 0.8)}`,
							background: hexToRgba(palette.surfaceLight, 0.35),
							color: palette.text,
							fontWeight: 600,
							cursor: "pointer",
						}}
					>
						<Download size={16} />
						Export Excel
					</button>
				</div>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
					gap: 16,
				}}
			>
				{[
					{ label: "Total Drawings", value: summary.total, icon: ListChecks },
					{ label: "Flagged", value: summary.flagged, icon: AlertTriangle },
					{ label: "Missing", value: summary.missing, icon: AlertTriangle },
					{
						label: "Ready",
						value: Math.max(summary.total - summary.flagged, 0),
						icon: CheckCircle2,
					},
				].map((card) => {
					const Icon = card.icon;
					return (
						<div
							key={card.label}
							style={{
								padding: 16,
								borderRadius: 14,
								background: `linear-gradient(145deg, ${hexToRgba(palette.surface, 0.8)} 0%, ${hexToRgba(palette.surfaceLight, 0.35)} 100%)`,
								border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
							}}
						>
							<div>
								<div
									style={{
										fontSize: 12,
										color: palette.textMuted,
										textTransform: "uppercase",
										letterSpacing: "0.08em",
									}}
								>
									{card.label}
								</div>
								<div style={{ fontSize: 24, fontWeight: 700 }}>
									{card.value}
								</div>
							</div>
							<div
								style={{
									width: 44,
									height: 44,
									borderRadius: 12,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background: hexToRgba(palette.primary, 0.12),
								}}
							>
								<Icon size={20} color={palette.primary} />
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}

import { MapPin, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import type { GridDesign } from "@/components/apps/ground-grid-generator/types";
import {
	type ColorScheme,
	glassCardInnerStyle,
	hexToRgba,
} from "@/lib/palette";
import { GlassPanel } from "../ui/GlassPanel";

interface ProjectDetailGroundGridsViewProps {
	palette: ColorScheme;
	gridDesigns: GridDesign[];
	onCreateDesign: () => void;
	onOpenDesign: (designId: string) => void;
	actionButtonStyle: (tint: string) => CSSProperties;
}

export function ProjectDetailGroundGridsView({
	palette,
	gridDesigns,
	onCreateDesign,
	onOpenDesign,
	actionButtonStyle,
}: ProjectDetailGroundGridsViewProps) {
	return (
		<GlassPanel
			tint={palette.secondary}
			hoverEffect={false}
			className="p-6 soft-fade-up"
		>
			<div className="flex items-center justify-between mb-4">
				<h4
					className="text-xl font-bold"
					style={{ color: hexToRgba(palette.text, 0.88) }}
				>
					Ground Grid Designs
				</h4>
				<button
					onClick={onCreateDesign}
					className="px-4 py-2 rounded-lg transition-all flex items-center space-x-2"
					style={actionButtonStyle(palette.primary)}
				>
					<Plus className="w-4 h-4" />
					<span>New Design</span>
				</button>
			</div>

			{gridDesigns.length === 0 ? (
				<div
					className="text-center py-12"
					style={{ color: hexToRgba(palette.primary, 0.6) }}
				>
					<MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
					<p className="text-lg font-medium">No ground grid designs linked</p>
					<p
						className="text-sm mt-1"
						style={{ color: hexToRgba(palette.text, 0.55) }}
					>
						Create a new design or link an existing one from the Grid Generator
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{gridDesigns.map((design) => (
						<button
							key={design.id}
							onClick={() => onOpenDesign(design.id)}
							className="w-full text-left rounded-lg p-4 transition-all flex items-center justify-between"
							style={{
								...glassCardInnerStyle(palette, palette.secondary),
								border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
							}}
						>
							<div className="flex items-center space-x-3">
								<MapPin
									className="w-5 h-5"
									style={{ color: hexToRgba(palette.primary, 0.8) }}
								/>
								<div>
									<div
										className="font-semibold"
										style={{ color: hexToRgba(palette.text, 0.85) }}
									>
										{design.name}
									</div>
									<div
										className="text-xs mt-0.5"
										style={{ color: hexToRgba(palette.text, 0.45) }}
									>
										{new Date(design.updated_at).toLocaleDateString()}
									</div>
								</div>
							</div>
							<span
								className="px-2 py-0.5 rounded text-xs font-medium border"
								style={{
									background:
										design.status === "finalized"
											? hexToRgba("#22c55e", 0.18)
											: design.status === "archived"
												? hexToRgba(palette.surface, 0.4)
												: hexToRgba(palette.primary, 0.16),
									color:
										design.status === "finalized"
											? "#86efac"
											: design.status === "archived"
												? hexToRgba(palette.text, 0.5)
												: hexToRgba(palette.text, 0.85),
									borderColor:
										design.status === "finalized"
											? hexToRgba("#22c55e", 0.35)
											: design.status === "archived"
												? hexToRgba(palette.text, 0.08)
												: hexToRgba(palette.primary, 0.3),
								}}
							>
								{design.status}
							</span>
						</button>
					))}
				</div>
			)}
		</GlassPanel>
	);
}

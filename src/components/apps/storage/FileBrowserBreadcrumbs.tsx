import { ChevronRight } from "lucide-react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface FileBrowserBreadcrumbsProps {
	palette: ColorScheme;
	pathSegments: string[];
	onNavigateRoot: () => void;
	onNavigateTo: (index: number) => void;
}

export function FileBrowserBreadcrumbs({
	palette,
	pathSegments,
	onNavigateRoot,
	onNavigateTo,
}: FileBrowserBreadcrumbsProps) {
	return (
		<div className="mb-3 flex flex-wrap items-center gap-1 overflow-x-auto">
			<button
				onClick={onNavigateRoot}
				style={{
					padding: "2px 8px",
					borderRadius: 4,
					cursor: "pointer",
					background: hexToRgba(palette.primary, 0.1),
					border: "none",
					color: palette.primary,
					fontSize: 13,
				}}
			>
				root
			</button>
			{pathSegments.map((segment, index) => (
				<span
					key={`${segment}-${index}`}
					style={{ display: "flex", alignItems: "center", gap: 2 }}
				>
					<ChevronRight
						className="w-3 h-3"
						style={{ color: palette.textMuted }}
					/>
					<button
						onClick={() => onNavigateTo(index)}
						style={{
							padding: "2px 8px",
							borderRadius: 4,
							cursor: "pointer",
							background: hexToRgba(palette.primary, 0.1),
							border: "none",
							color: palette.primary,
							fontSize: 13,
						}}
					>
						{segment}
					</button>
				</span>
			))}
		</div>
	);
}

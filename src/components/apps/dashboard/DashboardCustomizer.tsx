import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Activity,
	BarChart3,
	Calendar,
	Eye,
	EyeOff,
	FolderKanban,
	GripVertical,
	RotateCcw,
	X,
} from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { GlassPanel } from "../ui/GlassPanel";
import type { WidgetConfig } from "./useDashboardLayout";

const WIDGET_ICONS: Record<string, typeof BarChart3> = {
	stats: BarChart3,
	calendar: Calendar,
	activity: Activity,
	projects: FolderKanban,
};

interface DashboardCustomizerProps {
	widgets: WidgetConfig[];
	onToggle: (id: string) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
	onReset: () => void;
	onClose: () => void;
}

function SortableWidgetRow({
	widget,
	onToggle,
}: {
	widget: WidgetConfig;
	onToggle: (id: string) => void;
}) {
	const { palette } = useTheme();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: widget.id,
	});

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		zIndex: isDragging ? 10 : 0,
	};

	const Icon = WIDGET_ICONS[widget.id] ?? BarChart3;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="flex items-center gap-3 p-3 rounded-lg mb-2"
			{...attributes}
		>
			<button
				{...listeners}
				className="cursor-grab active:cursor-grabbing p-1 rounded"
				style={{ color: palette.textMuted }}
				aria-label={`Drag to reorder ${widget.label}`}
			>
				<GripVertical size={16} />
			</button>
			<Icon
				size={16}
				style={{
					color: widget.visible ? palette.primary : palette.textMuted,
					flexShrink: 0,
				}}
			/>
			<span
				className="flex-1 text-sm font-medium"
				style={{ color: widget.visible ? palette.text : palette.textMuted }}
			>
				{widget.label}
			</span>
			<button
				onClick={() => onToggle(widget.id)}
				className="p-1.5 rounded-md transition-colors"
				style={{
					background: hexToRgba(
						widget.visible ? palette.primary : palette.textMuted,
						0.1,
					),
					color: widget.visible ? palette.primary : palette.textMuted,
				}}
				aria-label={
					widget.visible ? `Hide ${widget.label}` : `Show ${widget.label}`
				}
			>
				{widget.visible ? <Eye size={14} /> : <EyeOff size={14} />}
			</button>
		</div>
	);
}

export function DashboardCustomizer({
	widgets,
	onToggle,
	onReorder,
	onReset,
	onClose,
}: DashboardCustomizerProps) {
	const { palette } = useTheme();

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const fromIndex = widgets.findIndex((w) => w.id === active.id);
		const toIndex = widgets.findIndex((w) => w.id === over.id);
		if (fromIndex !== -1 && toIndex !== -1) {
			onReorder(fromIndex, toIndex);
		}
	};

	return (
		<GlassPanel tint={palette.primary} hoverEffect={false} className="p-5">
			<div className="relative z-10">
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-base font-bold" style={{ color: palette.text }}>
						Customize Dashboard
					</h3>
					<div className="flex items-center gap-2">
						<button
							onClick={onReset}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
							style={{
								background: hexToRgba(palette.textMuted, 0.1),
								color: palette.textMuted,
							}}
							aria-label="Reset layout to default"
						>
							<RotateCcw size={12} />
							Reset
						</button>
						<button
							onClick={onClose}
							className="p-1.5 rounded-lg transition-colors"
							style={{
								background: hexToRgba(palette.textMuted, 0.1),
								color: palette.textMuted,
							}}
							aria-label="Close customizer"
						>
							<X size={14} />
						</button>
					</div>
				</div>
				<p className="text-xs mb-4" style={{ color: palette.textMuted }}>
					Drag to reorder. Toggle visibility with the eye icon.
				</p>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={widgets.map((w) => w.id)}
						strategy={verticalListSortingStrategy}
					>
						{widgets.map((widget) => (
							<SortableWidgetRow
								key={widget.id}
								widget={widget}
								onToggle={onToggle}
							/>
						))}
					</SortableContext>
				</DndContext>
			</div>
		</GlassPanel>
	);
}

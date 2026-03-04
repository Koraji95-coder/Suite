// src/components/apps/dashboard/DashboardCustomizer.tsx
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
	Clock,
	Eye,
	EyeOff,
	FolderKanban,
	GripVertical,
	RotateCcw,
	X,
} from "lucide-react";
import { Button, IconButton } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import type { WidgetConfig } from "./useDashboardLayout";

const WIDGET_ICONS: Record<string, typeof BarChart3> = {
	stats: BarChart3,
	calendar: Calendar,
	activity: Activity,
	projects: FolderKanban,
	"recent-files": Clock,
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
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: widget.id });

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
			className={`
        flex items-center gap-3 rounded-lg border p-3
        ${widget.visible ? "border-border bg-surface" : "border-border/50 bg-surface/50"}
      `}
			{...attributes}
		>
			<button
				{...listeners}
				className="cursor-grab active:cursor-grabbing p-1 rounded text-text-muted hover:text-text"
				aria-label={`Drag to reorder ${widget.label}`}
			>
				<GripVertical size={16} />
			</button>

			<Icon
				size={16}
				className={widget.visible ? "text-primary" : "text-text-muted"}
			/>

			<Text
				size="sm"
				weight="medium"
				color={widget.visible ? "default" : "muted"}
				className="flex-1"
			>
				{widget.label}
			</Text>

			<IconButton
				icon={widget.visible ? <Eye size={14} /> : <EyeOff size={14} />}
				aria-label={
					widget.visible ? `Hide ${widget.label}` : `Show ${widget.label}`
				}
				variant="ghost"
				size="sm"
				onClick={() => onToggle(widget.id)}
				className={widget.visible ? "text-primary" : "text-text-muted"}
			/>
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
		<Stack gap={4}>
			<HStack justify="between" align="center">
				<Text size="md" weight="bold">
					Customize Dashboard
				</Text>
				<HStack gap={2}>
					<Button
						variant="ghost"
						size="sm"
						onClick={onReset}
						iconLeft={<RotateCcw size={12} />}
					>
						Reset
					</Button>
					<IconButton
						icon={<X size={14} />}
						aria-label="Close customizer"
						variant="ghost"
						size="sm"
						onClick={onClose}
					/>
				</HStack>
			</HStack>

			<Text size="xs" color="muted">
				Drag to reorder. Toggle visibility with the eye icon.
			</Text>

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={widgets.map((w) => w.id)}
					strategy={verticalListSortingStrategy}
				>
					<Stack gap={2}>
						{widgets.map((widget) => (
							<SortableWidgetRow
								key={widget.id}
								widget={widget}
								onToggle={onToggle}
							/>
						))}
					</Stack>
				</SortableContext>
			</DndContext>
		</Stack>
	);
}

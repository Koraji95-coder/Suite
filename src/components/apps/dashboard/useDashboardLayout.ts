import { useCallback, useState } from "react";

export interface WidgetConfig {
	id: string;
	label: string;
	visible: boolean;
}

const STORAGE_KEY = "r3-dashboard-layout-v2";

const DEFAULT_LAYOUT: WidgetConfig[] = [
	{ id: "stats", label: "Stats Cards", visible: true },
	{ id: "activity", label: "Recent Activity", visible: true },
	{ id: "calendar", label: "Calendar", visible: true },
	{ id: "recent-files", label: "Recent Files", visible: true },
	{ id: "projects", label: "Active Projects", visible: true },
];

function loadLayout(): WidgetConfig[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_LAYOUT;
		const parsed = JSON.parse(raw) as WidgetConfig[];
		if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LAYOUT;
		const knownIds = new Set(DEFAULT_LAYOUT.map((w) => w.id));
		const validItems = parsed.filter((w) => knownIds.has(w.id));
		const missingIds = DEFAULT_LAYOUT.filter(
			(w) => !validItems.some((v) => v.id === w.id),
		);
		return [...validItems, ...missingIds];
	} catch {
		return DEFAULT_LAYOUT;
	}
}

function saveLayout(layout: WidgetConfig[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
	} catch {
		/* noop */
	}
}

export function useDashboardLayout() {
	const [widgets, setWidgets] = useState<WidgetConfig[]>(loadLayout);
	const [editMode, setEditMode] = useState(false);

	const toggleWidget = useCallback((id: string) => {
		setWidgets((prev) => {
			const next = prev.map((w) =>
				w.id === id ? { ...w, visible: !w.visible } : w,
			);
			saveLayout(next);
			return next;
		});
	}, []);

	const reorderWidgets = useCallback((fromIndex: number, toIndex: number) => {
		setWidgets((prev) => {
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			saveLayout(next);
			return next;
		});
	}, []);

	const resetLayout = useCallback(() => {
		setWidgets(DEFAULT_LAYOUT);
		saveLayout(DEFAULT_LAYOUT);
	}, []);

	return {
		widgets,
		editMode,
		setEditMode,
		toggleWidget,
		reorderWidgets,
		resetLayout,
	};
}

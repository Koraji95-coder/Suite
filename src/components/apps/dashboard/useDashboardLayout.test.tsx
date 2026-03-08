import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDashboardLayout } from "./useDashboardLayout";

const STORAGE_KEY = "r3-dashboard-layout-v2";

describe("useDashboardLayout", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("loads the default widget layout when storage is empty", () => {
		const { result } = renderHook(() => useDashboardLayout());

		expect(result.current.widgets.map((widget) => widget.id)).toEqual([
			"stats",
			"activity",
			"calendar",
			"recent-files",
			"projects",
		]);
		expect(result.current.widgets.every((widget) => widget.visible)).toBe(true);
	});

	it("toggles visibility and persists updates", () => {
		const { result } = renderHook(() => useDashboardLayout());

		act(() => {
			result.current.toggleWidget("calendar");
		});

		const calendarWidget = result.current.widgets.find(
			(widget) => widget.id === "calendar",
		);
		expect(calendarWidget?.visible).toBe(false);

		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Array<{
			id: string;
			visible: boolean;
		}>;
		expect(
			persisted.find((widget) => widget.id === "calendar")?.visible,
		).toBe(false);
	});

	it("reorders widgets and supports reset", () => {
		const { result } = renderHook(() => useDashboardLayout());

		act(() => {
			result.current.reorderWidgets(0, 4);
		});
		expect(result.current.widgets[4]?.id).toBe("stats");

		act(() => {
			result.current.resetLayout();
		});
		expect(result.current.widgets[0]?.id).toBe("stats");
		expect(result.current.widgets.every((widget) => widget.visible)).toBe(true);
	});
});

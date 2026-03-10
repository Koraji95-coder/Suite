import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventDialog } from "./EventDialog";

vi.mock("./EventDialogFields", () => ({
	EventDialogFields: () => <div data-testid="event-dialog-fields" />,
}));

vi.mock("./EventDialogFooter", () => ({
	EventDialogFooter: () => <div data-testid="event-dialog-footer" />,
}));

vi.mock("./useEventDialogState", () => {
	const now = new Date("2026-03-10T00:00:00.000Z");
	return {
		useEventDialogState: () => ({
			allDay: false,
			color: "sky",
			description: "",
			endDate: now,
			endDateOpen: false,
			endTime: "17:00",
			error: null,
			filteredTaskOptions: [],
			handleDelete: vi.fn(),
			handleSave: vi.fn(),
			location: "",
			projectId: null,
			setAllDay: vi.fn(),
			setColor: vi.fn(),
			setDescription: vi.fn(),
			setEndDate: vi.fn(),
			setEndDateOpen: vi.fn(),
			setEndTime: vi.fn(),
			setError: vi.fn(),
			setLocation: vi.fn(),
			setProjectId: vi.fn(),
			setStartDate: vi.fn(),
			setStartDateOpen: vi.fn(),
			setStartTime: vi.fn(),
			setTaskId: vi.fn(),
			setTitle: vi.fn(),
			startDate: now,
			startDateOpen: false,
			startTime: "09:00",
			taskId: null,
			title: "",
		}),
	};
});

describe("EventDialog", () => {
	it("renders inline mode without requiring Dialog context", () => {
		expect(() =>
			render(
				<EventDialog
					event={null}
					isOpen
					inline
					onClose={vi.fn()}
					onSave={vi.fn()}
					onDelete={vi.fn()}
					projectOptions={[]}
					taskOptions={[]}
				/>,
			),
		).not.toThrow();

		expect(
			screen.getByRole("heading", {
				name: "Create Event",
			}),
		).toBeTruthy();
		expect(screen.getByTestId("event-dialog-fields")).toBeTruthy();
		expect(screen.getByTestId("event-dialog-footer")).toBeTruthy();
	});
});

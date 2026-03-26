import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import DeveloperDocsRoutePage from "./DeveloperDocsRoutePage";
import KnowledgeRoutePage from "./KnowledgeRoutePage";

describe("KnowledgeRoutePage", () => {
	it("keeps the customer knowledge route focused on the reference library", () => {
		render(
			<MemoryRouter initialEntries={["/app/knowledge?view=developer"]}>
				<KnowledgeRoutePage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Reference library")).toBeTruthy();
		expect(
			screen.getAllByText("Standards and Compliance").length,
		).toBeGreaterThan(0);
		expect(screen.queryByText("Developer Docs")).toBeNull();
		expect(screen.queryByText("Developer Portal")).toBeNull();
	});

	it("renders developer docs only from the dedicated developer route", () => {
		render(
			<MemoryRouter initialEntries={["/app/developer/docs"]}>
				<DeveloperDocsRoutePage />
			</MemoryRouter>,
		);

		expect(screen.getAllByText("Developer docs").length).toBeGreaterThan(0);
		expect(screen.getByText("Developer Portal")).toBeTruthy();
		expect(screen.queryByText("Standards and Compliance")).toBeNull();
	});
});

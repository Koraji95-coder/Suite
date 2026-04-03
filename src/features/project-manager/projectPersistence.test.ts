import { describe, expect, it } from "vitest";
import type { ProjectFormData } from "@/features/project-core";
import {
	buildProjectInsertPayload,
	buildProjectUpdatePayload,
	getMissingProjectSetupColumns,
	normalizeProjectRootPath,
	withDerivedAcadeProjectFilePath,
} from "./projectPersistence";

const BASE_FORM: ProjectFormData = {
	name: "Nanulak 180MW Substation",
	description: "Fixture-backed ACADE smoke test project.",
	deadline: "2026-04-15",
	priority: "high",
	status: "active",
	category: "Substation",
	projectPeName: "Engineer Name ",
	projectFirmNumber: " TX-Firm #000000 ",
	watchdogRootPath: " C:/Projects/Nanulak ",
	pdfPackageRootPath: " C:/Projects/Nanulak/Issued PDF ",
	titleBlockBlockName: "R3P-24x36BORDER&TITLE",
	titleBlockAcadeProjectFilePath: "",
	titleBlockAcadeLine1: "Hunt Energy Network",
	titleBlockAcadeLine2: "Nanulak 180MW BESS Substation",
	titleBlockAcadeLine4: "R3P-25074",
	titleBlockDrawnBy: "Drafting lead",
	titleBlockCheckedBy: "QA / reviewer",
	titleBlockEngineer: "Engineer of record",
};

describe("projectPersistence", () => {
	it("normalizes project roots into nullable trimmed strings", () => {
		expect(normalizeProjectRootPath("  C:/Projects/Nanulak  ")).toBe(
			"C:/Projects/Nanulak",
		);
		expect(normalizeProjectRootPath("   ")).toBeNull();
	});

	it("derives the ACADE project file path only when the form leaves it blank", () => {
		expect(
			withDerivedAcadeProjectFilePath(BASE_FORM, "C:/Projects/Nanulak")
				.titleBlockAcadeProjectFilePath,
		).toBe("C:/Projects/Nanulak/Nanulak 180MW Substation.wdp");

		expect(
			withDerivedAcadeProjectFilePath(
				{
					...BASE_FORM,
					titleBlockAcadeProjectFilePath: "C:/Custom/ManualProject.wdp",
				},
				"C:/Projects/Nanulak",
			).titleBlockAcadeProjectFilePath,
		).toBe("C:/Custom/ManualProject.wdp");
	});

	it("builds project insert and update payloads from the feature-owned helpers", () => {
		expect(
			buildProjectInsertPayload({
				form: BASE_FORM,
				watchdogRootPath: "C:/Projects/Nanulak",
				userId: "user-1",
			}),
		).toMatchObject({
			name: "Nanulak 180MW Substation",
			pe_name: "Engineer Name",
			firm_number: "TX-Firm #000000",
			watchdog_root_path: "C:/Projects/Nanulak",
			pdf_package_root_path: "C:/Projects/Nanulak/Issued PDF",
			user_id: "user-1",
		});

		expect(
			buildProjectUpdatePayload({
				form: BASE_FORM,
				watchdogRootPath: "C:/Projects/Nanulak",
			}),
		).toMatchObject({
			name: "Nanulak 180MW Substation",
			pe_name: "Engineer Name",
			firm_number: "TX-Firm #000000",
			watchdog_root_path: "C:/Projects/Nanulak",
			pdf_package_root_path: "C:/Projects/Nanulak/Issued PDF",
		});
	});

	it("detects legacy projects-table schema drift for setup columns", () => {
		expect(
			getMissingProjectSetupColumns(
				new Error("column projects.pe_name does not exist in schema cache"),
			),
		).toEqual(["pe_name"]);
	});
});

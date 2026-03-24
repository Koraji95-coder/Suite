import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	return {
		orderCalls: [] as Array<{ table: string; column: string }>,
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		from: vi.fn(),
	};
});

vi.mock("./client", () => ({
	supabase: {
		from: mocks.from,
	},
}));

vi.mock("../lib/logger", () => ({
	logger: {
		warn: mocks.warn,
		info: mocks.info,
		debug: mocks.debug,
	},
}));

import { fetchAllData } from "./backupManager";

const DEFAULT_BACKUP_DATA = (table: string) => [{ id: `${table}-row` }];

function createQueryBuilder(
	table: string,
	options?: {
		validOrderColumns?: string[];
		fallbackData?: Record<string, unknown>[];
		fallbackError?: { message: string } | null;
	},
) {
	const validOrderColumns = new Set(
		options?.validOrderColumns ?? ["created_at"],
	);
	const fallbackData = options?.fallbackData ?? DEFAULT_BACKUP_DATA(table);
	const fallbackError = options?.fallbackError ?? null;

	const builder = {
		order: vi.fn(async (column: string) => {
			mocks.orderCalls.push({ table, column });
			if (validOrderColumns.has(column)) {
				return { data: fallbackData, error: null };
			}
			return {
				data: null,
				error: { message: `column ${table}.${column} does not exist` },
			};
		}),
		then<
			TResult1 = { data: Record<string, unknown>[]; error: null },
			TResult2 = never,
		>(
			onFulfilled?:
				| ((value: {
						data: Record<string, unknown>[];
						error: null;
				  }) => TResult1 | PromiseLike<TResult1>)
				| null,
			onRejected?:
				| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
				| null,
		) {
			const payload = fallbackError
				? Promise.resolve({ data: null, error: fallbackError })
				: Promise.resolve({ data: fallbackData, error: null });
			return payload.then(onFulfilled, onRejected);
		},
	};

	return {
		select: vi.fn(() => builder),
	};
}

describe("backupManager", () => {
	beforeEach(() => {
		mocks.orderCalls.length = 0;
		mocks.warn.mockReset();
		mocks.info.mockReset();
		mocks.debug.mockReset();
		mocks.from.mockImplementation((table: string) => {
			switch (table) {
				case "files":
					return createQueryBuilder(table, {
						validOrderColumns: ["uploaded_at", "id"],
					});
				case "activity_log":
					return createQueryBuilder(table, {
						validOrderColumns: ["timestamp", "id"],
					});
				case "calendar_events":
					return createQueryBuilder(table, {
						validOrderColumns: ["due_date", "start_at", "id"],
					});
				default:
					return createQueryBuilder(table);
			}
		});
	});

	it("uses table-specific ordering for backup tables without created_at", async () => {
		const data = await fetchAllData();

		expect(mocks.warn).not.toHaveBeenCalled();
		expect(data.tables.files).toEqual(DEFAULT_BACKUP_DATA("files"));
		expect(data.tables.activity_log).toEqual(
			DEFAULT_BACKUP_DATA("activity_log"),
		);
		expect(data.tables.calendar_events).toEqual(
			DEFAULT_BACKUP_DATA("calendar_events"),
		);
		expect(mocks.orderCalls).toEqual(
			expect.arrayContaining([
				{ table: "files", column: "uploaded_at" },
				{ table: "activity_log", column: "timestamp" },
				{ table: "calendar_events", column: "due_date" },
			]),
		);
	});

	it("falls back to an unordered fetch when ordering columns are unavailable", async () => {
		mocks.from.mockImplementation((table: string) => {
			if (table === "calendar_events") {
				return createQueryBuilder(table, {
					validOrderColumns: [],
					fallbackData: [{ id: "calendar-events-fallback" }],
				});
			}
			return createQueryBuilder(table);
		});

		const data = await fetchAllData();

		expect(mocks.warn).not.toHaveBeenCalled();
		expect(data.tables.calendar_events).toEqual([
			{ id: "calendar-events-fallback" },
		]);
		expect(mocks.orderCalls).toEqual(
			expect.arrayContaining([
				{ table: "calendar_events", column: "due_date" },
				{ table: "calendar_events", column: "start_at" },
				{ table: "calendar_events", column: "id" },
			]),
		);
	});
});

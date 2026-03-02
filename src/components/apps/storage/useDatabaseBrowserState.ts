import { useCallback, useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { TABLE_NAMES } from "./databaseBrowserModels";
import type { TableInfo } from "./storageTypes";

export function useDatabaseBrowserState() {
	const [tables, setTables] = useState<TableInfo[]>([]);
	const [selectedTable, setSelectedTable] = useState("");
	const [rows, setRows] = useState<Record<string, unknown>[]>([]);
	const [search, setSearch] = useState("");
	const [sortCol, setSortCol] = useState<string | null>(null);
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [pageSize, setPageSize] = useState(50);
	const [page, setPage] = useState(0);
	const [totalCount, setTotalCount] = useState(0);
	const [loadingTables, setLoadingTables] = useState(false);
	const [loadingData, setLoadingData] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const formatSupabaseError = useCallback((err: unknown, table?: string) => {
		const anyErr = err as {
			message?: string;
			details?: string;
			hint?: string;
			code?: string;
		};
		const base = anyErr?.message ?? String(err);
		const parts = [base];
		if (anyErr?.code) parts.push(`code=${anyErr.code}`);
		if (anyErr?.details) parts.push(`details=${anyErr.details}`);
		if (anyErr?.hint) parts.push(`hint=${anyErr.hint}`);
		if (table) parts.push(`table=${table}`);
		return parts.join(" | ");
	}, []);

	const loadTables = useCallback(async () => {
		setLoadingTables(true);
		setError(null);
		try {
			const results = await Promise.allSettled(
				TABLE_NAMES.map(async (name) => {
					const tableName = name as keyof Database["public"]["Tables"];
					const { count, error } = await supabase
						.from(tableName)
						.select("*", { count: "exact", head: true });
					if (error) throw { error, table: name };
					return { name, row_count: count ?? 0 } as TableInfo;
				}),
			);

			const nextTables: TableInfo[] = [];
			const errors: string[] = [];
			for (const result of results) {
				if (result.status === "fulfilled") {
					nextTables.push(result.value);
				} else {
					const table = (result.reason as { table?: string }).table;
					const err =
						(result.reason as { error?: unknown }).error ?? result.reason;
					const msg = formatSupabaseError(err, table);
					errors.push(msg);
					logger.error("DatabaseBrowser", "Failed to load table metadata", {
						table,
						error: err,
					});
				}
			}

			setTables(nextTables);
			if (errors.length) {
				setError(`Some tables failed to load: ${errors.join(" | ")}`);
			}
		} catch (err) {
			const msg = formatSupabaseError(err);
			setError(`Failed to load tables: ${msg}`);
			logger.error("DatabaseBrowser", "Failed to load tables", { error: err });
		} finally {
			setLoadingTables(false);
		}
	}, [formatSupabaseError]);

	const loadData = useCallback(async () => {
		if (!selectedTable) return;
		setLoadingData(true);
		setError(null);
		try {
			const tableName = selectedTable as keyof Database["public"]["Tables"];
			let query = supabase.from(tableName).select("*", { count: "exact" });
			if (sortCol) {
				query = query.order(sortCol, { ascending: sortDir === "asc" });
			}
			query = query.range(page * pageSize, (page + 1) * pageSize - 1);
			const { data, count, error } = await query;
			if (error) throw error;
			setRows((data ?? []) as Record<string, unknown>[]);
			setTotalCount(count ?? 0);
		} catch (err) {
			const msg = formatSupabaseError(err, selectedTable);
			setError(`Failed to load data from "${selectedTable}": ${msg}`);
			logger.error("DatabaseBrowser", "Failed to load table data", {
				table: selectedTable,
				error: err,
			});
			setRows([]);
			setTotalCount(0);
		} finally {
			setLoadingData(false);
		}
	}, [formatSupabaseError, page, pageSize, selectedTable, sortCol, sortDir]);

	useEffect(() => {
		void loadTables();
	}, [loadTables]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const selectTable = (table: string) => {
		setSelectedTable(table);
		setPage(0);
		setSortCol(null);
		setSortDir("asc");
		setSearch("");
	};

	const handleSort = (column: string) => {
		if (sortCol === column) {
			setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortCol(column);
			setSortDir("asc");
		}
		setPage(0);
	};

	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

	const filteredRows = useMemo(() => {
		if (!search) return rows;
		return rows.filter((row) =>
			Object.values(row).some(
				(value) =>
					value != null &&
					String(value).toLowerCase().includes(search.toLowerCase()),
			),
		);
	}, [rows, search]);

	const visibleKeys = useMemo(() => {
		if (!rows.length) return [];
		return Object.keys(rows[0]).filter((key) =>
			rows.some((row) => row[key] !== null),
		);
	}, [rows]);

	return {
		error,
		filteredRows,
		handleSort,
		loadingData,
		loadingTables,
		loadTables,
		page,
		pageSize,
		rows,
		search,
		selectTable,
		selectedTable,
		setError,
		setPage,
		setPageSize,
		setSearch,
		sortCol,
		sortDir,
		tables,
		totalCount,
		totalPages,
		visibleKeys,
	};
}

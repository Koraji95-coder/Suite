import { BookOpen, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { useAuth } from "../../../auth/useAuth";
import { FrameSection } from "../../apps/ui/PageFrame";

type Formula = Database["public"]["Tables"]["formulas"]["Row"];

export function FormulaBank() {
	const [formulas, setFormulas] = useState<Formula[]>([]);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedCategory, setSelectedCategory] = useState("All");
	const [loading, setLoading] = useState(true);
	const [showAddForm, setShowAddForm] = useState(false);
	const [isAddingFormula, setIsAddingFormula] = useState(false);
	const { showToast } = useToast();
	const auth = useAuth();
	const [newFormula, setNewFormula] = useState({
		name: "",
		category: "",
		formula: "",
		description: "",
	});

	const loadFormulas = useCallback(async () => {
		setLoading(true);
		try {
			const { data, error } = await supabase
				.from("formulas")
				.select("*")
				.order("category", { ascending: true });

			if (error) {
				logger.error("FormulaBank", "Failed to load formulas", {
					error: error.message,
				});
				// User-facing error would go here (toast)
			} else if (data) {
				setFormulas(data);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error(
				"FormulaBank",
				"Unexpected error loading formulas",
				{ error: message },
				err as Error,
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadFormulas();
	}, [loadFormulas]);

	const categories = [
		"All",
		...Array.from(new Set(formulas.map((f) => f.category))),
	];

	const filteredFormulas = formulas.filter((formula) => {
		const matchesSearch =
			formula.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			formula.formula.toLowerCase().includes(searchTerm.toLowerCase()) ||
			formula.description.toLowerCase().includes(searchTerm.toLowerCase());

		const matchesCategory =
			selectedCategory === "All" || formula.category === selectedCategory;

		return matchesSearch && matchesCategory;
	});

	const addFormula = async () => {
		if (!newFormula.name || !newFormula.formula || !newFormula.category) {
			showToast("warning", "Please fill in all required fields.");
			return;
		}

		setIsAddingFormula(true);
		try {
			const payload: Database["public"]["Tables"]["formulas"]["Insert"] = {
				name: newFormula.name,
				category: newFormula.category,
				formula: newFormula.formula,
				description: newFormula.description,
				user_id: auth.user?.id || "",
			};

			const { error } = await supabase.from("formulas").insert(payload);

			if (error) {
				logger.error("FormulaBank", "Failed to add formula", {
					error: error.message,
				});
				showToast(
					"error",
					`Error adding formula: ${error.message || "Unknown error"}`,
				);
			} else {
				setNewFormula({ name: "", category: "", formula: "", description: "" });
				setShowAddForm(false);
				await loadFormulas();
				showToast("success", "Formula added successfully.");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error(
				"FormulaBank",
				"Unexpected error adding formula",
				{ error: message },
				err as Error,
			);
			showToast("error", `Error adding formula: ${message}`);
		} finally {
			setIsAddingFormula(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center space-x-3">
					<BookOpen className="h-8 w-8 text-[var(--accent)]" />
					<h2 className="text-3xl font-bold text-[var(--text)]">
						Formula Bank
					</h2>
				</div>
				<button
					onClick={() => setShowAddForm(!showAddForm)}
					className="[background:linear-gradient(to_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] hover:opacity-90 [color:var(--text)] font-semibold px-6 py-3 rounded-lg transition-all shadow-lg shadow-[var(--primary)]/30 flex items-center space-x-2"
				>
					<Plus className="w-5 h-5" />
					<span>Add Formula</span>
				</button>
			</div>

			{showAddForm && (
				<FrameSection title="Add New Formula">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
								Name
							</label>
							<input
								type="text"
								value={newFormula.name}
								onChange={(e) =>
									setNewFormula({ ...newFormula, name: e.target.value })
								}
								className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
								placeholder="e.g., Ohm's Law"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
								Category
							</label>
							<input
								type="text"
								value={newFormula.category}
								onChange={(e) =>
									setNewFormula({ ...newFormula, category: e.target.value })
								}
								className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
								placeholder="e.g., Basic Laws"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
								Formula
							</label>
							<input
								type="text"
								value={newFormula.formula}
								onChange={(e) =>
									setNewFormula({ ...newFormula, formula: e.target.value })
								}
								className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
								placeholder="e.g., V = I × R"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
								Description
							</label>
							<input
								type="text"
								value={newFormula.description}
								onChange={(e) =>
									setNewFormula({ ...newFormula, description: e.target.value })
								}
								className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
								placeholder="Brief description"
							/>
						</div>
					</div>
					<div className="mt-4 flex gap-3">
						<button
							onClick={addFormula}
							disabled={isAddingFormula}
							className="[background:linear-gradient(to_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed [color:var(--text)] font-semibold px-6 py-2 rounded-lg transition-all"
						>
							{isAddingFormula ? "Adding..." : "Add Formula"}
						</button>
						<button
							onClick={() => setShowAddForm(false)}
							disabled={isAddingFormula}
							className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-2 text-[var(--text-muted)] transition-all hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
						>
							Cancel
						</button>
					</div>
				</FrameSection>
			)}

			<FrameSection>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-[var(--accent)]" />
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search formulas..."
							className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 pl-10 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
						/>
					</div>
					<div>
						<select
							value={selectedCategory}
							onChange={(e) => setSelectedCategory(e.target.value)}
							className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] [&>option]:bg-[var(--surface-2)] [&>option]:text-[var(--text)]"
						>
							{categories.map((cat) => (
								<option key={cat} value={cat} className="text-[var(--text)]">
									{cat}
								</option>
							))}
						</select>
					</div>
				</div>
			</FrameSection>

			<FrameSection>
				<div className="text-sm text-[var(--text-muted)]">
					<p>Total Formulas: {formulas.length}</p>
					<p>Filtered Formulas: {filteredFormulas.length}</p>
					<p>Selected Category: {selectedCategory}</p>
				</div>
			</FrameSection>

			{loading ? (
				<div className="py-8 text-center text-[var(--text-muted)]">
					Loading formulas...
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{filteredFormulas.map((formula) => (
						<div
							key={formula.id}
							className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 transition-all hover:border-[var(--accent)]"
						>
							<div className="flex items-start justify-between mb-2">
								<h3 className="text-lg font-bold text-[var(--text)]">
									{formula.name}
								</h3>
								<span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-muted)]">
									{formula.category}
								</span>
							</div>
							<div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
								<code className="font-mono text-lg text-[var(--accent)]">
									{formula.formula}
								</code>
							</div>
							<p className="text-sm text-[var(--text-muted)]">
								{formula.description}
							</p>
						</div>
					))}
				</div>
			)}

			{!loading && filteredFormulas.length === 0 && (
				<div className="py-8 text-center text-[var(--text-muted)]">
					No formulas found matching your search.
				</div>
			)}
		</div>
	);
}

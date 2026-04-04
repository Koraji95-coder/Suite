import { BookOpen, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Section } from "@/components/system/PageFrame";
import { useToast } from "@/components/notification-system/ToastProvider";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { useAuth } from "../../../auth/useAuth";
import styles from "./FormulaBank.module.css";

type Formula = Database["public"]["Tables"]["formulas"]["Row"];

export function FormulaBank() {
	const formFieldPrefix = useId().replace(/:/g, "");
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
		<div className={styles.root}>
			<div className={styles.headerRow}>
				<div className={styles.headerTitleWrap}>
					<BookOpen className={styles.headerIcon} />
					<h2 className={styles.title}>Formula Bank</h2>
				</div>
				<button
					onClick={() => setShowAddForm(!showAddForm)}
					className={styles.primaryButtonWithIcon}
				>
					<Plus className={styles.buttonIcon} />
					<span>Add Formula</span>
				</button>
			</div>

			{showAddForm && (
				<Section title="Add New Formula">
					<div className={styles.formGrid}>
						<div>
							<label
								className={styles.fieldLabel}
								htmlFor={`${formFieldPrefix}-formula-name`}
							>
								Name
							</label>
							<input
								id={`${formFieldPrefix}-formula-name`}
								name="formula_name"
								type="text"
								value={newFormula.name}
								onChange={(e) =>
									setNewFormula({ ...newFormula, name: e.target.value })
								}
								className={styles.inputControl}
								placeholder="e.g., Ohm's Law"
							/>
						</div>
						<div>
							<label
								className={styles.fieldLabel}
								htmlFor={`${formFieldPrefix}-formula-category`}
							>
								Category
							</label>
							<input
								id={`${formFieldPrefix}-formula-category`}
								name="formula_category"
								type="text"
								value={newFormula.category}
								onChange={(e) =>
									setNewFormula({ ...newFormula, category: e.target.value })
								}
								className={styles.inputControl}
								placeholder="e.g., Basic Laws"
							/>
						</div>
						<div>
							<label
								className={styles.fieldLabel}
								htmlFor={`${formFieldPrefix}-formula-expression`}
							>
								Formula
							</label>
							<input
								id={`${formFieldPrefix}-formula-expression`}
								name="formula_expression"
								type="text"
								value={newFormula.formula}
								onChange={(e) =>
									setNewFormula({ ...newFormula, formula: e.target.value })
								}
								className={styles.inputControl}
								placeholder="e.g., V = I × R"
							/>
						</div>
						<div>
							<label
								className={styles.fieldLabel}
								htmlFor={`${formFieldPrefix}-formula-description`}
							>
								Description
							</label>
							<input
								id={`${formFieldPrefix}-formula-description`}
								name="formula_description"
								type="text"
								value={newFormula.description}
								onChange={(e) =>
									setNewFormula({ ...newFormula, description: e.target.value })
								}
								className={styles.inputControl}
								placeholder="Brief description"
							/>
						</div>
					</div>
					<div className={styles.formActions}>
						<button
							onClick={addFormula}
							disabled={isAddingFormula}
							className={styles.primaryButton}
						>
							{isAddingFormula ? "Adding..." : "Add Formula"}
						</button>
						<button
							onClick={() => setShowAddForm(false)}
							disabled={isAddingFormula}
							className={styles.secondaryButton}
						>
							Cancel
						</button>
					</div>
				</Section>
			)}

			<Section>
				<div className={styles.filterGrid}>
					<div className={styles.searchWrap}>
						<Search className={styles.searchIcon} />
						<input
							id={`${formFieldPrefix}-search`}
							name="formula_search"
							aria-label="Search formulas"
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search formulas..."
							className={styles.searchInput}
						/>
					</div>
					<div>
						<select
							id={`${formFieldPrefix}-category-filter`}
							name="formula_category_filter"
							value={selectedCategory}
							onChange={(e) => setSelectedCategory(e.target.value)}
							className={styles.inputControl}
						>
							{categories.map((cat) => (
								<option key={cat} value={cat} className={styles.optionItem}>
									{cat}
								</option>
							))}
						</select>
					</div>
				</div>
			</Section>

			<Section>
				<div className={styles.stats}>
					<p>Total Formulas: {formulas.length}</p>
					<p>Filtered Formulas: {filteredFormulas.length}</p>
					<p>Selected Category: {selectedCategory}</p>
				</div>
			</Section>

			{loading ? (
				<div className={styles.emptyState}>Loading formulas...</div>
			) : (
				<div className={styles.formulaGrid}>
					{filteredFormulas.map((formula) => (
						<div key={formula.id} className={styles.formulaCard}>
							<div className={styles.formulaHeader}>
								<h3 className={styles.formulaName}>{formula.name}</h3>
								<span className={styles.categoryBadge}>{formula.category}</span>
							</div>
							<div className={styles.formulaBlock}>
								<code className={styles.formulaCode}>{formula.formula}</code>
							</div>
							<p className={styles.description}>{formula.description}</p>
						</div>
					))}
				</div>
			)}

			{!loading && filteredFormulas.length === 0 && (
				<div className={styles.emptyState}>
					No formulas found matching your search.
				</div>
			)}
		</div>
	);
}

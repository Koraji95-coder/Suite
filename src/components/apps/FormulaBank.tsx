import { BookOpen, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { Database } from "@/types/database";
import { useAuth } from "../../auth/useAuth";
import { logger } from "../lib/errorLogger";
import { Formula, supabase } from "../lib/supabase";
import { FrameSection } from "./ui/PageFrame";

export function FormulaBank() {
	const [formulas, setFormulas] = useState<Formula[]>([]);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedCategory, setSelectedCategory] = useState("All");
	const [loading, setLoading] = useState(true);
	const [showAddForm, setShowAddForm] = useState(false);
	const [isAddingFormula, setIsAddingFormula] = useState(false);
	const auth = useAuth();
	const [newFormula, setNewFormula] = useState({
		name: "",
		category: "",
		formula: "",
		description: "",
	});

	useEffect(() => {
		loadFormulas();
	}, []);

	const loadFormulas = async () => {
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
	};

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
			alert("Please fill in all required fields");
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
				alert("Error adding formula: " + (error.message || "Unknown error"));
			} else {
				setNewFormula({ name: "", category: "", formula: "", description: "" });
				setShowAddForm(false);
				await loadFormulas();
				alert("Formula added successfully!");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error(
				"FormulaBank",
				"Unexpected error adding formula",
				{ error: message },
				err as Error,
			);
			alert("Error adding formula: " + message);
		} finally {
			setIsAddingFormula(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center space-x-3">
					<BookOpen className="w-8 h-8 text-orange-400" />
					<h2 className="text-3xl font-bold text-white/90">Formula Bank</h2>
				</div>
				<button
					onClick={() => setShowAddForm(!showAddForm)}
					className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-lg shadow-orange-500/30 flex items-center space-x-2"
				>
					<Plus className="w-5 h-5" />
					<span>Add Formula</span>
				</button>
			</div>

			{showAddForm && (
				<FrameSection title="Add New Formula">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label className="block text-white/60 text-sm font-medium mb-2">
								Name
							</label>
							<input
								type="text"
								value={newFormula.name}
								onChange={(e) =>
									setNewFormula({ ...newFormula, name: e.target.value })
								}
								className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
								placeholder="e.g., Ohm's Law"
							/>
						</div>
						<div>
							<label className="block text-white/60 text-sm font-medium mb-2">
								Category
							</label>
							<input
								type="text"
								value={newFormula.category}
								onChange={(e) =>
									setNewFormula({ ...newFormula, category: e.target.value })
								}
								className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
								placeholder="e.g., Basic Laws"
							/>
						</div>
						<div>
							<label className="block text-white/60 text-sm font-medium mb-2">
								Formula
							</label>
							<input
								type="text"
								value={newFormula.formula}
								onChange={(e) =>
									setNewFormula({ ...newFormula, formula: e.target.value })
								}
								className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
								placeholder="e.g., V = I × R"
							/>
						</div>
						<div>
							<label className="block text-white/60 text-sm font-medium mb-2">
								Description
							</label>
							<input
								type="text"
								value={newFormula.description}
								onChange={(e) =>
									setNewFormula({ ...newFormula, description: e.target.value })
								}
								className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
								placeholder="Brief description"
							/>
						</div>
					</div>
					<div className="mt-4 flex gap-3">
						<button
							onClick={addFormula}
							disabled={isAddingFormula}
							className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:from-orange-600/50 disabled:to-amber-600/50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition-all"
						>
							{isAddingFormula ? "Adding..." : "Add Formula"}
						</button>
						<button
							onClick={() => setShowAddForm(false)}
							disabled={isAddingFormula}
							className="bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-all"
						>
							Cancel
						</button>
					</div>
				</FrameSection>
			)}

			<FrameSection>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-400" />
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search formulas..."
							className="w-full pl-10 bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
						/>
					</div>
					<div>
						<select
							value={selectedCategory}
							onChange={(e) => setSelectedCategory(e.target.value)}
							className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500 [&>option]:bg-gray-900 [&>option]:text-white/90"
						>
							{categories.map((cat) => (
								<option
									key={cat}
									value={cat}
									className="bg-gray-900 text-white/90"
								>
									{cat}
								</option>
							))}
						</select>
					</div>
				</div>
			</FrameSection>

			<FrameSection>
				<div className="text-white/60 text-sm">
					<p>Total Formulas: {formulas.length}</p>
					<p>Filtered Formulas: {filteredFormulas.length}</p>
					<p>Selected Category: {selectedCategory}</p>
				</div>
			</FrameSection>

			{loading ? (
				<div className="text-center text-white/60 py-8">
					Loading formulas...
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{filteredFormulas.map((formula) => (
						<div
							key={formula.id}
							className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-5 hover:border-orange-400/50 transition-all"
						>
							<div className="flex items-start justify-between mb-2">
								<h3 className="text-lg font-bold text-white/90">
									{formula.name}
								</h3>
								<span className="text-xs bg-orange-500/20 text-white/60 px-2 py-1 rounded">
									{formula.category}
								</span>
							</div>
							<div className="bg-black/50 rounded-lg px-4 py-3 mb-3 border border-white/10">
								<code className="text-orange-400 font-mono text-lg">
									{formula.formula}
								</code>
							</div>
							<p className="text-white/50 text-sm">{formula.description}</p>
						</div>
					))}
				</div>
			)}

			{!loading && filteredFormulas.length === 0 && (
				<div className="text-center text-white/50 py-8">
					No formulas found matching your search.
				</div>
			)}
		</div>
	);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteMemory, loadMemories } from "@/lib/agent-memory/service";
import type { Memory } from "@/lib/agent-memory/types";
import { adaptArchitecture } from "./adapters/architectureAdapter";
import { adaptMemories } from "./adapters/memoryAdapter";
import { Graph2D } from "./Graph2D";
import { GraphInspector } from "./GraphInspector";
import { GraphToolbar } from "./GraphToolbar";
import styles from "./GraphVisualization.module.css";
import type { GraphData, GraphNode, SourceFilter } from "./types";

function mergeGraphData(...sources: GraphData[]): GraphData {
	const nodes: GraphNode[] = [];
	const links: GraphData["links"] = [];
	for (const src of sources) {
		nodes.push(...src.nodes);
		links.push(...src.links);
	}
	return { nodes, links };
}

interface GraphVisualizationProps {
	sourceFilter?: SourceFilter;
	onSourceFilterChange?: (filter: SourceFilter) => void;
	searchQuery?: string;
	onSearchQueryChange?: (query: string) => void;
}

export function GraphVisualization({
	sourceFilter,
	onSourceFilterChange,
	searchQuery,
	onSearchQueryChange,
}: GraphVisualizationProps = {}) {
	const [internalSourceFilter, setInternalSourceFilter] =
		useState<SourceFilter>("architecture");
	const [internalSearchQuery, setInternalSearchQuery] = useState("");
	const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
	const [memories, setMemories] = useState<Memory[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [memoryLoadError, setMemoryLoadError] = useState<string | null>(null);

	const effectiveSourceFilter = sourceFilter ?? internalSourceFilter;
	const effectiveSearchQuery = searchQuery ?? internalSearchQuery;

	const handleSourceFilterChange = useCallback(
		(filter: SourceFilter) => {
			if (sourceFilter === undefined) {
				setInternalSourceFilter(filter);
			}
			onSourceFilterChange?.(filter);
		},
		[onSourceFilterChange, sourceFilter],
	);

	const handleSearchQueryChange = useCallback(
		(nextValue: string) => {
			if (searchQuery === undefined) {
				setInternalSearchQuery(nextValue);
			}
			onSearchQueryChange?.(nextValue);
		},
		[onSearchQueryChange, searchQuery],
	);

	useEffect(() => {
		let cancelled = false;
		void loadMemories()
			.then((m) => {
				if (cancelled) return;
				setMemories(m);
				setMemoryLoadError(null);
			})
			.catch((error) => {
				if (cancelled) return;
				setMemories([]);
				setMemoryLoadError(
					error instanceof Error
						? error.message
						: "Unable to load agent memory graph data.",
				);
			})
			.finally(() => {
				if (cancelled) return;
				setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const archData = useMemo(() => adaptArchitecture(), []);
	const memData = useMemo(() => adaptMemories(memories), [memories]);

	const graphData = useMemo(() => {
		if (effectiveSourceFilter === "architecture") return archData;
		if (effectiveSourceFilter === "memory") return memData;
		return mergeGraphData(archData, memData);
	}, [effectiveSourceFilter, archData, memData]);

	const filtered = useMemo(() => {
		if (!effectiveSearchQuery.trim()) return graphData;
		const q = effectiveSearchQuery.toLowerCase();
		const matchIds = new Set(
			graphData.nodes
				.filter(
					(n) =>
						n.label.toLowerCase().includes(q) ||
						n.group.toLowerCase().includes(q),
				)
				.map((n) => n.id),
		);
		return {
			nodes: graphData.nodes.filter((n) => matchIds.has(n.id)),
			links: graphData.links.filter(
				(l) => matchIds.has(l.source) || matchIds.has(l.target),
			),
		};
	}, [effectiveSearchQuery, graphData]);

	const handleDeleteMemory = useCallback(
		async (id: string) => {
			const ok = await deleteMemory(id);
			if (ok) {
				setMemories((prev) => prev.filter((m) => m.id !== id));
				if (selectedNode?.id === id) setSelectedNode(null);
			}
		},
		[selectedNode],
	);

	useEffect(() => {
		if (!selectedNode) return;
		const stillVisible = filtered.nodes.some(
			(node) => node.id === selectedNode.id,
		);
		if (!stillVisible) {
			setSelectedNode(null);
		}
	}, [filtered.nodes, selectedNode]);

	return (
		<div className={styles.root}>
			<GraphToolbar
				sourceFilter={effectiveSourceFilter}
				onSourceFilterChange={handleSourceFilterChange}
				searchQuery={effectiveSearchQuery}
				onSearchChange={handleSearchQueryChange}
			/>
			<div className={styles.body}>
				<div className={styles.graphPane}>
					{!loaded ? (
						<div className={styles.loadingState}>Loading graph data...</div>
					) : memoryLoadError && effectiveSourceFilter !== "architecture" ? (
						<div className={styles.loadingState}>
							Agent memory graph is unavailable: {memoryLoadError}
						</div>
					) : filtered.nodes.length === 0 ? (
						<div className={styles.loadingState}>
							No graph nodes match this source scope and search filter.
						</div>
					) : (
						<Graph2D
							data={filtered}
							selectedNodeId={selectedNode?.id ?? null}
							onSelectNode={setSelectedNode}
						/>
					)}
				</div>
				{selectedNode && (
					<GraphInspector
						selectedNode={selectedNode}
						onClose={() => setSelectedNode(null)}
						onDeleteMemory={handleDeleteMemory}
					/>
				)}
			</div>
		</div>
	);
}

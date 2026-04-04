import { useCallback, useEffect, useMemo, useState } from "react";
import { adaptArchitecture } from "./adapters/architectureAdapter";
import { Graph2D } from "./Graph2D";
import { GraphInspector } from "./GraphInspector";
import { GraphToolbar } from "./GraphToolbar";
import styles from "./GraphVisualization.module.css";
import type { GraphNode, SourceFilter } from "./types";

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
	const [loaded, setLoaded] = useState(false);

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
		setLoaded(true);
	}, []);

	const archData = useMemo(() => adaptArchitecture(), []);
	const graphData = useMemo(() => archData, [archData]);

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
					/>
				)}
			</div>
		</div>
	);
}

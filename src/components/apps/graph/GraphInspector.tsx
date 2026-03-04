import { Trash2, X } from "lucide-react";
import styles from "./GraphInspector.module.css";
import type { GraphNode } from "./types";

interface GraphInspectorProps {
	selectedNode: GraphNode;
	onClose: () => void;
	onDeleteMemory: (id: string) => void;
}

export function GraphInspector({
	selectedNode,
	onClose,
	onDeleteMemory,
}: GraphInspectorProps) {
	const isMemory = selectedNode.source === "memory";

	return (
		<aside className={styles.root}>
			<div className={styles.header}>
				<h3 className={styles.title}>{selectedNode.label}</h3>
				<button
					type="button"
					onClick={onClose}
					className={styles.closeButton}
					aria-label="Close inspector"
				>
					<X size={14} className={styles.closeIcon} />
				</button>
			</div>

			<dl className={styles.metaList}>
				<div>
					<dt className={styles.metaLabel}>Group</dt>
					<dd className={styles.metaValue}>{selectedNode.group}</dd>
				</div>
				<div>
					<dt className={styles.metaLabel}>Source</dt>
					<dd className={styles.metaValue}>{selectedNode.source}</dd>
				</div>
				<div>
					<dt className={styles.metaLabel}>ID</dt>
					<dd className={styles.metaCode}>{selectedNode.id}</dd>
				</div>
			</dl>

			{selectedNode.data && Object.keys(selectedNode.data).length > 0 && (
				<div className={styles.metadataSection}>
					<h4 className={styles.metadataTitle}>Metadata</h4>
					<pre className={styles.metadataCode}>
						{JSON.stringify(selectedNode.data, null, 2)}
					</pre>
				</div>
			)}

			{isMemory && (
				<button
					type="button"
					onClick={() => onDeleteMemory(selectedNode.id)}
					className={styles.deleteButton}
				>
					<Trash2 size={13} />
					Delete memory
				</button>
			)}
		</aside>
	);
}

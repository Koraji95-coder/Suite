import { X, Trash2 } from "lucide-react";
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
		<aside
			className="w-72 shrink-0 overflow-y-auto border-l p-4"
			style={{
				borderColor: "var(--border)",
				background: "var(--surface)",
			}}
		>
			<div className="mb-3 flex items-start justify-between gap-2">
				<h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
					{selectedNode.label}
				</h3>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md p-1 transition hover:bg-[var(--surface-2)]"
					aria-label="Close inspector"
				>
					<X size={14} style={{ color: "var(--text-muted)" }} />
				</button>
			</div>

			<dl className="grid gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
				<div>
					<dt className="font-medium" style={{ color: "var(--text)" }}>Group</dt>
					<dd className="mt-0.5">{selectedNode.group}</dd>
				</div>
				<div>
					<dt className="font-medium" style={{ color: "var(--text)" }}>Source</dt>
					<dd className="mt-0.5">{selectedNode.source}</dd>
				</div>
				<div>
					<dt className="font-medium" style={{ color: "var(--text)" }}>ID</dt>
					<dd className="mt-0.5 break-all font-mono">{selectedNode.id}</dd>
				</div>
			</dl>

			{selectedNode.data && Object.keys(selectedNode.data).length > 0 && (
				<div className="mt-3">
					<h4 className="mb-1 text-xs font-medium" style={{ color: "var(--text)" }}>
						Metadata
					</h4>
					<pre
						className="overflow-x-auto rounded-md border p-2 text-xs"
						style={{
							borderColor: "var(--border)",
							background: "var(--bg-heavy)",
							color: "var(--text-muted)",
						}}
					>
						{JSON.stringify(selectedNode.data, null, 2)}
					</pre>
				</div>
			)}

			{isMemory && (
				<button
					type="button"
					onClick={() => onDeleteMemory(selectedNode.id)}
					className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition"
					style={{
						borderColor: "var(--danger)",
						color: "var(--danger)",
						background: "transparent",
					}}
				>
					<Trash2 size={13} />
					Delete memory
				</button>
			)}
		</aside>
	);
}

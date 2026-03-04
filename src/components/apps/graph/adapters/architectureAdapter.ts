import {
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";
import type { GraphData, GraphLink, GraphNode } from "../types";

const DOMAIN_NODE_ID = (id: string) => `domain:${id}`;
const MODULE_NODE_ID = (id: string) => `module:${id}`;

export function adaptArchitecture(): GraphData {
	const nodes: GraphNode[] = [];
	const links: GraphLink[] = [];
	const idSet = new Set<string>();

	const majorCount = Math.max(ARCHITECTURE_DOMAINS.length, 1);
	const angleStep = (2 * Math.PI) / majorCount;

	ARCHITECTURE_DOMAINS.forEach((domain, i) => {
		const angle = angleStep * i;
		const radius = 320;
		const nodeId = DOMAIN_NODE_ID(domain.id);
		idSet.add(nodeId);
		nodes.push({
			id: nodeId,
			label: domain.label,
			group: domain.group,
			source: "architecture",
			x: Math.cos(angle) * radius,
			y: Math.sin(angle) * radius,
			z: 0,
			data: {
				type: "major",
				domainId: domain.id,
				repoRoots: domain.repoRoots,
				description: domain.summary,
			},
		});
	});

	for (const { domain, modules } of ARCHITECTURE_MODULES_BY_DOMAIN) {
		const majorNode = nodes.find(
			(node) => node.id === DOMAIN_NODE_ID(domain.id),
		);
		if (!majorNode) continue;
		const childAngleStep =
			modules.length > 0 ? (2 * Math.PI) / modules.length : 0;

		modules.forEach((module, j) => {
			const angle = childAngleStep * j;
			const spread = 160;
			const moduleNodeId = MODULE_NODE_ID(module.id);
			idSet.add(moduleNodeId);

			nodes.push({
				id: moduleNodeId,
				label: module.label,
				group: domain.group,
				source: "architecture",
				x: majorNode.x + Math.cos(angle) * spread,
				y: majorNode.y + Math.sin(angle) * spread,
				z: 0,
				data: {
					type: "minor",
					parentId: majorNode.id,
					path: module.path,
					description: module.summary,
					showLabel: !module.id.startsWith("auto-"),
				},
			});

			links.push({ source: majorNode.id, target: moduleNodeId, weight: 0.82 });
		});
	}

	for (const dependency of ARCHITECTURE_DEPENDENCIES) {
		const source = MODULE_NODE_ID(dependency.sourceId);
		const target = MODULE_NODE_ID(dependency.targetId);
		if (!idSet.has(source) || !idSet.has(target)) continue;

		links.push({
			source,
			target,
			weight: dependency.weight ?? 0.65,
		});
	}

	return { nodes, links };
}

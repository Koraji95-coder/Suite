import type { GraphData, GraphLink, GraphNode } from "../types";

type ArchitectureMajor = {
	id: string;
	group: string;
	sub?: string;
	icon?: string;
	color?: string;
};

const MAJORS: ArchitectureMajor[] = [];
const MINORS: Record<string, string[]> = {};
const OVERLAPS: Array<[string, string]> = [];
const MAJOR_DESC: Record<string, string> = {};

export function adaptArchitecture(): GraphData {
	const nodes: GraphNode[] = [];
	const links: GraphLink[] = [];

	const angleStep = (2 * Math.PI) / MAJORS.length;

	MAJORS.forEach((major, i) => {
		const angle = angleStep * i;
		const radius = 300;
		nodes.push({
			id: major.id,
			label: major.id,
			group: major.group,
			source: "architecture",
			x: Math.cos(angle) * radius,
			y: Math.sin(angle) * radius,
			z: 0,
			data: {
				type: "major",
				sub: major.sub,
				icon: major.icon,
				color: major.color,
				description: MAJOR_DESC[major.group] ?? "",
			},
		});
	});

	for (const major of MAJORS) {
		const children = MINORS[major.group] ?? [];
		const majorNode = nodes.find((n) => n.id === major.id)!;
		const childAngleStep =
			children.length > 0 ? (2 * Math.PI) / children.length : 0;

		children.forEach((minorId, j) => {
			const angle = childAngleStep * j;
			const spread = 120;
			nodes.push({
				id: minorId,
				label: minorId,
				group: major.group,
				source: "architecture",
				x: majorNode.x + Math.cos(angle) * spread,
				y: majorNode.y + Math.sin(angle) * spread,
				z: 0,
				data: { type: "minor", parentId: major.id },
			});

			links.push({ source: major.id, target: minorId, weight: 0.8 });
		});
	}

	for (const [a, b] of OVERLAPS) {
		links.push({ source: a, target: b, weight: 0.4 });
	}

	return { nodes, links };
}

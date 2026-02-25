// src/components/fx/Marquee.tsx
import { useMemo } from "react";

type Item = { t: string; b?: boolean };

export default function Marquee() {
	const items = useMemo<Item[]>(
		() => [
			{ t: "10,421 components", b: true },
			{ t: "Physics-aware blocks" },
			{ t: "99.97% uptime", b: true },
			{ t: "TypeScript native" },
			{ t: "<12ms latency", b: true },
			{ t: "Tree-shaking built in" },
			{ t: "247 edge nodes", b: true },
			{ t: "Semantic versioning" },
			{ t: "AI suggestions", b: true },
			{ t: "Zero cold starts" },
		],
		[],
	);

	const doubled = [...items, ...items];

	return (
		<div className="marquee">
			<div className="marquee-track" id="marquee-track">
				{doubled.map((i, idx) => (
					<div key={`${i.t}-${idx}`} className="marquee-item">
						<span className="marquee-dot" />
						{i.b ? <strong>{i.t}</strong> : i.t}
					</div>
				))}
			</div>
		</div>
	);
}

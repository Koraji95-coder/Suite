import { Link } from "react-router-dom";
import type { AppsCatalogItem } from "./appsCatalog";

export function AppsCatalogGrid({ items }: { items: AppsCatalogItem[] }) {
	return (
		<div className="app-cards-grid">
			{items.map((item) => (
				<article key={item.id} className="app-card glass">
					<div className="flex items-center justify-between gap-3">
						<h2>{item.title}</h2>
						<span
							className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide"
							style={{ color: "var(--white-dim)" }}
						>
							{item.status}
						</span>
					</div>
					<p>{item.description}</p>
					<Link className="btn-hero-secondary" to={item.to}>
						Open {item.title}
					</Link>
				</article>
			))}
		</div>
	);
}

import { Link } from "react-router-dom";
import type { AppsCatalogItem } from "./appsCatalog";

export function AppsCatalogGrid({ items }: { items: AppsCatalogItem[] }) {
	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{items.map((item) => (
				<article
					key={item.id}
					className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--bg-mid)]"
				>
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-base font-semibold [color:var(--text)]">
							{item.title}
						</h2>
						<span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide [border-color:var(--border)] [color:var(--text-muted)]">
							{item.status}
						</span>
					</div>
					<p className="text-sm [color:var(--text-muted)]">
						{item.description}
					</p>
					{item.to ? (
						<Link
							className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
							to={item.to}
						>
							Open {item.title}
						</Link>
					) : (
						<button
							type="button"
							disabled
							className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold opacity-70 [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]"
						>
							Coming Soon
						</button>
					)}
				</article>
			))}
		</div>
	);
}

import { Link } from "react-router-dom";
import styles from "./AppsCatalogGrid.module.css";
import type { AppsCatalogItem } from "./appsCatalog";

export function AppsCatalogGrid({ items }: { items: AppsCatalogItem[] }) {
	return (
		<div className={styles.grid}>
			{items.map((item) => (
				<article key={item.id} className={styles.card}>
					<div className={styles.header}>
						<h2 className={styles.title}>{item.title}</h2>
						<span className={styles.status}>{item.status}</span>
					</div>
					<p className={styles.description}>{item.description}</p>
					{item.to ? (
						<Link className={styles.actionLink} to={item.to}>
							Open {item.title}
						</Link>
					) : (
						<button type="button" disabled className={styles.actionDisabled}>
							Coming Soon
						</button>
					)}
				</article>
			))}
		</div>
	);
}

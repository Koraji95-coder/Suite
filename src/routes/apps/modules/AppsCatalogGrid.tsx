import { ArrowRight, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import styles from "./AppsCatalogGrid.module.css";
import type { AppsCatalogItem } from "./appsCatalog";

export function AppsCatalogGrid({ items }: { items: AppsCatalogItem[] }) {
	return (
		<div className={styles.grid}>
			{items.map((item) => (
				<article
					key={item.id}
					className={cn(
						styles.card,
						item.lane === "workspace" && styles.cardWorkspace,
						item.lane === "automation" && styles.cardAutomation,
						item.lane === "intelligence" && styles.cardIntelligence,
					)}
				>
					<div className={styles.header}>
						<div className={styles.identity}>
							<div className={styles.iconShell}>
								<item.icon className={styles.icon} />
							</div>
							<div className={styles.headerCopy}>
								<span className={styles.signal}>{item.signal}</span>
								<h2 className={styles.title}>{item.title}</h2>
							</div>
						</div>
					</div>
					<p className={styles.description}>{item.description}</p>
					{item.to ? (
						<Link className={styles.actionLink} to={item.to}>
							<span>Open {item.title}</span>
							<ArrowRight className={styles.actionIcon} />
						</Link>
					) : (
						<button type="button" disabled className={styles.actionDisabled}>
							<Clock3 className={styles.actionIcon} />
							<span>Coming Soon</span>
						</button>
					)}
				</article>
			))}
		</div>
	);
}

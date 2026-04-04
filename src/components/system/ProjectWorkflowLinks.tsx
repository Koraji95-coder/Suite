import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import styles from "./ProjectWorkflowLinks.module.css";

interface ProjectWorkflowLink {
	label: string;
	to: string;
}

interface ProjectWorkflowLinksProps {
	links: ProjectWorkflowLink[];
	label?: string;
}

export function ProjectWorkflowLinks({
	links,
	label = "Project workflow",
}: ProjectWorkflowLinksProps) {
	if (links.length === 0) {
		return null;
	}

	return (
		<div className={styles.root}>
			<span className={styles.label}>{label}</span>
			<div className={styles.links}>
				{links.map((link) => (
					<Link key={`${link.label}-${link.to}`} to={link.to} className={styles.link}>
						<span>{link.label}</span>
						<ArrowUpRight className={styles.icon} />
					</Link>
				))}
			</div>
		</div>
	);
}

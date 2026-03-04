import { Info, X } from "lucide-react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./PanelInfoDialog.module.css";

interface InfoSection {
	title: string;
	content: string | string[];
	tips?: string[];
}

interface PanelInfoDialogProps {
	title: string;
	sections: InfoSection[];
	colorScheme?: "cyan" | "blue" | "green" | "orange" | "teal";
}

export function PanelInfoDialog({ title, sections }: PanelInfoDialogProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<button onClick={() => setIsOpen(true)} className={styles.triggerButton}>
				<Info className={styles.triggerIcon} />
				<span>Panel Info</span>
			</button>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className={styles.dialogContent}>
					<DialogHeader className={styles.dialogHeader}>
						<div className={styles.headerRow}>
							<Info className={styles.headerIcon} />
							<DialogTitle className={styles.dialogTitle}>{title}</DialogTitle>
						</div>
						<button
							onClick={() => setIsOpen(false)}
							className={styles.closeButton}
						>
							<X className={styles.closeIcon} />
						</button>
					</DialogHeader>

					<div className={styles.body}>
						{sections.map((section, index) => (
							<div key={index} className={styles.sectionCard}>
								<h4 className={styles.sectionTitle}>{section.title}</h4>

								{Array.isArray(section.content) ? (
									<ul className={styles.contentList}>
										{section.content.map((item, i) => (
											<li key={i} className={styles.contentListItem}>
												<span className={styles.bullet}>•</span>
												<span>{item}</span>
											</li>
										))}
									</ul>
								) : (
									<p className={styles.contentText}>{section.content}</p>
								)}

								{section.tips && section.tips.length > 0 && (
									<div className={styles.tipsCard}>
										<p className={styles.tipsTitle}>Tips</p>
										<ul className={styles.tipsList}>
											{section.tips.map((tip, i) => (
												<li key={i} className={styles.tipItem}>
													{tip}
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						))}
					</div>

					<div className={styles.footer}>
						<button
							onClick={() => setIsOpen(false)}
							className={styles.closeAction}
						>
							Close
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

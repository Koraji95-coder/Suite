import { ChevronDown, Filter, List, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import styles from "./file-manager-dashboard-all-files.module.css";
import { allFiles, fileTypeLegendItems } from "./file-manager-dashboard-models";

export function FileManagerDashboardAllFiles() {
	return (
		<section className={styles.root}>
			<div className={styles.headerRow}>
				<h2 className={styles.title}>All files</h2>
				<div className={styles.headerActions}>
					<Button variant="outline" size="sm">
						<Filter size={16} className={styles.leadingIcon} />
						<span className={styles.buttonLabel}>Filter</span>
					</Button>
					<Button variant="outline" size="sm">
						<List size={16} className={styles.leadingIcon} />
						<span className={styles.buttonLabel}>List</span>
						<ChevronDown className={styles.trailingIcon} />
					</Button>
				</div>
			</div>

			<div className={styles.legendRow}>
				{fileTypeLegendItems.map((item) => (
					<div key={item.label} className={styles.legendItem}>
						<div
							className={styles.legendSwatch}
							style={{ background: item.color }}
						/>
						<span className={styles.legendLabel}>{item.label}</span>
					</div>
				))}
			</div>

			<div className={styles.mobileList}>
				{allFiles.map((file) => (
					<Panel key={file.name} padding="none" className={styles.mobileCard}>
						<div className={styles.mobileFileRow}>
							<div className={styles.mobileFileIconWrap}>
								<file.icon className={styles.mobileFileIcon} />
							</div>
							<div className={styles.fileInfo}>
								<p className={styles.fileName}>{file.name}</p>
								<div className={styles.fileMeta}>
									<span>{file.owner}</span>
									<span className={styles.separator}>•</span>
									<span>{file.size}</span>
									<span className={styles.separator}>•</span>
									<span>{file.date}</span>
								</div>
							</div>
							<Button
								variant="ghost"
								size="sm"
								iconOnly
								iconLeft={<MoreHorizontal size={16} />}
								aria-label={`More actions for ${file.name}`}
							/>
						</div>
					</Panel>
				))}
			</div>

			<div className={styles.desktopTable}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderName}>Name</div>
					<div>Owner</div>
					<div>File Size</div>
					<div>Date modified</div>
					<div />
				</div>
				{allFiles.map((file) => (
					<div key={file.name} className={styles.tableRow}>
						<div className={styles.tableNameCell}>
							<div className={styles.tableFileIconWrap}>
								<file.icon className={styles.tableFileIcon} />
							</div>
							<span className={styles.tableFileName}>{file.name}</span>
						</div>
						<div className={styles.tableMetaCell}>{file.owner}</div>
						<div className={styles.tableMetaCell}>{file.size}</div>
						<div className={styles.tableMetaCell}>{file.date}</div>
						<div className={styles.tableActions}>
							<Button
								variant="ghost"
								size="sm"
								iconOnly
								iconLeft={<MoreHorizontal size={16} />}
								aria-label={`More actions for ${file.name}`}
							/>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

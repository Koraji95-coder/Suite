import { BookOpen, Pen } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/system/dialog";
import { cn } from "@/lib/utils";
import { Whiteboard } from "../Whiteboard";
import { WhiteboardLibrary } from "../whiteboardlibrary/WhiteboardLibrary";
import styles from "./FloatingWhiteboardButton.module.css";

interface FloatingWhiteboardButtonProps {
	panelContext: string;
}

export function FloatingWhiteboardButton({
	panelContext,
}: FloatingWhiteboardButtonProps) {
	const [showWhiteboard, setShowWhiteboard] = useState(false);
	const [showLibrary, setShowLibrary] = useState(false);
	const [showMenu, setShowMenu] = useState(false);

	useEffect(() => {
		if (showWhiteboard || showLibrary) {
			setShowMenu(false);
		}
	}, [showWhiteboard, showLibrary]);

	return (
		<>
			<div
				className={styles.container}
				style={{
					zIndex: "var(--z-topbar)",
					paddingBottom: "env(safe-area-inset-bottom, 0px)",
					paddingRight: "env(safe-area-inset-right, 0px)",
				}}
			>
				{showMenu && (
					<div className={styles.menuPanel}>
						<button
							onClick={() => {
								setShowWhiteboard(true);
								setShowMenu(false);
							}}
							className={styles.primaryAction}
						>
							<Pen className={styles.actionIcon} />
							<span className={styles.actionLabel}>New Whiteboard</span>
						</button>

						<button
							onClick={() => {
								setShowLibrary(true);
								setShowMenu(false);
							}}
							className={styles.secondaryAction}
						>
							<BookOpen className={styles.actionIcon} />
							<span className={styles.actionLabel}>Whiteboard Library</span>
						</button>
					</div>
				)}

				<button
					onClick={() => setShowMenu(!showMenu)}
					className={cn(styles.fabButton, showMenu && styles.fabButtonOpen)}
					title="Whiteboard"
					aria-label="Toggle whiteboard actions"
					aria-expanded={showMenu}
				>
					<Pen className={styles.fabIcon} />
				</button>
			</div>

			<Whiteboard
				isOpen={showWhiteboard}
				onClose={() => setShowWhiteboard(false)}
				panelContext={panelContext}
				onSaved={() => {
					setShowWhiteboard(false);
				}}
			/>

			<Dialog open={showLibrary} onOpenChange={setShowLibrary}>
				<DialogContent className={styles.dialogContent} showCloseButton={false}>
					<DialogHeader className={styles.dialogHeader}>
						<div className={styles.dialogHeaderRow}>
							<DialogTitle className={styles.dialogTitle}>
								<BookOpen className={styles.dialogTitleIcon} />
								<span>Whiteboard Library</span>
							</DialogTitle>
							<DialogDescription className="sr-only">
								Browse, preview, and delete saved whiteboards.
							</DialogDescription>
							<button
								type="button"
								onClick={() => setShowLibrary(false)}
								className={styles.dialogClose}
								aria-label="Close whiteboard library"
							>
								×
							</button>
						</div>
					</DialogHeader>
					<div className={styles.dialogBody}>
						<WhiteboardLibrary
							filterByPanel={
								panelContext !== "Dashboard" ? panelContext : undefined
							}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

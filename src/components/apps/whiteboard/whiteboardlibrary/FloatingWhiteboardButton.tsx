import { BookOpen, Pen } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import { Whiteboard } from "../Whiteboard";
import { WhiteboardLibrary } from "../whiteboardlibrary/WhiteboardLibrary";

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
				className="fixed bottom-4 right-4 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6"
				style={{
					zIndex: "var(--z-topbar)",
					paddingBottom: "env(safe-area-inset-bottom, 0px)",
					paddingRight: "env(safe-area-inset-right, 0px)",
				}}
			>
				{showMenu && (
					<div className="mb-2 flex w-[min(86vw,18rem)] flex-col gap-2 rounded-xl border p-2 shadow-xl backdrop-blur-sm [border-color:var(--border)] [background:color-mix(in_srgb,var(--bg-base)_92%,transparent)] sm:w-64">
						<button
							onClick={() => {
								setShowWhiteboard(true);
								setShowMenu(false);
							}}
							className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all [background:linear-gradient(to_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] [color:var(--text)] hover:opacity-90"
						>
							<Pen className="h-4 w-4 shrink-0" />
							<span className="truncate">New Whiteboard</span>
						</button>

						<button
							onClick={() => {
								setShowLibrary(true);
								setShowMenu(false);
							}}
							className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all [background:linear-gradient(to_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] [color:var(--text)] hover:opacity-90"
						>
							<BookOpen className="h-4 w-4 shrink-0" />
							<span className="truncate">Whiteboard Library</span>
						</button>
					</div>
				)}

				<button
					onClick={() => setShowMenu(!showMenu)}
					className={`flex h-12 w-12 items-center justify-center rounded-full shadow-2xl transition-all [background:linear-gradient(to_bottom_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] [color:var(--text)] hover:opacity-90 sm:h-14 sm:w-14 ${
						showMenu ? "rotate-45" : ""
					}`}
					title="Whiteboard"
					aria-label="Toggle whiteboard actions"
					aria-expanded={showMenu}
				>
					<Pen className="h-5 w-5 sm:h-6 sm:w-6" />
				</button>
			</div>

			<Whiteboard
				isOpen={showWhiteboard}
				onClose={() => setShowWhiteboard(false)}
				panelContext={panelContext}
				onSaved={() => {
					setShowWhiteboard(false);
					// Optionally refresh library
				}}
			/>

			<Dialog open={showLibrary} onOpenChange={setShowLibrary}>
				<DialogContent className="max-h-[90vh] max-w-7xl border-[var(--border)] bg-[var(--surface)] p-0">
					<DialogHeader className="border-b border-[var(--border)] p-6">
						<div className="flex items-center justify-between">
							<DialogTitle className="flex items-center space-x-3 text-[var(--text)]">
								<BookOpen className="h-6 w-6 text-[var(--accent)]" />
								<span>Whiteboard Library</span>
							</DialogTitle>
							<button
								onClick={() => setShowLibrary(false)}
								className="text-2xl text-[var(--text-muted)] transition-all hover:text-[var(--text)]"
							>
								×
							</button>
						</div>
					</DialogHeader>
					<div className="max-h-[calc(90vh-96px)] overflow-auto p-6">
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

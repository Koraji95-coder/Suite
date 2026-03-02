import { BookOpen, Pen } from "lucide-react";
import { useState } from "react";
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

	return (
		<>
			<div className="fixed bottom-6 right-6 flex flex-col items-end space-y-2" style={{ zIndex: "var(--z-topbar)" }}>
				{showMenu && (
					<div className="flex flex-col space-y-2 mb-2">
						<button
							onClick={() => {
								setShowWhiteboard(true);
								setShowMenu(false);
							}}
							className="flex items-center space-x-2 [background:linear-gradient(to_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] hover:opacity-90 [color:var(--text)] font-semibold px-4 py-3 rounded-lg shadow-lg transition-all"
						>
							<Pen className="w-5 h-5" />
							<span>New Whiteboard</span>
						</button>

						<button
							onClick={() => {
								setShowLibrary(true);
								setShowMenu(false);
							}}
							className="flex items-center space-x-2 [background:linear-gradient(to_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] hover:opacity-90 [color:var(--text)] font-semibold px-4 py-3 rounded-lg shadow-lg transition-all"
						>
							<BookOpen className="w-5 h-5" />
							<span>Whiteboard Library</span>
						</button>
					</div>
				)}

				<button
					onClick={() => setShowMenu(!showMenu)}
					className={`flex items-center justify-center w-14 h-14 [background:linear-gradient(to_bottom_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] hover:opacity-90 [color:var(--text)] rounded-full shadow-2xl transition-all ${
						showMenu ? "rotate-45" : ""
					}`}
					title="Whiteboard"
				>
					<Pen className="w-6 h-6" />
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

			{showLibrary && (
				<div className="fixed inset-0 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.62)] p-4 backdrop-blur-sm" style={{ zIndex: "var(--z-dialog)" }}>
					<div className="flex max-h-[90vh] w-full max-w-7xl flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl">
						<div className="flex items-center justify-between border-b border-[var(--border)] p-6">
							<div className="flex items-center space-x-3">
								<BookOpen className="h-6 w-6 text-[var(--accent)]" />
								<h3 className="text-2xl font-bold text-[var(--text)]">
									Whiteboard Library
								</h3>
							</div>
							<button
								onClick={() => setShowLibrary(false)}
								className="text-2xl text-[var(--text-muted)] transition-all hover:text-[var(--text)]"
							>
								×
							</button>
						</div>

						<div className="flex-1 overflow-auto p-6">
							<WhiteboardLibrary
								filterByPanel={
									panelContext !== "Dashboard" ? panelContext : undefined
								}
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

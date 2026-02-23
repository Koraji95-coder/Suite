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
			<div className="fixed bottom-6 right-6 z-40 flex flex-col items-end space-y-2">
				{showMenu && (
					<div className="flex flex-col space-y-2 mb-2">
						<button
							onClick={() => {
								setShowWhiteboard(true);
								setShowMenu(false);
							}}
							className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-4 py-3 rounded-lg shadow-lg shadow-orange-500/50 transition-all"
						>
							<Pen className="w-5 h-5" />
							<span>New Whiteboard</span>
						</button>

						<button
							onClick={() => {
								setShowLibrary(true);
								setShowMenu(false);
							}}
							className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-4 py-3 rounded-lg shadow-lg shadow-orange-500/50 transition-all"
						>
							<BookOpen className="w-5 h-5" />
							<span>Whiteboard Library</span>
						</button>
					</div>
				)}

				<button
					onClick={() => setShowMenu(!showMenu)}
					className={`flex items-center justify-center w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white rounded-full shadow-2xl shadow-orange-500/50 transition-all ${
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
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
					<div className="bg-[#0a0a0a] backdrop-blur-xl border border-white/[0.06] rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
						<div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
							<div className="flex items-center space-x-3">
								<BookOpen className="w-6 h-6 text-orange-400" />
								<h3 className="text-2xl font-bold text-white/80">
									Whiteboard Library
								</h3>
							</div>
							<button
								onClick={() => setShowLibrary(false)}
								className="text-orange-300 hover:text-white/90 text-2xl transition-all"
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

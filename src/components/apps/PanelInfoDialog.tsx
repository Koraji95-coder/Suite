import { Info, X } from "lucide-react";
import { useState } from "react";

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

	// Unified glass/orange style for all color schemes
	const colors = {
		button:
			"bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/40 text-white/90",
		panel: "border-white/[0.06]",
		header: "bg-white/[0.04] border-white/[0.06] text-white/90",
		section: "border-white/[0.06]",
		tip: "bg-orange-500/10 border-orange-500/30 text-white/80",
		icon: "text-orange-400",
		text: "text-white/60",
	};

	return (
		<>
			<button
				onClick={() => setIsOpen(true)}
				className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition-all ${colors.button}`}
			>
				<Info className="w-4 h-4" />
				<span>Panel Info</span>
			</button>

			{isOpen && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
					<div
						className={`bg-[#0a0a0a] backdrop-blur-xl border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col ${colors.panel}`}
					>
						<div
							className={`flex items-center justify-between p-6 border-b ${colors.header}`}
						>
							<div className="flex items-center space-x-3">
								<Info className={`w-6 h-6 ${colors.icon}`} />
								<h3 className="text-2xl font-bold">{title}</h3>
							</div>
							<button
								onClick={() => setIsOpen(false)}
								className="p-2 hover:bg-white/10 rounded-lg transition-all"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						<div className="flex-1 overflow-y-auto p-6 space-y-6">
							{sections.map((section, index) => (
								<div
									key={index}
									className={`bg-white/[0.03] backdrop-blur-xl border rounded-lg p-6 ${colors.section}`}
								>
									<h4 className={`text-xl font-bold mb-4 ${colors.text}`}>
										{section.title}
									</h4>

									{Array.isArray(section.content) ? (
										<ul className={`space-y-2 ${colors.text}`}>
											{section.content.map((item, i) => (
												<li key={i} className="flex items-start space-x-2">
													<span className={colors.icon}>•</span>
													<span>{item}</span>
												</li>
											))}
										</ul>
									) : (
										<p className={colors.text}>{section.content}</p>
									)}

									{section.tips && section.tips.length > 0 && (
										<div className={`mt-4 border rounded-lg p-4 ${colors.tip}`}>
											<p className="font-semibold mb-2">💡 Tips:</p>
											<ul className="space-y-1 ml-4">
												{section.tips.map((tip, i) => (
													<li key={i} className="text-sm">
														{tip}
													</li>
												))}
											</ul>
										</div>
									)}
								</div>
							))}
						</div>

						<div className="p-4 border-t border-white/10">
							<button
								onClick={() => setIsOpen(false)}
								className={`w-full px-6 py-3 border rounded-lg font-semibold transition-all ${colors.button}`}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

import { Info, X } from "lucide-react";
import { useState } from "react";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";

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
	const { palette } = useTheme();
	const buttonStyle = {
		...glassCardInnerStyle(palette, palette.primary),
		color: hexToRgba(palette.text, 0.85),
	};
	const panelStyle = {
		border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
		background: `linear-gradient(145deg, ${hexToRgba(
			palette.surface,
			0.97,
		)} 0%, ${hexToRgba(palette.surfaceLight, 0.93)} 100%)`,
	};
	const headerStyle = {
		borderBottom: `1px solid ${hexToRgba(palette.primary, 0.16)}`,
		background: hexToRgba(palette.surface, 0.7),
		color: hexToRgba(palette.text, 0.9),
	};
	const sectionStyle = {
		...glassCardInnerStyle(palette, palette.secondary),
	};
	const textStyle = {
		color: hexToRgba(palette.text, 0.6),
		fontSize: 13,
		lineHeight: 1.55,
	};
	const tipStyle = {
		...glassCardInnerStyle(palette, palette.tertiary),
		color: hexToRgba(palette.text, 0.8),
	};

	return (
		<>
			<button
				onClick={() => setIsOpen(true)}
				className="flex items-center space-x-2 px-4 py-2 rounded-lg transition-all"
				style={buttonStyle}
			>
				<Info className="w-4 h-4" style={{ color: palette.primary }} />
				<span>Panel Info</span>
			</button>

			{isOpen && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4">
					<div
						className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg backdrop-blur-xl flex flex-col"
						style={panelStyle}
					>
						<div
							className="flex items-center justify-between p-6"
							style={headerStyle}
						>
							<div className="flex items-center space-x-3">
								<Info className="w-6 h-6" style={{ color: palette.primary }} />
								<h3 className="text-2xl font-bold">{title}</h3>
							</div>
							<button
								onClick={() => setIsOpen(false)}
								className="p-2 rounded-lg transition-all"
								style={{
									background: hexToRgba(palette.surface, 0.35),
									color: hexToRgba(palette.text, 0.8),
								}}
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						<div className="flex-1 overflow-y-auto p-6 space-y-6">
							{sections.map((section, index) => (
								<div
									key={index}
									className="backdrop-blur-xl border rounded-lg p-6"
									style={sectionStyle}
								>
									<h4
										className="text-xl font-bold mb-4"
										style={{ color: hexToRgba(palette.text, 0.85) }}
									>
										{section.title}
									</h4>

									{Array.isArray(section.content) ? (
										<ul className="space-y-2" style={textStyle}>
											{section.content.map((item, i) => (
												<li key={i} className="flex items-start space-x-2">
													<span style={{ color: palette.primary }}>•</span>
													<span>{item}</span>
												</li>
											))}
										</ul>
									) : (
										<p style={textStyle}>{section.content}</p>
									)}

									{section.tips && section.tips.length > 0 && (
										<div className="mt-4 border rounded-lg p-4" style={tipStyle}>
											<p
												className="font-semibold mb-2"
												style={{ color: hexToRgba(palette.text, 0.85) }}
											>
												Tips
											</p>
											<ul className="space-y-1 ml-4">
												{section.tips.map((tip, i) => (
													<li
														key={i}
														className="text-sm"
														style={{ color: hexToRgba(palette.text, 0.65) }}
													>
														{tip}
													</li>
												))}
											</ul>
										</div>
									)}
								</div>
							))}
						</div>

						<div
							className="p-4 border-t"
							style={{ borderColor: hexToRgba(palette.primary, 0.12) }}
						>
							<button
								onClick={() => setIsOpen(false)}
								className="w-full px-6 py-3 rounded-lg font-semibold transition-all"
								style={buttonStyle}
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

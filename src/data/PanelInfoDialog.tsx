import { Info, X } from "lucide-react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";

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
			<button
				onClick={() => setIsOpen(true)}
				className="flex items-center space-x-2 rounded-lg border px-4 py-2 transition-all border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] [background:color-mix(in_srgb,var(--primary)_8%,var(--surface))] text-[color-mix(in_srgb,var(--text)_85%,transparent)]"
			>
				<Info className="h-4 w-4 [color:var(--primary)]" />
				<span>Panel Info</span>
			</button>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent
					className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden border-0 bg-transparent p-0"
					style={{
						border:
							"1px solid color-mix(in srgb, var(--primary) 18%, transparent)",
						background:
							"linear-gradient(145deg, color-mix(in srgb, var(--surface) 97%, transparent) 0%, color-mix(in srgb, var(--surface-2) 93%, transparent) 100%)",
					}}
				>
					<DialogHeader className="flex-row items-center justify-between space-y-0 border-b p-6 border-[color-mix(in_srgb,var(--primary)_16%,transparent)] [background:color-mix(in_srgb,var(--surface)_70%,transparent)]">
						<div className="flex items-center space-x-3">
							<Info className="h-6 w-6 [color:var(--primary)]" />
							<DialogTitle className="text-2xl font-bold text-[color-mix(in_srgb,var(--text)_90%,transparent)]">
								{title}
							</DialogTitle>
						</div>
						<button
							onClick={() => setIsOpen(false)}
							className="rounded-lg p-2 transition-all [background:color-mix(in_srgb,var(--surface)_35%,transparent)] text-[color-mix(in_srgb,var(--text)_80%,transparent)]"
						>
							<X className="h-5 w-5" />
						</button>
					</DialogHeader>

					<div className="flex-1 space-y-6 overflow-y-auto p-6">
						{sections.map((section, index) => (
							<div
								key={index}
								className="rounded-lg border p-6 backdrop-blur-xl border-[color-mix(in_srgb,var(--secondary)_18%,var(--border))] [background:color-mix(in_srgb,var(--secondary)_8%,var(--surface))]"
							>
								<h4 className="mb-4 text-xl font-bold text-[color-mix(in_srgb,var(--text)_85%,transparent)]">
									{section.title}
								</h4>

								{Array.isArray(section.content) ? (
									<ul className="space-y-2 text-[13px] leading-relaxed text-[color-mix(in_srgb,var(--text)_60%,transparent)]">
										{section.content.map((item, i) => (
											<li key={i} className="flex items-start space-x-2">
												<span className="[color:var(--primary)]">•</span>
												<span>{item}</span>
											</li>
										))}
									</ul>
								) : (
									<p className="text-[13px] leading-relaxed text-[color-mix(in_srgb,var(--text)_60%,transparent)]">
										{section.content}
									</p>
								)}

								{section.tips && section.tips.length > 0 && (
									<div className="mt-4 rounded-lg border p-4 border-[color-mix(in_srgb,var(--tertiary)_18%,var(--border))] [background:color-mix(in_srgb,var(--tertiary)_8%,var(--surface))]">
										<p className="mb-2 font-semibold text-[color-mix(in_srgb,var(--text)_85%,transparent)]">
											Tips
										</p>
										<ul className="ml-4 space-y-1">
											{section.tips.map((tip, i) => (
												<li
													key={i}
													className="text-sm text-[color-mix(in_srgb,var(--text)_65%,transparent)]"
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

					<div className="border-t p-4 border-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
						<button
							onClick={() => setIsOpen(false)}
							className="w-full rounded-lg border px-6 py-3 font-semibold transition-all border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] [background:color-mix(in_srgb,var(--primary)_8%,var(--surface))] text-[color-mix(in_srgb,var(--text)_85%,transparent)]"
						>
							Close
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

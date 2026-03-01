import { Info, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { PanelInfoDefinition } from "@/data/panelInfoRegistry";

type PanelInfoModalProps = {
	open: boolean;
	onClose: () => void;
	info: PanelInfoDefinition | null;
};

export function PanelInfoModal({ open, onClose, info }: PanelInfoModalProps) {
	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = previousOverflow;
		};
	}, [onClose, open]);

	if (!open || !info) return null;

	return createPortal(
		<div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/62 p-4 backdrop-blur-sm">
			<button
				type="button"
				aria-label="Close panel info overlay"
				onClick={onClose}
				className="absolute inset-0 h-full w-full cursor-default border-0 bg-transparent p-0"
			/>
			<div
				role="dialog"
				aria-modal="true"
				className="suite-modal-shell-max relative z-[1401] flex w-full max-w-[1280px] flex-col overflow-hidden rounded-3xl border [border-color:color-mix(in_srgb,var(--primary)_30%,var(--border))] [background:linear-gradient(162deg,color-mix(in_srgb,var(--surface)_95%,transparent),color-mix(in_srgb,var(--bg-mid)_98%,transparent))] shadow-[0_30px_75px_rgba(0,0,0,0.5)]"
			>
				<div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 [border-color:var(--border)] [background:color-mix(in_srgb,var(--surface)_94%,transparent)]">
					<div className="flex items-center gap-2">
						<Info size={16} className="[color:var(--primary)]" />
						<h3 className="text-base font-semibold tracking-tight [color:var(--text)]">
							{info.title}
						</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex items-center justify-center rounded-lg border px-2 py-1 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [color:var(--text-muted)]"
						aria-label="Close panel info"
					>
						<X size={14} />
					</button>
				</div>

				<div className="grid gap-3 overflow-y-auto px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
					{info.sections.map((section, index) => (
						<section
							key={`${section.title}-${index}`}
							className="rounded-2xl border p-3 [border-color:var(--border)] [background:linear-gradient(150deg,color-mix(in_srgb,var(--surface)_92%,transparent),color-mix(in_srgb,var(--surface-2)_88%,transparent))]"
						>
							<div className="text-sm font-semibold tracking-tight [color:var(--text)]">
								{section.title}
							</div>
							{Array.isArray(section.content) ? (
								<ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm [color:var(--text-muted)]">
									{section.content.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							) : (
								<p className="mt-2 text-sm leading-relaxed [color:var(--text-muted)]">
									{section.content}
								</p>
							)}
							{section.tips?.length ? (
								<div className="mt-3 rounded-xl border p-2 text-xs leading-relaxed [border-color:color-mix(in_srgb,var(--accent)_30%,var(--border))] [background:color-mix(in_srgb,var(--accent)_8%,transparent)] [color:var(--text-muted)]">
									{section.tips.join(" ")}
								</div>
							) : null}
						</section>
					))}
				</div>
			</div>
		</div>,
		document.body,
	);
}

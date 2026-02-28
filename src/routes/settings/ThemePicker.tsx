// src/routes/app/settings/ThemePicker.tsx
import { Check } from "lucide-react";
import { useMemo } from "react";

import { COLOR_SCHEMES, useTheme } from "../../lib/palette";

const THEME_KEYS = [
	"graphiteCyan",
	"slateCoral",
	"oceanDepths",
	"twilightNebula",
	"desertDusk",
	"steelMint",
	"indigoFog",
	"forestSignal",
	"copperSlate",
] as const;

type ThemeKey = (typeof THEME_KEYS)[number];

type ThemeItem = {
	key: ThemeKey;
	name: string;
	description: string;
	swatches: {
		label: "Primary" | "Secondary" | "Accent" | "Text";
		value: string;
	}[];
};

export default function ThemePicker() {
	const { schemeKey, setScheme } = useTheme();

	const active = (
		THEME_KEYS.some((theme) => theme === schemeKey) ? schemeKey : "graphiteCyan"
	) as ThemeKey;

	const items = useMemo<ThemeItem[]>(
		() =>
			THEME_KEYS.map((key) => {
				const scheme = COLOR_SCHEMES[key];
				return {
					key,
					name: scheme.name,
					description: scheme.description,
					swatches: [
						{ label: "Primary", value: scheme.primary },
						{ label: "Secondary", value: scheme.secondary },
						{ label: "Accent", value: scheme.accent },
						{ label: "Text", value: scheme.text },
					],
				};
			}),
		[],
	);

	return (
		<div className="grid gap-3">
			<h3 className="text-lg font-semibold tracking-tight text-text">
				Theme
				<span className="ml-2 text-sm font-normal text-text-muted">
					Controls app theme state and CSS variables.
				</span>
			</h3>

			<div className="grid gap-3 md:grid-cols-2">
				{items.map((t) => {
					const isActive = t.key === active;

					return (
						<button
							key={t.key}
							type="button"
							className={[
								"grid gap-3 rounded-2xl border p-4 text-left transition",
								isActive
									? "border-primary bg-surface"
									: "border-border bg-surface hover:bg-surface-2",
							].join(" ")}
							onClick={() => setScheme(t.key)}
						>
							<div className="grid gap-1">
								<div className="flex items-center justify-between gap-2 text-sm font-semibold text-text">
									{t.name}
									{isActive ? (
										<span className="inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-[11px] text-primary">
											<Check size={12} />
											Active
										</span>
									) : null}
								</div>
								<div className="text-xs text-text-muted">{t.description}</div>
							</div>

							<div className="flex gap-2" aria-hidden="true">
								{t.swatches.map((s) => (
									<span
										key={`${t.key}-${s.label}`}
										className="h-5 w-5 rounded-md border border-border"
										style={{ background: s.value }}
										title={s.label}
									/>
								))}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
// src/routes/app/settings/ThemePicker.tsx
import { Check } from "lucide-react";
import { useMemo } from "react";

import { useTheme } from "../../lib/palette";

type ThemeKey = "blockflow" | "ember" | "noir" | "aurora";

const THEMES: Array<{
	key: ThemeKey;
	name: string;
	description: string;
	swatches: string[];
}> = [
	{
		key: "blockflow",
		name: "Blockflow V5",
		description: "Default glass + gold accent.",
		swatches: ["#e8c97e", "#ffffff", "#7ee8f8", "#f87e9e"],
	},
	{
		key: "ember",
		name: "Ember",
		description: "Warm amber focus, darker surfaces.",
		swatches: ["#f8c67e", "#eab308", "#ffffff", "#fb7185"],
	},
	{
		key: "noir",
		name: "Noir",
		description: "Neutral, minimal, high-contrast.",
		swatches: ["#ffffff", "#94a3b8", "#0b1220", "#e2e8f0"],
	},
	{
		key: "aurora",
		name: "Aurora",
		description: "Cool neon accents, soft borders.",
		swatches: ["#7ee8f8", "#2dd4bf", "#fb7185", "#f8c67e"],
	},
];

export default function ThemePicker() {
	const { schemeKey, setScheme } = useTheme();
	const active = (
		THEMES.some((theme) => theme.key === schemeKey) ? schemeKey : "blockflow"
	) as ThemeKey;

	const items = useMemo(() => THEMES, []);

	return (
		<div className="settings-panel">
			<h3 className="settings-h3">
				Theme
				<span className="settings-h3-sub">
					Controls app theme state and BlockFlow CSS variables.
				</span>
			</h3>

			<div className="theme-grid">
				{items.map((t) => {
					const isActive = t.key === active;
					return (
						<button
							key={t.key}
							type="button"
							className={`theme-card glass ${isActive ? "active" : ""}`}
							onClick={() => setScheme(t.key)}
						>
							<div className="theme-card-top">
								<div className="theme-name">
									{t.name}
									{isActive ? (
										<span className="theme-active">
											<Check size={12} />
											Active
										</span>
									) : null}
								</div>
								<div className="theme-desc">{t.description}</div>
							</div>

							<div className="theme-swatches" aria-hidden="true">
								{t.swatches.map((c) => (
									<span
										key={c}
										className="theme-swatch"
										style={{ background: c }}
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

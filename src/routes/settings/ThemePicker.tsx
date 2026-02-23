// src/routes/app/settings/ThemePicker.tsx
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ThemeKey = "v5" | "ember" | "noir" | "aurora";

const STORAGE_KEY = "blockflow-theme";

const THEMES: Array<{
	key: ThemeKey;
	name: string;
	description: string;
	swatches: string[];
}> = [
	{
		key: "v5",
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

function getInitialTheme(): ThemeKey {
	const stored = localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
	return stored && THEMES.some((t) => t.key === stored) ? stored : "v5";
}

function applyTheme(key: ThemeKey) {
	document.documentElement.dataset.theme = key;
	localStorage.setItem(STORAGE_KEY, key);
}

export default function ThemePicker() {
	const [active, setActive] = useState<ThemeKey>(() => getInitialTheme());

	useEffect(() => {
		applyTheme(active);
	}, [active]);

	const items = useMemo(() => THEMES, []);

	return (
		<div className="settings-panel">
			<h3 className="settings-h3">
				Theme
				<span className="settings-h3-sub">Switches CSS variables only (safe, non-conflicting).</span>
			</h3>

			<div className="theme-grid">
				{items.map((t) => {
					const isActive = t.key === active;
					return (
						<button
							key={t.key}
							type="button"
							className={`theme-card glass ${isActive ? "active" : ""}`}
							onClick={() => setActive(t.key)}
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
									<span key={c} className="theme-swatch" style={{ background: c }} />
								))}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
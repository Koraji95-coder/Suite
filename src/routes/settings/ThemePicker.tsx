// src/routes/app/settings/ThemePicker.tsx
import { Check, Palette, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import { COLOR_SCHEMES, useTheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import styles from "./ThemePicker.module.css";

// New theme keys matching palette.ts
const THEME_KEYS = [
	"midnight",
	"graphite",
	"slate",
	"ember",
	"copper",
	"forest",
	"ocean",
	"violet",
	"rose",
] as const;

type ThemeKey = (typeof THEME_KEYS)[number];

type ThemeItem = {
	key: ThemeKey;
	name: string;
	description: string;
	swatches: { label: string; value: string }[];
};

export default function ThemePicker() {
	const { schemeKey, setScheme } = useTheme();

	const active = (
		THEME_KEYS.some((theme) => theme === schemeKey) ? schemeKey : "midnight"
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
		<Panel variant="default" padding="lg">
			<Stack gap={6}>
				{/* Header */}
				<HStack gap={3} align="start" className={styles.header}>
					<div className={styles.headerIcon}>
						<Palette size={20} />
					</div>
					<Stack gap={1}>
						<Text size="lg" weight="semibold">
							Theme
						</Text>
						<Text size="sm" color="muted">
							Choose a color scheme for your workspace. Changes apply instantly.
						</Text>
					</Stack>
				</HStack>

				{/* Current theme indicator */}
				<Panel variant="inset" padding="md">
					<HStack gap={3} align="center">
						<Sparkles size={16} className={styles.activeRowIcon} />
						<Text size="sm" color="muted">
							Currently using{" "}
							<Text weight="semibold" color="default">
								{COLOR_SCHEMES[active].name}
							</Text>
						</Text>
					</HStack>
				</Panel>

				{/* Theme grid */}
				<div className={styles.grid}>
					{items.map((t) => {
						const isActive = t.key === active;

						return (
							<button
								key={t.key}
								type="button"
								onClick={() => setScheme(t.key)}
								className={cn(
									styles.themeButton,
									isActive
										? styles.themeButtonActive
										: styles.themeButtonInactive,
								)}
							>
								{/* Active checkmark */}
								{isActive && (
									<div className={styles.activeCheck}>
										<Check size={12} strokeWidth={3} />
									</div>
								)}

								<Stack gap={3}>
									{/* Theme info */}
									<Stack gap={1}>
										<HStack gap={2} align="center">
											<Text size="sm" weight="semibold">
												{t.name}
											</Text>
											{isActive && (
												<Badge color="primary" variant="soft" size="sm">
													Active
												</Badge>
											)}
										</HStack>
										<Text
											size="xs"
											color="muted"
											className={styles.themeDescription}
										>
											{t.description}
										</Text>
									</Stack>

									{/* Color swatches */}
									<HStack gap={2} className={styles.swatchRow}>
										{t.swatches.map((s) => (
											<div
												key={`${t.key}-${s.label}`}
												className={styles.swatch}
												style={{ background: s.value }}
												title={`${s.label}: ${s.value}`}
											>
												{/* Subtle shine */}
												<div className={styles.swatchShine} />
											</div>
										))}
									</HStack>
								</Stack>
							</button>
						);
					})}
				</div>

				{/* Footer hint */}
				<Text size="xs" color="muted" align="center">
					Themes are saved automatically and persist across sessions.
				</Text>
			</Stack>
		</Panel>
	);
}

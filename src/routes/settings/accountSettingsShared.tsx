import type { ElementType } from "react";
import { Badge } from "@/components/primitives/Badge";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import styles from "./AccountSettings.module.css";

export type StatusTone =
	| "success"
	| "danger"
	| "warning"
	| "muted"
	| "primary"
	| "accent";

export function SectionHeader({
	icon: Icon,
	title,
	description,
	tone = "primary",
}: {
	icon: ElementType;
	title: string;
	description: string;
	tone?: "primary" | "accent" | "neutral";
}) {
	const toneClasses = {
		primary: styles.sectionIconPrimary,
		accent: styles.sectionIconAccent,
		neutral: styles.sectionIconNeutral,
	};

	return (
		<HStack gap={3} align="start">
			<div className={cn(styles.sectionIconBase, toneClasses[tone])}>
				<Icon size={18} />
			</div>
			<Stack gap={0}>
				<Text size="sm" weight="semibold">
					{title}
				</Text>
				<Text size="xs" color="muted">
					{description}
				</Text>
			</Stack>
		</HStack>
	);
}

export function StatusTile({
	title,
	value,
	tone,
	icon: Icon,
}: {
	title: string;
	value: string;
	tone: StatusTone;
	icon: ElementType;
}) {
	const toneConfig = {
		success: {
			tile: styles.statusToneSuccess,
			glow: styles.statusDotSuccess,
			icon: styles.statusIconSuccess,
			dot: styles.statusDotSuccess,
		},
		danger: {
			tile: styles.statusToneDanger,
			glow: styles.statusDotDanger,
			icon: styles.statusIconDanger,
			dot: styles.statusDotDanger,
		},
		warning: {
			tile: styles.statusToneWarning,
			glow: styles.statusDotWarning,
			icon: styles.statusIconWarning,
			dot: styles.statusDotWarning,
		},
		primary: {
			tile: styles.statusTonePrimary,
			glow: styles.statusDotPrimary,
			icon: styles.statusIconPrimary,
			dot: styles.statusDotPrimary,
		},
		accent: {
			tile: styles.statusToneAccent,
			glow: styles.statusDotAccent,
			icon: styles.statusIconAccent,
			dot: styles.statusDotAccent,
		},
		muted: {
			tile: styles.statusToneMuted,
			glow: styles.statusDotMuted,
			icon: styles.statusIconMuted,
			dot: styles.statusDotMuted,
		},
	};

	const config = toneConfig[tone];

	return (
		<div className={cn(styles.statusTile, config.tile)}>
			{tone !== "muted" && <div className={cn(styles.statusGlow, config.glow)} />}

			<HStack justify="between" align="start" className={styles.statusHeader}>
				<HStack gap={2} align="center">
					<div className={cn(styles.statusIconWrap, config.icon)}>
						<Icon size={12} className={styles.statusIconGlyph} />
					</div>
					<Text
						size="xs"
						color="muted"
						weight="medium"
						className={styles.statusLabel}
					>
						{title}
					</Text>
				</HStack>

				<span className={styles.statusDotWrap}>
					{tone === "success" && (
						<span className={cn(styles.statusDotPulse, config.dot)} />
					)}
					<span className={cn(styles.statusDot, config.dot)} />
				</span>
			</HStack>

			<div className={styles.statusValue}>
				<Badge
					color={tone === "muted" ? "default" : tone}
					variant="soft"
					size="sm"
				>
					{value}
				</Badge>
			</div>
		</div>
	);
}

// src/components/agent/AgentProfileSwitcher.tsx

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/primitives/Badge";
import { HStack, Stack } from "@/components/primitives/Stack";

// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import { AgentPixelMark } from "./AgentPixelMark";
import styles from "./AgentProfileSwitcher.module.css";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
	type AgentProfileId,
} from "./agentProfiles";

interface AgentProfileSwitcherProps {
	activeProfileId: AgentProfileId;
	onSelect: (id: AgentProfileId) => void;
	/** Show as dropdown (default) or inline tabs */
	variant?: "dropdown" | "tabs";
}

export function AgentProfileSwitcher({
	activeProfileId,
	onSelect,
	variant = "dropdown",
}: AgentProfileSwitcherProps) {
	if (variant === "tabs") {
		return (
			<TabsSwitcher activeProfileId={activeProfileId} onSelect={onSelect} />
		);
	}

	return (
		<DropdownSwitcher activeProfileId={activeProfileId} onSelect={onSelect} />
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// DROPDOWN VARIANT
// ═══════════════════════════════════════════════════════════════════════════
function DropdownSwitcher({
	activeProfileId,
	onSelect,
}: {
	activeProfileId: AgentProfileId;
	onSelect: (id: AgentProfileId) => void;
}) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const activeProfile = AGENT_PROFILES[activeProfileId];

	// Close on outside click
	useEffect(() => {
		if (!open) return;

		const handleClick = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};

		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [open]);

	const handleSelect = (id: AgentProfileId) => {
		onSelect(id);
		setOpen(false);
	};

	return (
		<div ref={containerRef} className={styles.dropdownRoot}>
			{/* Trigger button */}
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className={cn(
					styles.triggerButton,
					open ? styles.triggerButtonOpen : styles.triggerButtonClosed,
				)}
			>
				<AgentPixelMark
					profileId={activeProfileId}
					size={24}
					expression="active"
				/>
				<Text size="sm" weight="semibold">
					{activeProfile.name}
				</Text>
				<ChevronDown
					size={14}
					className={cn(
						styles.triggerChevron,
						open && styles.triggerChevronOpen,
					)}
				/>
			</button>

			{/* Dropdown menu */}
			{open && (
				<div className={styles.menu}>
					{/* Header */}
					<div className={styles.menuHeader}>
						<Text
							size="xs"
							color="muted"
							weight="semibold"
							className={styles.menuHeaderLabel}
						>
							Switch Agent
						</Text>
					</div>

					{/* Agent list */}
					<div className={styles.menuList}>
						{AGENT_PROFILE_IDS.map((id) => {
							const profile = AGENT_PROFILES[id];
							const isActive = id === activeProfileId;

							return (
								<button
									key={id}
									type="button"
									onClick={() => handleSelect(id)}
									className={cn(
										styles.optionButton,
										isActive
											? styles.optionButtonActive
											: styles.optionButtonInactive,
									)}
								>
									{/* Avatar */}
									<div className={styles.optionAvatar}>
										<AgentPixelMark
											profileId={id}
											size={32}
											expression={isActive ? "active" : "neutral"}
										/>
										{isActive && (
											<div className={styles.activeCheckBubble}>
												<Check size={8} className={styles.activeCheckIcon} />
											</div>
										)}
									</div>

									{/* Info */}
									<Stack gap={0} className={styles.optionContent}>
										<HStack gap={2} align="center">
											<Text
												size="sm"
												weight="semibold"
												color={isActive ? "default" : "muted"}
											>
												{profile.name}
											</Text>
											{isActive && (
												<Badge color="primary" variant="soft" size="sm">
													Active
												</Badge>
											)}
										</HStack>
										<Text size="xs" color="muted" truncate>
											{profile.tagline}
										</Text>
									</Stack>
								</button>
							);
						})}
					</div>

					{/* Footer hint */}
					<div className={styles.menuFooter}>
						<Text size="xs" color="muted">
							Each agent has specialized capabilities
						</Text>
					</div>
				</div>
			)}
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// TABS VARIANT (for wider layouts)
// ═══════════════════════════════════════════════════════════════════════════
function TabsSwitcher({
	activeProfileId,
	onSelect,
}: {
	activeProfileId: AgentProfileId;
	onSelect: (id: AgentProfileId) => void;
}) {
	return (
		<div className={styles.tabsRoot}>
			{AGENT_PROFILE_IDS.map((id) => {
				const profile = AGENT_PROFILES[id];
				const isActive = id === activeProfileId;

				return (
					<button
						key={id}
						type="button"
						onClick={() => onSelect(id)}
						className={cn(
							styles.tabButton,
							isActive ? styles.tabButtonActive : styles.tabButtonInactive,
						)}
						title={profile.tagline}
					>
						<AgentPixelMark
							profileId={id}
							size={20}
							expression={isActive ? "active" : "neutral"}
						/>
						<span className={styles.tabName}>{profile.name}</span>

						{/* Active indicator dot */}
						{isActive && <span className={styles.tabActiveDot} />}
					</button>
				);
			})}
		</div>
	);
}

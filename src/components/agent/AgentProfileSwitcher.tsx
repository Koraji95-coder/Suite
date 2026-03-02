import { hexToRgba, useTheme } from "@/lib/palette";
import { AgentPixelMark } from "./AgentPixelMark";
import {
	AGENT_PROFILES,
	AGENT_PROFILE_IDS,
	type AgentProfileId,
} from "./agentProfiles";

interface AgentProfileSwitcherProps {
	activeProfileId: AgentProfileId;
	onSelect: (id: AgentProfileId) => void;
}

export function AgentProfileSwitcher({
	activeProfileId,
	onSelect,
}: AgentProfileSwitcherProps) {
	const { palette } = useTheme();

	return (
		<div className="flex items-center gap-1">
			{AGENT_PROFILE_IDS.map((id) => {
				const profile = AGENT_PROFILES[id];
				const isActive = id === activeProfileId;
				return (
					<button
						key={id}
						type="button"
						onClick={() => onSelect(id)}
						className="relative flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all"
						style={{
							background: isActive
								? hexToRgba(palette.primary, 0.1)
								: "transparent",
							color: isActive ? palette.text : hexToRgba(palette.text, 0.5),
							border: isActive
								? `1px solid ${hexToRgba(palette.primary, 0.2)}`
								: "1px solid transparent",
						}}
						onMouseEnter={(e) => {
							if (!isActive)
								e.currentTarget.style.background = hexToRgba(palette.text, 0.04);
						}}
						onMouseLeave={(e) => {
							if (!isActive) e.currentTarget.style.background = "transparent";
						}}
						title={profile.tagline}
					>
						<AgentPixelMark
							profileId={id}
							size={20}
							expression={isActive ? "active" : "neutral"}
						/>
						<span className="hidden sm:inline">{profile.name}</span>
					</button>
				);
			})}
		</div>
	);
}

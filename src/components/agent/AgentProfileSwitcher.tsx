// src/components/agent/AgentProfileSwitcher.tsx
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { AgentPixelMark } from "./AgentPixelMark";
import {
  AGENT_PROFILES,
  AGENT_PROFILE_IDS,
  type AgentProfileId,
} from "./agentProfiles";

// Primitives
import { Text } from "@/components/primitives/Text";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Badge } from "@/components/primitives/Badge";

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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-2 rounded-xl px-3 py-1.5
          border transition-all duration-150
          ${open 
            ? "border-primary bg-primary/10" 
            : "border-transparent hover:bg-surface-2"
          }
        `}
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
          className={`text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} 
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div 
          className="
            absolute top-full left-0 mt-2 z-50
            w-72 rounded-xl border border-border bg-surface
            shadow-lg shadow-black/20
            overflow-hidden
            animate-in fade-in slide-in-from-top-2 duration-150
          "
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border bg-surface-2/50">
            <Text size="xs" color="muted" weight="semibold" className="uppercase tracking-wider">
              Switch Agent
            </Text>
          </div>

          {/* Agent list */}
          <div className="p-2">
            {AGENT_PROFILE_IDS.map((id) => {
              const profile = AGENT_PROFILES[id];
              const isActive = id === activeProfileId;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className={`
                    w-full flex items-center gap-3 rounded-lg px-3 py-2.5
                    text-left transition-all duration-150
                    ${isActive 
                      ? "bg-primary/10 border border-primary/20" 
                      : "hover:bg-surface-2 border border-transparent"
                    }
                  `}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <AgentPixelMark
                      profileId={id}
                      size={32}
                      expression={isActive ? "active" : "neutral"}
                    />
                    {isActive && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary flex items-center justify-center">
                        <Check size={8} className="text-primary-contrast" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <Stack gap={0} className="flex-1 min-w-0">
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
          <div className="px-4 py-2 border-t border-border bg-surface-2/30">
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
    <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-2/50 border border-border">
      {AGENT_PROFILE_IDS.map((id) => {
        const profile = AGENT_PROFILES[id];
        const isActive = id === activeProfileId;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`
              relative flex items-center gap-2 rounded-lg px-3 py-2
              text-xs font-medium transition-all duration-200
              ${isActive 
                ? "bg-surface text-text shadow-sm" 
                : "text-text-muted hover:text-text hover:bg-surface/50"
              }
            `}
            title={profile.tagline}
          >
            <AgentPixelMark
              profileId={id}
              size={20}
              expression={isActive ? "active" : "neutral"}
            />
            <span className="hidden sm:inline">{profile.name}</span>
            
            {/* Active indicator dot */}
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
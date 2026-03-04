// src/components/agent/AgentChatPanel.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { 
  WifiOff, 
  Zap, 
  ChevronLeft, 
  ChevronRight,
  Settings2,
  Maximize2,
  Loader2
} from "lucide-react";
import {
  agentTaskManager,
  type AgentConversation,
} from "@/services/agentTaskManager";
import { agentService } from "@/services/agentService";
import { AgentChatSidebar } from "./AgentChatSidebar";
import { AgentChatMessages } from "./AgentChatMessages";
import { AgentChatComposer } from "./AgentChatComposer";
import { AgentPixelMark } from "./AgentPixelMark";
import { AgentProfileSwitcher } from "./AgentProfileSwitcher";
import {
  AGENT_PROFILES,
  DEFAULT_AGENT_PROFILE,
  type AgentProfileId,
} from "./agentProfiles";
import { getAgentTaskTemplates } from "./agentTaskTemplates";

// Primitives
import { Text } from "@/components/primitives/Text";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Button, IconButton } from "@/components/primitives/Button";

interface AgentChatPanelProps {
  healthy: boolean;
  paired: boolean;
}

export function AgentChatPanel({ healthy, paired }: AgentChatPanelProps) {
  const [profileId, setProfileId] = useState<AgentProfileId>(() => {
    try {
      const stored = localStorage.getItem("agent-active-profile");
      if (stored && stored in AGENT_PROFILES) return stored as AgentProfileId;
    } catch {
      /* noop */
    }
    return DEFAULT_AGENT_PROFILE;
  });

  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    agentTaskManager.setProfileScope(profileId);
    const convs = agentTaskManager.getConversations();
    setConversations(convs);
    setActiveConvId(convs[0]?.id ?? null);
    try {
      localStorage.setItem("agent-active-profile", profileId);
    } catch {
      /* noop */
    }
  }, [profileId]);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId],
  );

  const profile = AGENT_PROFILES[profileId];
  const templates = getAgentTaskTemplates(profileId);

  const refreshConversations = useCallback(() => {
    const convs = agentTaskManager.getConversations();
    setConversations(convs);
  }, []);

  const handleNewConversation = useCallback(() => {
    const conv = agentTaskManager.createConversation(profileId);
    agentTaskManager.saveConversation(conv);
    refreshConversations();
    setActiveConvId(conv.id);
  }, [profileId, refreshConversations]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      agentTaskManager.deleteConversation(id);
      refreshConversations();
      setActiveConvId((prev) => {
        if (prev === id) {
          const remaining = agentTaskManager.getConversations();
          return remaining[0]?.id ?? null;
        }
        return prev;
      });
    },
    [refreshConversations],
  );

  const handleSend = useCallback(
    async (message: string) => {
      if (!healthy || !paired) return;

      let convId = activeConvId;
      if (!convId) {
        const conv = agentTaskManager.createConversation(profileId);
        agentTaskManager.saveConversation(conv);
        convId = conv.id;
        setActiveConvId(convId);
      }

      agentTaskManager.addMessageToConversation(convId, "user", message);
      refreshConversations();

      setIsThinking(true);
      try {
        const response = await agentService.sendMessage(message);
        const reply = response.success
          ? typeof response.data === "object"
            ? JSON.stringify(response.data, null, 2)
            : String(response.data ?? "Task completed.")
          : response.error || "Request failed.";

        agentTaskManager.addMessageToConversation(convId, "assistant", reply);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Unknown error occurred.";
        agentTaskManager.addMessageToConversation(
          convId,
          "assistant",
          errMsg,
        );
      } finally {
        setIsThinking(false);
        refreshConversations();
      }
    },
    [healthy, paired, activeConvId, profileId, refreshConversations],
  );

  const isReady = healthy && paired;

  return (
    <Panel 
      variant="default" 
      padding="none" 
      className="flex h-full overflow-hidden relative"
    >
      {/* ═══════════════════════════════════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div 
        className={`
          hidden md:flex flex-col shrink-0 border-r border-border bg-bg
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? "w-0 opacity-0 overflow-hidden" : "w-64"}
        `}
      >
        <AgentChatSidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={setActiveConvId}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* Sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="
          hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10
          h-6 w-3 items-center justify-center
          bg-surface-2 border border-border border-l-0
          rounded-r-md text-text-muted hover:text-text
          transition-all hover:w-4
        "
        style={{ left: sidebarCollapsed ? 0 : 256 }}
      >
        {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CHAT AREA
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface/50 backdrop-blur-sm">
          <HStack gap={3} align="center">
            {/* Agent avatar with status ring */}
            <div className="relative">
              <div className={`
                absolute -inset-1 rounded-full opacity-50
                ${isThinking ? "bg-primary/20 animate-pulse" : ""}
              `} />
              <AgentPixelMark 
                profileId={profileId} 
                size={40} 
                expression={isThinking ? "active" : "neutral"}
                pulse={isThinking}
              />
              {/* Status dot */}
              <div className={`
                absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full 
                border-2 border-surface
                ${isReady ? "bg-success" : "bg-warning animate-pulse"}
              `} />
            </div>
            
            <Stack gap={0}>
              <HStack gap={2} align="center">
                <AgentProfileSwitcher
                  activeProfileId={profileId}
                  onSelect={setProfileId}
                />
                {isThinking && (
                  <Badge color="primary" variant="soft" size="sm">
                    <Loader2 size={10} className="animate-spin" />
                    Working...
                  </Badge>
                )}
              </HStack>
              <Text size="xs" color="muted">
                {profile.tagline}
              </Text>
            </Stack>
          </HStack>

          {/* Right side actions */}
          <HStack gap={2}>
            {/* Status badges */}
            <div className="hidden sm:flex items-center gap-2">
              <Badge 
                color={healthy ? "success" : "danger"} 
                variant="soft" 
                size="sm"
                dot
                pulse={!healthy}
              >
                {healthy ? "Online" : "Offline"}
              </Badge>
              
              <Badge 
                color={paired ? "primary" : "warning"} 
                variant="soft" 
                size="sm"
                dot
              >
                {paired ? "Connected" : "Unpaired"}
              </Badge>
            </div>

            {/* Action buttons */}
            <IconButton
              icon={<Maximize2 size={16} />}
              aria-label="Expand chat"
              variant="ghost"
              size="sm"
            />
            <IconButton
              icon={<Settings2 size={16} />}
              aria-label="Agent settings"
              variant="ghost"
              size="sm"
            />
          </HStack>
        </div>

        {/* Messages or empty state */}
        {activeConv && activeConv.messages.length > 0 ? (
          <AgentChatMessages
            messages={activeConv.messages}
            profileId={profileId}
            isThinking={isThinking}
          />
        ) : (
          <EmptyState
            profile={profile}
            profileId={profileId}
            templates={templates}
            isReady={isReady}
            onTemplateClick={(prompt) => {
              if (isReady) handleSend(prompt);
            }}
          />
        )}

        {/* Composer */}
        <AgentChatComposer
          onSend={handleSend}
          disabled={!isReady || isThinking}
          templates={activeConv?.messages.length ? [] : []}
        />
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY STATE (Creative Design)
// ═══════════════════════════════════════════════════════════════════════════
function EmptyState({
  profile,
  profileId,
  templates,
  isReady,
  onTemplateClick,
}: {
  profile: { name: string; tagline: string };
  profileId: AgentProfileId;
  templates: Array<{ label: string; prompt: string }>;
  isReady: boolean;
  onTemplateClick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Radial gradient */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 opacity-30"
          style={{
            background: `radial-gradient(circle, var(--primary) 0%, transparent 70%)`,
            filter: 'blur(80px)',
          }}
        />
        
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `
              linear-gradient(var(--text) 1px, transparent 1px),
              linear-gradient(90deg, var(--text) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Agent avatar with effects */}
        <div className="relative mb-8">
          {/* Outer glow ring */}
          <div 
            className="absolute -inset-4 rounded-3xl opacity-20 blur-xl"
            style={{ background: `var(--primary)` }}
          />
          
          {/* Inner container */}
          <div className="relative">
            {/* Rotating border when not ready */}
            {!isReady && (
              <div 
                className="absolute -inset-1 rounded-2xl opacity-50 animate-spin"
                style={{
                  background: `linear-gradient(135deg, var(--primary), var(--accent), var(--primary))`,
                  animationDuration: '3s',
                }}
              />
            )}
            
            {/* Avatar box */}
            <div className="relative rounded-2xl border border-border bg-surface p-6">
              <AgentPixelMark 
                profileId={profileId} 
                size={96} 
                expression={isReady ? "focus" : "neutral"}
                breathe={isReady}
              />
            </div>
          </div>
        </div>

        {/* Agent name with gradient */}
        <h2 
          className="text-3xl font-bold bg-linear-to-r from-text via-primary to-text bg-clip-text text-transparent"
          style={{ backgroundSize: '200% 100%' }}
        >
          {profile.name}
        </h2>
        
        <Text size="md" color="muted" align="center" className="mt-2 max-w-sm" block>
          {profile.tagline}
        </Text>

        {/* Status indicator */}
        {!isReady ? (
          <HStack gap={2} align="center" className="mt-6 rounded-full bg-warning/10 border border-warning/20 px-4 py-2">
            <WifiOff size={14} className="text-warning" />
            <Text size="sm" color="warning">
              Waiting for connection...
            </Text>
          </HStack>
        ) : (
          <HStack gap={2} align="center" className="mt-6 rounded-full bg-success/10 border border-success/20 px-4 py-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <Text size="sm" color="success">
              Ready to assist
            </Text>
          </HStack>
        )}

        {/* Quick action templates */}
        {templates.length > 0 && isReady && (
          <div className="mt-10 w-full max-w-lg">
            <Text size="xs" color="muted" weight="semibold" align="center" className="mb-4 uppercase tracking-wider" block>
              Get started with
            </Text>
            
            <div className="grid grid-cols-2 gap-3">
              {templates.slice(0, 4).map((t) => (
                <Button
                  key={t.label}
                  variant="outline"
                  onClick={() => onTemplateClick(t.prompt)}
                  iconLeft={<Zap size={14} />}
                  className="justify-start text-left h-auto py-3"
                >
                  <Text size="sm" weight="medium" truncate>
                    {t.label}
                  </Text>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
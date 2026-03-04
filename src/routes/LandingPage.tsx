// src/routes/LandingPage.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  FolderOpen,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";

import { APP_NAME, APP_TAGLINE } from "../appMeta";
import { AgentPixelMark } from "../components/agent/AgentPixelMark";
import { AGENT_PROFILES } from "../components/agent/agentProfiles";
import { COLOR_SCHEMES, useTheme } from "../lib/palette";
import { Button } from "../components/primitives/Button";
import { Text } from "../components/primitives/Text";
import { Panel } from "../components/primitives/Panel";
import { Stack, HStack } from "../components/primitives/Stack";
import { Badge } from "../components/primitives/Badge";

// ═══════════════════════════════════════════════════════════════════════════
// THEME KEYS — must match keys in COLOR_SCHEMES
// ═══════════════════════════════════════════════════════════════════════════
const VISIBLE_THEMES = [
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

// ═══════════════════════════════════════════════════════════════════════════
// FEATURES
// ═══════════════════════════════════════════════════════════════════════════
const FEATURES = [
  {
    icon: FolderOpen,
    title: "Project Manager",
    description:
      "Track projects, tasks, deliverables, and document control in a unified workspace.",
    to: "/app/projects",
  },
  {
    icon: Bot,
    title: "Koro Agent",
    description:
      "AI-powered task orchestration. Plan, generate, and review with contextual agents.",
    to: "/app/agent",
  },
  {
    icon: CalendarDays,
    title: "Calendar & Planning",
    description:
      "Drag-and-drop scheduling with urgency tracking and deadline visibility.",
    to: "/app/calendar",
  },
  {
    icon: Layers,
    title: "Engineering Apps",
    description:
      "Ground grid generator, drawing list manager, transmittal builder, and more.",
    to: "/app/apps",
  },
  {
    icon: Zap,
    title: "Math & Knowledge",
    description:
      "Three-phase calculators, formula banks, circuit generators, and IEEE/NEC references.",
    to: "/app/knowledge",
  },
  {
    icon: Sparkles,
    title: "Multi-Agent System",
    description:
      "Four specialized agents — Koro, Devstral, Sentinel, Forge — each built for distinct tasks.",
    to: "/app/agent",
  },
] as const;

const AGENT_IDS = ["koro", "devstral", "sentinel", "forge"] as const;

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL ANIMATION HOOK
// ═══════════════════════════════════════════════════════════════════════════
function useScrollAnimation(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  const { schemeKey, setScheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Scroll animations for sections
  const featuresAnim = useScrollAnimation(0.1);
  const agentsAnim = useScrollAnimation(0.1);

  // Mount animation
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Sticky nav scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* ═══════════════════════════════════════════════════════════════════
          STICKY NAVIGATION
      ═══════════════════════════════════════════════════════════════════ */}
      <nav
        className={`
          sticky top-0 z-50 transition-all duration-300
          ${scrolled 
            ? "bg-bg/80 backdrop-blur-xl border-b border-border shadow-lg shadow-black/5" 
            : "bg-transparent border-b border-transparent"
          }
        `}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 text-sm font-semibold text-text no-underline group"
          >
            <div className={`transition-transform duration-300 ${scrolled ? "scale-90" : "scale-100"}`}>
              <AgentPixelMark profileId="koro" size={scrolled ? 24 : 28} expression="neutral" />
            </div>
            <span className="tracking-tight">{APP_NAME}</span>
          </Link>

          <HStack gap={2} align="center">
            <Link
              to="/roadmap"
              className="hidden md:inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-text-muted transition-all hover:bg-surface-2 hover:text-text"
            >
              Roadmap
            </Link>
            <Link
              to="/privacy"
              className="hidden md:inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-text-muted transition-all hover:bg-surface-2 hover:text-text"
            >
              Privacy
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="primary" size="sm">
                Get started
              </Button>
            </Link>
          </HStack>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════════════════════ */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        
        {/* ─────────────────────────────────────────────────────────────────
            HERO SECTION
        ───────────────────────────────────────────────────────────────── */}
        <section
          className={`
            relative overflow-hidden rounded-2xl border border-border mt-4
            transition-all duration-700 ease-out
            ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}
          `}
        >
          {/* Background gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 90% 70% at 50% 30%, color-mix(in oklab, var(--primary) 10%, transparent), transparent),
                radial-gradient(ellipse 60% 60% at 80% 70%, color-mix(in oklab, var(--accent) 6%, transparent), transparent),
                var(--surface)
              `,
            }}
          />
          
          {/* Dot pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "radial-gradient(circle, var(--text-muted) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div className="relative grid items-center gap-8 px-6 py-16 md:grid-cols-12 md:px-12 md:py-20">
            {/* Left content */}
            <div 
              className={`
                md:col-span-7 transition-all duration-700 delay-200 ease-out
                ${mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}
              `}
            >
              <Badge color="default" variant="outline" className="mb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Engineering workspace
              </Badge>

              <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
                Projects, planning, and execution in{" "}
                <span className="text-primary">one layout.</span>
              </h1>

              <Text color="muted" size="md" className="mt-5 max-w-lg leading-relaxed">
                {APP_TAGLINE}. Manage projects, coordinate timelines, generate
                documents, and run AI-powered agents — all from a single
                themeable workspace.
              </Text>

              <HStack gap={3} wrap className="mt-8">
                <Badge color="success" variant="outline" dot pulse>
                  Passwordless sign-in
                </Badge>
                <Badge color="primary" variant="outline" dot>
                  Email link verification
                </Badge>
              </HStack>
            </div>

            {/* Right content - Agent showcase */}
            <div 
              className={`
                hidden md:col-span-5 md:flex md:flex-col md:items-center md:justify-center
                transition-all duration-700 delay-400 ease-out
                ${mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}
              `}
            >
              <div className="relative">
                {/* Main agent with glow */}
                <div className="relative">
                  <div 
                    className="absolute inset-0 rounded-full blur-2xl opacity-30 animate-pulse"
                    style={{ background: "var(--primary)" }}
                  />
                  <div className="relative animate-float">
                    <AgentPixelMark
                      profileId="koro"
                      size={120}
                      expression="active"
                    />
                  </div>
                </div>
                
                {/* Secondary agents */}
                <HStack gap={3} className="mt-6" justify="center">
                  {AGENT_IDS.filter((id) => id !== "koro").map((id, i) => (
                    <div
                      key={id}
                      className={`
                        rounded-full border border-border bg-surface/60 p-2 
                        transition-all duration-300 hover:scale-110 hover:border-primary hover:bg-surface
                        animate-fade-in
                      `}
                      style={{ animationDelay: `${600 + i * 100}ms` }}
                    >
                      <AgentPixelMark profileId={id} size={28} />
                    </div>
                  ))}
                </HStack>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            FEATURES GRID
        ───────────────────────────────────────────────────────────────── */}
        <section
          ref={featuresAnim.ref}
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f, i) => (
            <Link
              key={f.title}
              to={f.to}
              className={`
                group relative rounded-2xl border border-border bg-surface p-5 no-underline 
                transition-all duration-300 
                hover:border-primary hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5
                ${featuresAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
              `}
              style={{ 
                transitionDelay: featuresAnim.isVisible ? `${i * 80}ms` : "0ms" 
              }}
            >
              <div className="mb-3 inline-flex rounded-lg bg-surface-2 p-2 transition-colors group-hover:bg-primary/10">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <Text as="h3" size="sm" weight="semibold" block>
                {f.title}
              </Text>
              <Text size="xs" color="muted" className="mt-1.5 leading-relaxed" block>
                {f.description}
              </Text>
              <ArrowRight className="absolute right-4 top-5 h-3.5 w-3.5 text-text-muted opacity-0 transition-all group-hover:opacity-60 group-hover:translate-x-1" />
            </Link>
          ))}
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            AGENTS + THEME PICKER ROW
        ───────────────────────────────────────────────────────────────── */}
        <section
          ref={agentsAnim.ref}
          className="mt-6 grid gap-6 md:grid-cols-12"
        >
          {/* Agents panel */}
          <Panel 
            variant="default" 
            padding="lg" 
            className={`
              md:col-span-8 transition-all duration-500
              ${agentsAnim.isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}
            `}
          >
            <Badge color="accent" variant="soft" className="mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Multi-agent system
            </Badge>

            <Text as="h2" size="xl" weight="semibold" block>
              Four agents, built for distinct tasks
            </Text>
            <Text color="muted" size="sm" className="mt-2 max-w-lg leading-relaxed" block>
              Each agent has its own memory namespace, personality, and
              specialization. Switch between them or let Koro orchestrate.
            </Text>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {AGENT_IDS.map((id, i) => {
                const profile = AGENT_PROFILES[id];
                return (
                  <div
                    key={id}
                    className={`
                      flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3
                      transition-all duration-300 hover:border-primary hover:bg-surface
                      ${agentsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
                    `}
                    style={{ 
                      transitionDelay: agentsAnim.isVisible ? `${200 + i * 100}ms` : "0ms" 
                    }}
                  >
                    <div className="transition-transform hover:scale-110">
                      <AgentPixelMark
                        profileId={id}
                        size={32}
                        expression="neutral"
                      />
                    </div>
                    <div>
                      <Text size="sm" weight="semibold" block>
                        {profile.name}
                      </Text>
                      <Text size="xs" color="muted" className="mt-0.5" block>
                        {profile.tagline}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Theme picker */}
          <Panel 
            variant="default" 
            padding="md" 
            className={`
              md:col-span-4 transition-all duration-500 delay-200
              ${agentsAnim.isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}
            `}
          >
            <Text size="sm" weight="semibold" block>
              Theme
            </Text>
            <Text size="xs" color="muted" className="mt-1" block>
              Pick a visual mode. All colors update instantly.
            </Text>

            <Stack gap={2} className="mt-4">
              {VISIBLE_THEMES.map((key) => {
                const scheme = COLOR_SCHEMES[key];
                if (!scheme) return null;
                
                const isActive = schemeKey === key;
                
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScheme(key)}
                    className={`
                      flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm 
                      transition-all duration-200
                      ${isActive 
                        ? "border-primary bg-surface-2 scale-[1.02]" 
                        : "border-border bg-transparent hover:bg-surface hover:border-border-strong"
                      }
                    `}
                  >
                    <span
                      className={`
                        h-3 w-3 shrink-0 rounded-full transition-transform
                        ${isActive ? "scale-125" : ""}
                      `}
                      style={{ background: scheme.primary }}
                    />
                    <Text
                      size="sm"
                      weight="medium"
                      color={isActive ? "default" : "muted"}
                    >
                      {scheme.name}
                    </Text>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                  </button>
                );
              })}
            </Stack>
          </Panel>
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            FOOTER
        ───────────────────────────────────────────────────────────────── */}
        <footer
          className={`
            mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border px-1 pt-6
            transition-opacity duration-500 delay-500
            ${mounted ? "opacity-100" : "opacity-0"}
          `}
        >
          <HStack gap={2} align="center">
            <AgentPixelMark profileId="koro" size={16} />
            <Text size="xs" color="muted">
              {APP_NAME}
            </Text>
          </HStack>

          <HStack gap={4}>
            <Link
              to="/privacy"
              className="text-xs text-text-muted underline-offset-2 transition hover:text-text hover:underline"
            >
              Privacy
            </Link>
            <Link
              to="/roadmap"
              className="text-xs text-text-muted underline-offset-2 transition hover:text-text hover:underline"
            >
              Roadmap
            </Link>
          </HStack>
        </footer>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════
          ANIMATION KEYFRAMES
      ═══════════════════════════════════════════════════════════════════ */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
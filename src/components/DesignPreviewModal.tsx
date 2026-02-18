import { useState, useCallback, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, Grid3X3, Sparkles, Check,
  User, Settings, Bell, Search, Home, Layers, BarChart3, Folder,
  Menu, Command, Zap, Layout, Palette, PanelLeft, Monitor, Star,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface DesignMockup {
  id: number;
  name: string;
  description: string;
  render: () => React.ReactNode;
}

interface DesignPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Palette constants (mirrors HYPHAE_PALETTE)                         */
/* ------------------------------------------------------------------ */
const P = {
  bg: '#080808',
  deep: '#0A0A0A',
  ink: '#050505',
  primary: '#F97316',
  secondary: '#F59E0B',
  tertiary: '#E11D48',
  text: '#F5F0E8',
} as const;

/* ------------------------------------------------------------------ */
/*  Small reusable atoms for mockups                                   */
/* ------------------------------------------------------------------ */
function Avatar({ size = 32, ring = P.primary }: { size?: number; ring?: string }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${P.primary}, ${P.tertiary})`, border: `2px solid ${ring}` }}
    >
      <User className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

function FakeCard({ title, accent = P.primary, children }: { title: string; accent?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3 border" style={{ background: 'rgba(0,0,0,0.35)', borderColor: `${accent}33` }}>
      <p className="text-xs font-semibold mb-1" style={{ color: accent }}>{title}</p>
      {children ?? <div className="h-6 rounded" style={{ background: `${accent}15` }} />}
    </div>
  );
}

function MiniNav({ items, accent = P.primary, vertical = false }: { items: string[]; accent?: string; vertical?: boolean }) {
  return (
    <div className={`flex ${vertical ? 'flex-col gap-1' : 'gap-2'}`}>
      {items.map((t, i) => (
        <div
          key={t}
          className={`text-[10px] px-2 py-1 rounded ${i === 0 ? 'font-bold' : 'opacity-60'}`}
          style={{ color: i === 0 ? '#fff' : P.text, background: i === 0 ? `${accent}33` : 'transparent' }}
        >{t}</div>
      ))}
    </div>
  );
}

function Greeting({ variant = 'welcome' }: { variant?: 'welcome' | 'myuser' }) {
  return (
    <p className="text-sm font-bold" style={{ color: P.text }}>
      {variant === 'welcome' ? 'Welcome, Dustin' : 'My user: Dustin'}
    </p>
  );
}

function UserProfile({ accent = P.primary }: { accent?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Bell className="w-3.5 h-3.5 opacity-50" style={{ color: P.text }} />
      <Settings className="w-3.5 h-3.5 opacity-50" style={{ color: P.text }} />
      <Avatar size={24} ring={accent} />
      <span className="text-[10px] font-semibold" style={{ color: P.text }}>Dustin</span>
    </div>
  );
}

/* Transition label badge */
function TransitionBadge({ label }: { label: string }) {
  return (
    <span className="absolute top-1 right-1 text-[8px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60 backdrop-blur">
      {label}
    </span>
  );
}

/* Mockup frame wrapper */
function MockFrame({ bg, children }: { bg?: string; children: React.ReactNode }) {
  return (
    <div
      className="relative w-full h-full rounded-lg overflow-hidden select-none"
      style={{ background: bg ?? P.bg, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  20 Design Mockups                                                  */
/* ------------------------------------------------------------------ */
function buildMockups(): DesignMockup[] {
  return [
    /* -------- 1. Cyberpunk Neon -------- */
    {
      id: 1,
      name: 'Cyberpunk Neon',
      description: 'Vivid neon accents with a top nav bar. Bold cyan/magenta highlights, sharp borders.',
      render: () => (
        <MockFrame bg="linear-gradient(180deg, #05050F 0%, #0A0A1A 100%)">
          <TransitionBadge label="fade" />
          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: `${P.primary}44` }}>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" style={{ color: P.primary }} />
              <span className="text-xs font-black tracking-wider" style={{ color: P.primary }}>√3 SUITE</span>
            </div>
            <MiniNav items={['Dashboard', 'Projects', 'Calcs', 'Standards']} accent={P.primary} />
            <UserProfile accent={P.primary} />
          </div>
          {/* Body */}
          <div className="p-3">
            <Greeting variant="welcome" />
            <div className="grid grid-cols-3 gap-2 mt-2">
              <FakeCard title="Active Projects" accent={P.primary}><p className="text-lg font-black" style={{ color: P.primary }}>7</p></FakeCard>
              <FakeCard title="Overdue Tasks" accent={P.tertiary}><p className="text-lg font-black" style={{ color: P.tertiary }}>3</p></FakeCard>
              <FakeCard title="Storage" accent={P.secondary}><p className="text-lg font-black" style={{ color: P.secondary }}>1.4 GB</p></FakeCard>
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 2. Minimal Dark -------- */
    {
      id: 2,
      name: 'Minimal Dark',
      description: 'Clean minimalism. Muted borders, generous whitespace, understated palette.',
      render: () => (
        <MockFrame bg="#09090b">
          <TransitionBadge label="slide-up" />
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Greeting variant="myuser" />
              <UserProfile accent="#666" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {['Projects', 'Formulas', 'Files', 'Calendar'].map((t, i) => (
                <div key={t} className="rounded-xl p-3 border border-white/5 bg-white/[0.02]">
                  <p className="text-[10px] text-white/40 mb-1">{t}</p>
                  <div className="h-5 rounded bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 3. Gradient Flow -------- */
    {
      id: 3,
      name: 'Gradient Flow',
      description: 'Smooth gradient header flowing into content. Purple-to-cyan hero bar.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="scale" />
          <div className="h-16 flex items-end px-3 pb-2" style={{ background: `linear-gradient(135deg, ${P.tertiary}88, ${P.primary}88)` }}>
            <div className="flex items-center justify-between w-full">
              <div>
                <p className="text-[10px] text-white/60">Good evening</p>
                <p className="text-sm font-bold text-white">Welcome, Dustin</p>
              </div>
              <Avatar size={28} ring="#fff" />
            </div>
          </div>
          <div className="p-3 -mt-3">
            <div className="rounded-xl p-3 border border-white/10 bg-black/60 backdrop-blur">
              <div className="grid grid-cols-3 gap-2">
                <FakeCard title="Active" accent={P.primary} />
                <FakeCard title="Tasks" accent={P.tertiary} />
                <FakeCard title="Files" accent={P.secondary} />
              </div>
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 4. Sidebar Commander -------- */
    {
      id: 4,
      name: 'Sidebar Commander',
      description: 'Persistent left sidebar with icon navigation. Content area stretches right.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="slide-right" />
          <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-12 border-r flex flex-col items-center py-2 gap-2 shrink-0" style={{ borderColor: `${P.primary}22`, background: 'rgba(0,0,0,0.4)' }}>
              {[Home, Layers, BarChart3, Folder, Settings].map((Icon, i) => (
                <div key={i} className={`p-1.5 rounded-lg ${i === 0 ? 'bg-orange-500/20' : ''}`}>
                  <Icon className="w-3.5 h-3.5" style={{ color: i === 0 ? P.primary : `${P.text}66` }} />
                </div>
              ))}
              <div className="mt-auto"><Avatar size={22} /></div>
            </div>
            {/* Content */}
            <div className="flex-1 p-3">
              <Greeting />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <FakeCard title="Projects" accent={P.primary} />
                <FakeCard title="Activity" accent={P.tertiary} />
                <FakeCard title="Calendar" accent="#4ade80" />
                <FakeCard title="Storage" accent={P.secondary} />
              </div>
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 5. Floating Action -------- */
    {
      id: 5,
      name: 'Floating Action',
      description: 'Floating action buttons & quick-access toolbar at the bottom.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="blur" />
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <Greeting />
              <UserProfile />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FakeCard title="Active" accent={P.primary} />
              <FakeCard title="Overdue" accent="#ef4444" />
            </div>
          </div>
          {/* Floating toolbar */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/70 backdrop-blur-lg">
            {[Home, BarChart3, Folder, Search, Star].map((Icon, i) => (
              <Icon key={i} className="w-3.5 h-3.5" style={{ color: i === 0 ? P.primary : `${P.text}55` }} />
            ))}
          </div>
        </MockFrame>
      ),
    },

    /* -------- 6. Tabbed Panels -------- */
    {
      id: 6,
      name: 'Tabbed Panels',
      description: 'Horizontal tab strip for panel switching. Active tab glows.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="fade-slide" />
          <div className="flex items-center justify-between px-3 pt-2">
            <Greeting />
            <UserProfile accent={P.tertiary} />
          </div>
          <div className="flex gap-1 px-3 mt-2">
            {['Overview', 'Projects', 'Calcs', 'Files'].map((t, i) => (
              <div
                key={t}
                className="text-[10px] px-2 py-1 rounded-t-lg"
                style={{
                  color: i === 0 ? '#fff' : `${P.text}66`,
                  background: i === 0 ? `${P.primary}22` : 'transparent',
                  borderBottom: i === 0 ? `2px solid ${P.primary}` : '2px solid transparent',
                }}
              >{t}</div>
            ))}
          </div>
          <div className="border-t border-white/5 p-3">
            <div className="grid grid-cols-3 gap-2">
              <FakeCard title="Projects" accent={P.primary} />
              <FakeCard title="Tasks" accent={P.tertiary} />
              <FakeCard title="Notes" accent={P.secondary} />
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 7. Glassmorphism -------- */
    {
      id: 7,
      name: 'Glassmorphism',
      description: 'Frosted glass cards with blur. Translucent panels over a gradient BG.',
      render: () => (
        <MockFrame bg={`linear-gradient(160deg, ${P.ink}, #1a0a2e 50%, #0a1628)`}>
          <TransitionBadge label="scale-blur" />
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <Greeting />
              <UserProfile accent={P.tertiary} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['Projects: 5', 'Tasks: 12', 'Files: 48', 'Alerts: 2'].map((t, i) => (
                <div key={t} className="rounded-xl p-3 backdrop-blur-md border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-[10px] text-white/70">{t.split(':')[0]}</p>
                  <p className="text-sm font-bold text-white">{t.split(':')[1]}</p>
                </div>
              ))}
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 8. Command Palette -------- */
    {
      id: 8,
      name: 'Command Palette',
      description: 'Spotlight-style command bar at the top. Quick search & jump.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="drop-in" />
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <Greeting />
              <UserProfile />
            </div>
            {/* Command bar */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] mb-3">
              <Search className="w-3.5 h-3.5 text-white/30" />
              <span className="text-[10px] text-white/30">Search or type a command…</span>
              <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono">⌘K</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <FakeCard title="Recent" accent={P.primary} />
              <FakeCard title="Pinned" accent={P.secondary} />
              <FakeCard title="Alerts" accent="#ef4444" />
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 9. Split View -------- */
    {
      id: 9,
      name: 'Split View',
      description: 'Two-column master-detail layout. Left list, right detail pane.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="slide-left" />
          <div className="flex h-full">
            <div className="w-1/3 border-r border-white/5 p-2">
              <p className="text-[9px] text-white/40 mb-2 uppercase tracking-wider">Projects</p>
              {['Substation A', 'QA Review', 'Cable Calc'].map((t, i) => (
                <div key={t} className={`text-[10px] px-2 py-1.5 rounded mb-1 ${i === 0 ? 'bg-orange-500/15 text-orange-300' : 'text-white/50'}`}>{t}</div>
              ))}
            </div>
            <div className="flex-1 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-white">Substation A</p>
                <UserProfile />
              </div>
              <FakeCard title="Progress" accent={P.primary}>
                <div className="h-1.5 rounded-full bg-white/10 mt-1"><div className="h-full rounded-full w-3/5" style={{ background: P.primary }} /></div>
              </FakeCard>
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 10. Breadcrumb Trail -------- */
    {
      id: 10,
      name: 'Breadcrumb Trail',
      description: 'Breadcrumb navigation at the top. Shows context path through the app.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="fade" />
          <div className="px-3 pt-2 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[9px]">
              {['Home', 'Projects', 'Substation A'].map((t, i, a) => (
                <span key={t} className="flex items-center gap-1">
                  <span style={{ color: i === a.length - 1 ? P.primary : `${P.text}55` }}>{t}</span>
                  {i < a.length - 1 && <ChevronRight className="w-2.5 h-2.5" style={{ color: `${P.text}33` }} />}
                </span>
              ))}
            </div>
            <UserProfile />
          </div>
          <div className="p-3">
            <Greeting />
            <div className="grid grid-cols-3 gap-2 mt-2">
              <FakeCard title="Overview" accent={P.primary} />
              <FakeCard title="Schedule" accent="#a78bfa" />
              <FakeCard title="Docs" accent={P.secondary} />
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 11. Teal Accent -------- */
    {
      id: 11,
      name: 'Teal Accent',
      description: 'Warm teal primary with dark charcoal. Softer contrast.',
      render: () => {
        const teal = '#2dd4bf';
        return (
          <MockFrame bg="#0c0f0f">
            <TransitionBadge label="slide-up" />
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: `${teal}22` }}>
              <span className="text-xs font-bold" style={{ color: teal }}>√3 Suite</span>
              <MiniNav items={['Home', 'Projects', 'Tools']} accent={teal} />
              <UserProfile accent={teal} />
            </div>
            <div className="p-3">
              <Greeting />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <FakeCard title="Active" accent={teal} />
                <FakeCard title="Pending" accent="#fbbf24" />
              </div>
            </div>
          </MockFrame>
        );
      },
    },

    /* -------- 12. Dense Data -------- */
    {
      id: 12,
      name: 'Dense Data',
      description: 'Compact info-dense layout. Small text, many panels visible at once.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="none" />
          <div className="p-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold" style={{ color: P.text }}>Welcome, Dustin</p>
              <UserProfile />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { t: 'Projects', v: '7', c: P.primary },
                { t: 'Tasks', v: '23', c: P.tertiary },
                { t: 'Files', v: '142', c: P.secondary },
                { t: 'Alerts', v: '2', c: '#ef4444' },
              ].map(({ t, v, c }) => (
                <div key={t} className="rounded p-1.5 border text-center" style={{ borderColor: `${c}33`, background: `${c}08` }}>
                  <p className="text-[8px] opacity-50" style={{ color: P.text }}>{t}</p>
                  <p className="text-xs font-black" style={{ color: c }}>{v}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <FakeCard title="Calendar" accent={P.primary} />
              <FakeCard title="Activity" accent={P.tertiary} />
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 13. Aurora Gradient -------- */
    {
      id: 13,
      name: 'Aurora Gradient',
      description: 'Northern-lights style gradient bg. Flowing green/purple/blue tones.',
      render: () => (
        <MockFrame bg="linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 30%, #1b2838 50%, #0a1628 70%, #0a0a1a 100%)">
          <TransitionBadge label="blur-scale" />
          {/* Simulated aurora band */}
          <div className="absolute inset-x-0 top-0 h-20 opacity-30" style={{ background: 'linear-gradient(90deg, transparent, #4ade8044, #a78bfa55, #00CCFF44, transparent)' }} />
          <div className="relative p-3 pt-6">
            <div className="flex items-center justify-between mb-3">
              <Greeting />
              <UserProfile accent="#a78bfa" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <FakeCard title="Projects" accent="#4ade80" />
              <FakeCard title="Tasks" accent="#a78bfa" />
              <FakeCard title="Calc" accent={P.primary} />
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 14. Collapsible Sections -------- */
    {
      id: 14,
      name: 'Collapsible Sections',
      description: 'Accordion-style sections that expand/collapse. Grouped content.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="slide-down" />
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <Greeting />
              <UserProfile />
            </div>
            {[
              { label: 'Projects', open: true, accent: P.primary },
              { label: 'Recent Activity', open: false, accent: P.tertiary },
              { label: 'Quick Links', open: false, accent: P.secondary },
            ].map((s) => (
              <div key={s.label} className="mb-1.5">
                <div className="flex items-center gap-1 px-2 py-1.5 rounded border" style={{ borderColor: `${s.accent}33`, background: `${s.accent}08` }}>
                  <ChevronRight className="w-3 h-3" style={{ color: s.accent, transform: s.open ? 'rotate(90deg)' : '' }} />
                  <span className="text-[10px] font-semibold" style={{ color: s.accent }}>{s.label}</span>
                </div>
                {s.open && (
                  <div className="ml-4 mt-1 pl-2 border-l" style={{ borderColor: `${s.accent}22` }}>
                    <div className="text-[9px] text-white/40 py-0.5">Substation A — 3 days left</div>
                    <div className="text-[9px] text-white/40 py-0.5">Cable Calc — 8 tasks</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </MockFrame>
      ),
    },

    /* -------- 15. Mono Terminal -------- */
    {
      id: 15,
      name: 'Mono Terminal',
      description: 'Terminal / code-editor aesthetic. Monospace font, green-on-black.',
      render: () => {
        const green = '#4ade80';
        return (
          <MockFrame bg="#020202">
            <TransitionBadge label="typewriter" />
            <div className="p-3 font-mono">
              <p className="text-[9px] mb-2" style={{ color: `${green}88` }}>root3suite v2.1.0</p>
              <p className="text-[10px] mb-1" style={{ color: green }}>$ whoami</p>
              <p className="text-[10px] mb-2 text-white/60">  Dustin — Electrical Engineer</p>
              <p className="text-[10px] mb-1" style={{ color: green }}>$ status --projects</p>
              <p className="text-[10px] text-white/50">  Active: 5  |  Overdue: 1  |  Storage: 1.4 GB</p>
              <p className="text-[10px] mt-2" style={{ color: green }}>$ _<span className="animate-pulse">▊</span></p>
            </div>
          </MockFrame>
        );
      },
    },

    /* -------- 16. Card Grid Masonry -------- */
    {
      id: 16,
      name: 'Card Grid Masonry',
      description: 'Pinterest-style staggered card grid. Different sized tiles.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="stagger-in" />
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <Greeting />
              <UserProfile />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-2">
                <FakeCard title="Projects" accent={P.primary}>
                  <div className="h-10 rounded bg-orange-500/10" />
                </FakeCard>
                <FakeCard title="Calendar" accent="#a78bfa" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <FakeCard title="Tasks" accent={P.tertiary} />
                <FakeCard title="Storage" accent={P.secondary}>
                  <div className="h-12 rounded bg-orange-500/10" />
                </FakeCard>
              </div>
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 17. Warm Ember -------- */
    {
      id: 17,
      name: 'Warm Ember',
      description: 'Warm orange/amber accent on deep charcoal. Inviting dark theme.',
      render: () => {
        const ember = '#f59e0b';
        return (
          <MockFrame bg="#0f0c08">
            <TransitionBadge label="fade-up" />
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: `${ember}22` }}>
              <span className="text-xs font-bold" style={{ color: ember }}>√3 Suite</span>
              <UserProfile accent={ember} />
            </div>
            <div className="p-3">
              <p className="text-sm font-bold mb-2" style={{ color: '#fde68a' }}>Welcome, Dustin</p>
              <div className="grid grid-cols-2 gap-2">
                <FakeCard title="Projects" accent={ember} />
                <FakeCard title="Deadlines" accent="#ef4444" />
                <FakeCard title="Notes" accent="#fbbf24" />
                <FakeCard title="Team" accent="#fb923c" />
              </div>
            </div>
          </MockFrame>
        );
      },
    },

    /* -------- 18. Dual-tone Header -------- */
    {
      id: 18,
      name: 'Dual-tone Header',
      description: 'Split header — brand on left, user on right. Different accent zones.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="morph" />
          <div className="flex h-12">
            <div className="flex-1 flex items-center px-3" style={{ background: `${P.primary}15` }}>
              <Zap className="w-3.5 h-3.5 mr-1.5" style={{ color: P.primary }} />
              <span className="text-[10px] font-bold" style={{ color: P.primary }}>√3 Suite</span>
            </div>
            <div className="flex-1 flex items-center justify-end px-3" style={{ background: `${P.tertiary}15` }}>
              <UserProfile accent={P.tertiary} />
            </div>
          </div>
          <div className="p-3">
            <Greeting />
            <div className="grid grid-cols-3 gap-2 mt-2">
              <FakeCard title="Projects" accent={P.primary} />
              <FakeCard title="Activity" accent={P.tertiary} />
              <FakeCard title="Files" accent={P.secondary} />
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 19. Radial Dashboard -------- */
    {
      id: 19,
      name: 'Radial Dashboard',
      description: 'Center-focused layout with radial glow. Metrics orbit the center.',
      render: () => (
        <MockFrame>
          <TransitionBadge label="zoom-in" />
          {/* Radial glow */}
          <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 50% 50%, ${P.primary}55, transparent 60%)` }} />
          <div className="relative p-3 flex flex-col items-center">
            <Avatar size={32} />
            <p className="text-[10px] font-bold mt-1" style={{ color: P.text }}>Welcome, Dustin</p>
            <div className="grid grid-cols-3 gap-2 mt-3 w-full">
              <FakeCard title="Projects" accent={P.primary}><p className="text-center text-xs font-bold" style={{ color: P.primary }}>5</p></FakeCard>
              <FakeCard title="Tasks" accent={P.tertiary}><p className="text-center text-xs font-bold" style={{ color: P.tertiary }}>12</p></FakeCard>
              <FakeCard title="Files" accent={P.secondary}><p className="text-center text-xs font-bold" style={{ color: P.secondary }}>48</p></FakeCard>
            </div>
          </div>
        </MockFrame>
      ),
    },

    /* -------- 20. Holographic -------- */
    {
      id: 20,
      name: 'Holographic',
      description: 'Iridescent holo-foil inspired. Rainbow-shift borders and subtle prismatic effect.',
      render: () => (
        <MockFrame bg="linear-gradient(135deg, #05050F 0%, #0b0520 50%, #05050F 100%)">
          <TransitionBadge label="prismatic-fade" />
          {/* Rainbow border bar */}
          <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${P.primary}, ${P.tertiary}, ${P.secondary}, #4ade80, ${P.primary})` }} />
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[9px] text-white/40">Good evening</p>
                <p className="text-sm font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${P.primary}, ${P.tertiary}, ${P.secondary})` }}>
                  Welcome, Dustin
                </p>
              </div>
              <UserProfile accent={P.primary} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { t: 'Projects', c: P.primary },
                { t: 'Tasks', c: P.tertiary },
                { t: 'Files', c: P.secondary },
              ].map(({ t, c }) => (
                <div key={t} className="rounded-lg p-2 border" style={{ borderImage: `linear-gradient(135deg, ${P.primary}44, ${P.tertiary}44, ${P.secondary}44) 1`, background: 'rgba(255,255,255,0.02)' }}>
                  <p className="text-[9px] text-white/40">{t}</p>
                  <div className="h-4 mt-1 rounded" style={{ background: `${c}15` }} />
                </div>
              ))}
            </div>
          </div>
        </MockFrame>
      ),
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Modal Component                                                    */
/* ------------------------------------------------------------------ */
export function DesignPreviewModal({ isOpen, onClose }: DesignPreviewModalProps) {
  const [current, setCurrent] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const mockups = buildMockups();

  const goPrev = useCallback(() => setCurrent(i => (i - 1 + mockups.length) % mockups.length), [mockups.length]);
  const goNext = useCallback(() => setCurrent(i => (i + 1) % mockups.length), [mockups.length]);

  /* Keyboard navigation */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'g') setViewMode(v => (v === 'grid' ? 'single' : 'grid'));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, goPrev, goNext]);

  if (!isOpen) return null;

  const m = mockups[current];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Outer container */}
      <div className="relative w-full max-w-5xl mx-4 max-h-[92vh] flex flex-col bg-gradient-to-br from-gray-950 to-black border border-orange-500/30 rounded-2xl overflow-hidden shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-bold text-white/90">Design Preview</h2>
            <span className="text-xs text-orange-400/60">{current + 1} / {mockups.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(v => (v === 'grid' ? 'single' : 'grid'))}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              title="Toggle grid view (G)"
            >
              <Grid3X3 className="w-4 h-4 text-white/50" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors" title="Close (Esc)">
              <X className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {viewMode === 'grid' ? (
            /* ── Grid view ── */
            <div className="grid grid-cols-4 gap-3">
              {mockups.map((mk, idx) => (
                <button
                  key={mk.id}
                  onClick={() => { setCurrent(idx); setViewMode('single'); }}
                  className={`rounded-xl overflow-hidden border transition-all hover:scale-[1.03] hover:shadow-lg ${idx === current ? 'border-orange-400 ring-2 ring-orange-400/40' : 'border-white/10'}`}
                >
                  <div className="aspect-[4/3] overflow-hidden pointer-events-none">{mk.render()}</div>
                  <div className="px-2 py-1.5 bg-black/60 text-left">
                    <p className="text-[10px] font-semibold text-white/80 truncate">{mk.name}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* ── Single view ── */
            <div className="flex flex-col items-center gap-4">
              {/* Mockup name & description */}
              <div className="text-center">
                <h3 className="text-xl font-bold text-white/90">{m.name}</h3>
                <p className="text-sm text-white/40 max-w-md">{m.description}</p>
              </div>

              {/* Live preview */}
              <div className="w-full max-w-2xl aspect-[16/10] rounded-xl overflow-hidden border border-white/10 shadow-lg">
                {m.render()}
              </div>

              {/* Apply placeholder */}
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-semibold
                           border-orange-500/40 text-white/60 hover:bg-orange-500/10 hover:border-orange-400/60"
                onClick={() => { /* future: apply style */ }}
              >
                <Check className="w-4 h-4" />
                Apply This Style
              </button>
            </div>
          )}
        </div>

        {/* ── Footer nav ── */}
        {viewMode === 'single' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0">
            <button onClick={goPrev} className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white/90 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            {/* Dot pagination */}
            <div className="flex gap-1.5 flex-wrap justify-center max-w-md">
              {mockups.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrent(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${idx === current ? 'bg-orange-400 scale-125' : 'bg-white/20 hover:bg-white/40'}`}
                  title={mockups[idx].name}
                />
              ))}
            </div>

            <button onClick={goNext} className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white/90 transition-colors">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


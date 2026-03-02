import { useEffect, useState } from "react";
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

const VISIBLE_THEMES = [
	"graphiteCyan",
	"slateCoral",
	"oceanDepths",
	"desertDusk",
	"steelMint",
	"copperSlate",
	"forestSignal",
] as const;

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
			"Four specialized agents -- Koro, Devstral, Sentinel, Forge -- each built for distinct tasks.",
		to: "/app/agent",
	},
] as const;

const AGENT_IDS = ["koro", "devstral", "sentinel", "forge"] as const;

export default function LandingPage() {
	const { schemeKey, setScheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const id = requestAnimationFrame(() => setMounted(true));
		return () => cancelAnimationFrame(id);
	}, []);

	return (
		<div className="min-h-screen [background:var(--bg)] [color:var(--text)]">
			<nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 md:px-8">
				<Link
					to="/"
					className="inline-flex items-center gap-2.5 text-sm font-semibold no-underline [color:var(--text)]"
				>
					<AgentPixelMark profileId="koro" size={28} expression="neutral" />
					<span className="tracking-tight">{APP_NAME}</span>
				</Link>

				<div className="flex items-center gap-2">
					<Link
						to="/roadmap"
						className="hidden items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition hover:[background:var(--surface-2)] [color:var(--text-muted)] md:inline-flex"
					>
						Roadmap
					</Link>
					<Link
						to="/privacy"
						className="hidden items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition hover:[background:var(--surface-2)] [color:var(--text-muted)] md:inline-flex"
					>
						Privacy
					</Link>
					<Link
						to="/login"
						className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						Sign in
					</Link>
					<Link
						to="/signup"
						className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
					>
						Get started
					</Link>
				</div>
			</nav>

			<main className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
				<section
					className="relative overflow-hidden rounded-2xl border [border-color:var(--border)]"
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(16px)",
						transition: "opacity 0.6s ease, transform 0.6s ease",
					}}
				>
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
					<div
						className="absolute inset-0 opacity-[0.03]"
						style={{
							backgroundImage:
								"radial-gradient(circle, var(--text-muted) 1px, transparent 1px)",
							backgroundSize: "24px 24px",
						}}
					/>

					<div className="relative grid items-center gap-8 px-6 py-16 md:grid-cols-12 md:px-12 md:py-20">
						<div className="md:col-span-7">
							<div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium [border-color:var(--border)] [background:color-mix(in_oklab,var(--surface)_70%,transparent)] [color:var(--text-muted)]">
								<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
								Engineering workspace
							</div>
							<h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
								Projects, planning, and execution in{" "}
								<span className="[color:var(--primary)]">one layout.</span>
							</h1>
							<p className="mt-5 max-w-lg text-base leading-relaxed [color:var(--text-muted)]">
								{APP_TAGLINE}. Manage projects, coordinate timelines, generate
								documents, and run AI-powered agents -- all from a single
								themeable workspace.
							</p>
							<div className="mt-8 flex flex-wrap items-center gap-3 text-sm [color:var(--text-muted)]">
								<span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 [border-color:var(--border)] [background:color-mix(in_oklab,var(--surface)_70%,transparent)]">
									<span className="h-1.5 w-1.5 rounded-full [background:var(--success)]" />
									Passwordless sign-in
								</span>
								<span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 [border-color:var(--border)] [background:color-mix(in_oklab,var(--surface)_70%,transparent)]">
									<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
									Email link verification
								</span>
							</div>
						</div>

						<div className="hidden md:col-span-5 md:flex md:flex-col md:items-center md:justify-center">
							<div className="relative">
								<div className="auth-float-mark">
									<AgentPixelMark
										profileId="koro"
										size={120}
										expression="active"
									/>
								</div>
								<div className="mt-6 flex items-center gap-3">
									{AGENT_IDS.filter((id) => id !== "koro").map((id) => (
										<div
											key={id}
											className="rounded-full border p-2 [border-color:var(--border)] [background:color-mix(in_oklab,var(--surface)_60%,transparent)]"
										>
											<AgentPixelMark profileId={id} size={28} />
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section
					className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(12px)",
						transition: "opacity 0.6s ease 0.15s, transform 0.6s ease 0.15s",
					}}
				>
					{FEATURES.map((f) => (
						<Link
							key={f.title}
							to={f.to}
							className="group relative rounded-2xl border p-5 no-underline transition-colors hover:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)]"
						>
							<div className="mb-3 inline-flex rounded-lg p-2 [background:var(--surface-2)]">
								<f.icon className="h-4 w-4 [color:var(--primary)]" />
							</div>
							<h3 className="text-sm font-semibold [color:var(--text)]">
								{f.title}
							</h3>
							<p className="mt-1.5 text-xs leading-relaxed [color:var(--text-muted)]">
								{f.description}
							</p>
							<ArrowRight className="absolute right-4 top-5 h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60 [color:var(--text-muted)]" />
						</Link>
					))}
				</section>

				<section
					className="mt-6 grid gap-6 md:grid-cols-12"
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(12px)",
						transition: "opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s",
					}}
				>
					<div className="rounded-2xl border p-6 [border-color:var(--border)] [background:var(--surface)] md:col-span-8">
						<div className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
							<span className="h-1.5 w-1.5 rounded-full [background:var(--accent)]" />
							Multi-agent system
						</div>
						<h2 className="text-xl font-semibold tracking-tight">
							Four agents, built for distinct tasks
						</h2>
						<p className="mt-2 max-w-lg text-sm leading-relaxed [color:var(--text-muted)]">
							Each agent has its own memory namespace, personality, and
							specialization. Switch between them or let Koro orchestrate.
						</p>

						<div className="mt-6 grid gap-3 sm:grid-cols-2">
							{AGENT_IDS.map((id) => {
								const profile = AGENT_PROFILES[id];
								return (
									<div
										key={id}
										className="flex items-start gap-3 rounded-xl border p-3 [border-color:var(--border)] [background:var(--surface-2)]"
									>
										<AgentPixelMark
											profileId={id}
											size={32}
											expression="neutral"
										/>
										<div>
											<div className="text-sm font-semibold">
												{profile.name}
											</div>
											<div className="mt-0.5 text-xs [color:var(--text-muted)]">
												{profile.tagline}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					<div className="rounded-2xl border p-5 [border-color:var(--border)] [background:var(--surface)] md:col-span-4">
						<div className="text-sm font-semibold">Theme</div>
						<p className="mt-1 text-xs [color:var(--text-muted)]">
							Pick a visual mode. All colors update instantly.
						</p>
						<div className="mt-4 grid gap-2">
							{VISIBLE_THEMES.map((key) => {
								const scheme = COLOR_SCHEMES[key];
								const active = schemeKey === key;
								return (
									<button
										key={key}
										type="button"
										onClick={() => setScheme(key)}
										className="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition"
										style={{
											borderColor: active
												? "var(--primary)"
												: "var(--border)",
											background: active
												? "var(--surface-2)"
												: "transparent",
										}}
									>
										<span
											className="h-3 w-3 shrink-0 rounded-full"
											style={{ background: scheme.primary }}
										/>
										<span
											className="font-medium"
											style={{
												color: active
													? "var(--text)"
													: "var(--text-muted)",
											}}
										>
											{scheme.name}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				</section>

				<footer
					className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t px-1 pt-6 text-xs [border-color:var(--border)] [color:var(--text-muted)]"
					style={{
						opacity: mounted ? 1 : 0,
						transition: "opacity 0.6s ease 0.45s",
					}}
				>
					<div className="inline-flex items-center gap-2">
						<AgentPixelMark profileId="koro" size={16} />
						<span>{APP_NAME}</span>
					</div>
					<div className="flex items-center gap-4">
						<Link
							to="/privacy"
							className="underline-offset-2 transition hover:underline hover:[color:var(--text)]"
						>
							Privacy
						</Link>
						<Link
							to="/roadmap"
							className="underline-offset-2 transition hover:underline hover:[color:var(--text)]"
						>
							Roadmap
						</Link>
					</div>
				</footer>
			</main>
		</div>
	);
}

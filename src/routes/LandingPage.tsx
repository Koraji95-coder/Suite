// src/routes/LandingPage.tsx
import { ArrowRight, CalendarDays, FolderOpen, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { APP_NAME } from "../app";
import { COLOR_SCHEMES, useTheme } from "../lib/palette";

const landingThemeKeys = [
	"graphiteCyan",
	"slateCoral",
	"oceanDepths",
	"twilightNebula",
	"desertDusk",
] as const;

export default function LandingPage() {
	const { schemeKey, setScheme } = useTheme();

	return (
		<div className="min-h-screen [background:var(--bg-base)] [color:var(--text)]">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
				<header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 [border-color:var(--border)] [background:var(--bg-mid)] md:p-4">
					<div className="inline-flex items-center gap-2">
						<div className="grid h-6 w-6 grid-cols-2 gap-0.5 rounded-md p-0.5 [background:var(--surface-2)]">
							<span className="rounded-sm [background:var(--primary)]" />
							<span className="rounded-sm [background:var(--accent)]" />
							<span className="rounded-sm [background:var(--text)]" />
							<span className="rounded-sm [background:var(--primary)]" />
						</div>
						<div className="text-sm font-semibold">{APP_NAME} Workspace</div>
					</div>

					<div className="flex items-center gap-2">
						<Link
							to="/login"
							className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						>
							Sign in
						</Link>
						<Link
							to="/signup"
							className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
						>
							Open workspace
						</Link>
					</div>
				</header>

				<main className="grid gap-6 md:grid-cols-12">
					<section className="rounded-2xl border p-6 [border-color:var(--border)] [background:var(--bg-mid)] md:col-span-8 md:p-8">
						<div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
							<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
							Operations workspace
						</div>
						<h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
							Run projects, planning, and task execution in one layout.
						</h1>
						<p
							className="mt-4 max-w-2xl text-sm md:text-base"
							style={{ color: "var(--text-muted)" }}
						>
							No marketing sections, no pricing funnels. This landing is now a
							direct entry point into your app and workflows.
						</p>

						<div className="mt-6 flex flex-wrap gap-2">
							<Link
								to="/signup"
								className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
							>
								Create account <ArrowRight className="ml-1 h-4 w-4" />
							</Link>
							<Link
								to="/login"
								className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
							>
								Resume session
							</Link>
						</div>
					</section>

					<section className="rounded-2xl border p-4 [border-color:var(--border)] [background:var(--bg-mid)] md:col-span-4">
						<div className="text-sm font-semibold">Theme presets</div>
						<p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
							Single token system, 5 distinct visual modes.
						</p>
						<div className="mt-3 grid gap-2">
							{landingThemeKeys.map((key) => (
								<button
									key={key}
									type="button"
									onClick={() => setScheme(key)}
									className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${schemeKey === key ? "font-semibold" : ""}`}
									style={{
										borderColor:
											schemeKey === key ? "var(--primary)" : "var(--border)",
										background: "var(--surface-2)",
										color: "var(--text)",
									}}
								>
									{COLOR_SCHEMES[key].name}
								</button>
							))}
						</div>
					</section>

					<section className="rounded-2xl border p-4 [border-color:var(--border)] [background:var(--bg-mid)] md:col-span-12">
						<div className="grid gap-3 md:grid-cols-3">
							<Link
								to="/app/projects"
								className="rounded-xl border p-4 no-underline transition hover:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface-2)]"
							>
								<div
									className="mb-2 inline-flex rounded-lg p-2"
									style={{ background: "var(--surface)" }}
								>
									<FolderOpen className="h-4 w-4" />
								</div>
								<div
									className="text-sm font-semibold"
									style={{ color: "var(--text)" }}
								>
									Projects
								</div>
								<div
									className="mt-1 text-xs"
									style={{ color: "var(--text-muted)" }}
								>
									Track project records and linked work.
								</div>
							</Link>

							<Link
								to="/app/calendar"
								className="rounded-xl border p-4 no-underline transition hover:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface-2)]"
							>
								<div
									className="mb-2 inline-flex rounded-lg p-2"
									style={{ background: "var(--surface)" }}
								>
									<CalendarDays className="h-4 w-4" />
								</div>
								<div
									className="text-sm font-semibold"
									style={{ color: "var(--text)" }}
								>
									Calendar
								</div>
								<div
									className="mt-1 text-xs"
									style={{ color: "var(--text-muted)" }}
								>
									Coordinate timelines and delivery cadence.
								</div>
							</Link>

							<Link
								to="/app/agent"
								className="rounded-xl border p-4 no-underline transition hover:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface-2)]"
							>
								<div
									className="mb-2 inline-flex rounded-lg p-2"
									style={{ background: "var(--surface)" }}
								>
									<Sparkles className="h-4 w-4" />
								</div>
								<div
									className="text-sm font-semibold"
									style={{ color: "var(--text)" }}
								>
									Koro Agent
								</div>
								<div
									className="mt-1 text-xs"
									style={{ color: "var(--text-muted)" }}
								>
									Launch guided tasks and workflows.
								</div>
							</Link>
						</div>
					</section>
				</main>
			</div>
		</div>
	);
}

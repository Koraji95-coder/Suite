import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@/appMeta";
import { AgentPixelMark } from "@/components/agent/AgentPixelMark";
import type { AgentProfileId } from "@/components/agent/agentProfiles";

type AuthShellProps = {
	children: ReactNode;
	navLink?: { to: string; label: string };
	hidePanel?: boolean;
	cardClassName?: string;
	cardStyle?: CSSProperties;
};

const FLOATING_MARKS: {
	id: AgentProfileId;
	size: number;
	top: string;
	left: string;
	delay: string;
}[] = [
	{ id: "koro", size: 72, top: "18%", left: "50%", delay: "0s" },
	{ id: "devstral", size: 36, top: "55%", left: "22%", delay: "0.6s" },
	{ id: "sentinel", size: 32, top: "38%", left: "78%", delay: "1.2s" },
	{ id: "forge", size: 28, top: "72%", left: "65%", delay: "1.8s" },
];

export default function AuthShell({
	children,
	navLink,
	hidePanel,
	cardClassName,
	cardStyle,
}: AuthShellProps) {
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
					aria-label={`${APP_NAME} home`}
				>
					<AgentPixelMark profileId="koro" size={28} expression="neutral" />
					<span className="tracking-tight">{APP_NAME}</span>
				</Link>

				{navLink ? (
					<Link
						to={navLink.to}
						className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						{navLink.label}
					</Link>
				) : null}
			</nav>

			<main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-2 md:px-8">
				<div
					className={`grid gap-6 ${hidePanel ? "" : "md:grid-cols-12"}`}
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(12px)",
						transition: "opacity 0.5s ease, transform 0.5s ease",
					}}
				>
					{!hidePanel && (
					<section className="relative hidden overflow-hidden rounded-2xl border md:col-span-5 md:flex md:flex-col md:items-center md:justify-center [border-color:var(--border)]">
						<div
							className="absolute inset-0"
							style={{
								background: `
									radial-gradient(ellipse 80% 60% at 50% 40%, color-mix(in oklab, var(--primary) 12%, transparent), transparent),
									radial-gradient(ellipse 60% 50% at 20% 80%, color-mix(in oklab, var(--accent) 8%, transparent), transparent),
									var(--surface)
								`,
							}}
						/>

						<div
							className="absolute inset-0 opacity-[0.04]"
							style={{
								backgroundImage: "radial-gradient(circle, var(--text-muted) 1px, transparent 1px)",
								backgroundSize: "20px 20px",
							}}
						/>

						<div className="relative flex h-full min-h-[420px] w-full flex-col items-center justify-center px-8 py-12">
							<div className="relative mb-10">
								{FLOATING_MARKS.map((m) => (
									<div
										key={m.id}
										className="auth-float-mark absolute"
										style={{
											top: m.top,
											left: m.left,
											transform: "translate(-50%, -50%)",
											animationDelay: m.delay,
											opacity: mounted ? 1 : 0,
											transition: `opacity 0.8s ease ${m.delay}`,
										}}
									>
										<AgentPixelMark
											profileId={m.id}
											size={m.size}
											expression={m.id === "koro" ? "active" : "neutral"}
										/>
									</div>
								))}
								<div className="h-48 w-48" aria-hidden="true" />
							</div>

							<div className="text-center">
								<h2 className="text-xl font-semibold tracking-tight">{APP_NAME}</h2>
								<p className="mt-1.5 text-sm [color:var(--text-muted)]">{APP_TAGLINE}</p>
							</div>

							<div className="mt-8 flex items-center gap-3">
								{FLOATING_MARKS.map((m) => (
									<div
										key={m.id}
										className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium [border-color:var(--border)] [background:color-mix(in_oklab,var(--surface)_80%,transparent)] [color:var(--text-muted)]"
									>
										<AgentPixelMark profileId={m.id} size={14} />
										<span className="capitalize">{m.id}</span>
									</div>
								))}
							</div>
						</div>
					</section>
					)}

					<section
						className={`relative overflow-hidden rounded-2xl border shadow-sm ${hidePanel ? "" : "md:col-span-7"} [background:var(--surface)] [border-color:var(--border)]${cardClassName ? ` ${cardClassName}` : ""}`}
						style={cardStyle}
					>
						<div
							className="h-[2px] w-full"
							style={{
								background: "linear-gradient(90deg, var(--primary), var(--accent), var(--primary))",
								opacity: 0.7,
							}}
						/>
						<div className="p-6">{children}</div>
					</section>
				</div>
			</main>
		</div>
	);
}

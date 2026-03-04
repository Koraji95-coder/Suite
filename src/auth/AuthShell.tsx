// src/auth/AuthShell.tsx
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@/appMeta";
import { AgentPixelMark } from "@/components/agent/AgentPixelMark";
import type { AgentProfileId } from "@/components/agent/agentProfiles";
import { Button } from "@/components/primitives/Button";
import { HStack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";

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
		<div className="min-h-screen bg-bg text-text">
			{/* ═══════════════════════════════════════════════════════════════════
          NAV
      ═══════════════════════════════════════════════════════════════════ */}
			<nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 md:px-8">
				<Link
					to="/"
					className="inline-flex items-center gap-2.5 text-sm font-semibold text-text no-underline"
					aria-label={`${APP_NAME} home`}
				>
					<AgentPixelMark profileId="koro" size={28} expression="neutral" />
					<span className="tracking-tight">{APP_NAME}</span>
				</Link>

				{navLink && (
					<Link to={navLink.to}>
						<Button variant="secondary" size="sm">
							{navLink.label}
						</Button>
					</Link>
				)}
			</nav>

			{/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════════════════════ */}
			<main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-2 md:px-8">
				<div
					className={`grid gap-6 ${hidePanel ? "" : "md:grid-cols-12"}`}
					style={{
						opacity: mounted ? 1 : 0,
						transform: mounted ? "translateY(0)" : "translateY(12px)",
						transition: "opacity 0.5s ease, transform 0.5s ease",
					}}
				>
					{/* ─────────────────────────────────────────────────────────────────
              LEFT PANEL (Agent showcase)
          ───────────────────────────────────────────────────────────────── */}
					{!hidePanel && (
						<section className="relative hidden overflow-hidden rounded-2xl border border-border md:col-span-5 md:flex md:flex-col md:items-center md:justify-center">
							{/* Background gradient */}
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

							{/* Dot pattern */}
							<div
								className="absolute inset-0 opacity-[0.04]"
								style={{
									backgroundImage:
										"radial-gradient(circle, var(--text-muted) 1px, transparent 1px)",
									backgroundSize: "20px 20px",
								}}
							/>

							{/* Content */}
							<div className="relative flex h-full min-h-105 w-full flex-col items-center justify-center px-8 py-12">
								{/* Floating agent marks */}
								<div className="relative mb-10">
									{FLOATING_MARKS.map((m) => (
										<div
											key={m.id}
											className="absolute animate-float"
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

								{/* Branding */}
								<div className="text-center">
									<Text size="xl" weight="semibold" block>
										{APP_NAME}
									</Text>
									<Text size="sm" color="muted" className="mt-1.5" block>
										{APP_TAGLINE}
									</Text>
								</div>

								{/* Agent badges */}
								<HStack gap={3} className="mt-8" wrap justify="center">
									{FLOATING_MARKS.map((m) => (
										<div
											key={m.id}
											className="flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-2.5 py-1"
										>
											<AgentPixelMark profileId={m.id} size={14} />
											<Text size="xs" color="muted" className="capitalize">
												{m.id}
											</Text>
										</div>
									))}
								</HStack>
							</div>
						</section>
					)}

					{/* ─────────────────────────────────────────────────────────────────
              RIGHT PANEL (Form content)
          ───────────────────────────────────────────────────────────────── */}
					<section
						className={`
              relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm
              ${hidePanel ? "" : "md:col-span-7"}
              ${cardClassName ?? ""}
            `}
						style={cardStyle}
					>
						{/* Top accent line */}
						<div
							className="h-0.5 w-full opacity-70"
							style={{
								background:
									"linear-gradient(90deg, var(--primary), var(--accent), var(--primary))",
							}}
						/>

						{/* Content */}
						<div className="p-6">{children}</div>
					</section>
				</div>
			</main>
		</div>
	);
}

import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { APP_NAME } from "@/app";

type AuthPanelItem = {
	title: string;
	description: string;
};

type AuthShellProps = {
	children: ReactNode;
	navLink?: { to: string; label: string };
	panelBadge?: string;
	panelTitle?: string;
	panelSubtitle?: string;
	panelItems?: AuthPanelItem[];
	panelFooter?: string;
	cardClassName?: string;
	cardStyle?: CSSProperties;
};

const DEFAULT_PANEL_ITEMS: AuthPanelItem[] = [
	{
		title: "Unified workspace",
		description: "Projects, scheduling, and task execution in one system.",
	},
	{
		title: "Token-driven UI",
		description: "Single source of truth for style and component behavior.",
	},
	{
		title: "Flexible themes",
		description: "Switch visual mood without touching auth functionality.",
	},
];

export default function AuthShell({
	children,
	navLink,
	panelBadge = `${APP_NAME} Workspace`,
	panelTitle = "Access your workspace",
	panelSubtitle = "Authentication stays secure while visuals stay easy to change.",
	panelItems = DEFAULT_PANEL_ITEMS,
	panelFooter = "Secure email-based sign-in with recoverable account access.",
	cardClassName,
	cardStyle,
}: AuthShellProps) {
	return (
		<div className="min-h-screen [background:var(--bg)] [color:var(--text)]">
			<nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 md:px-8">
				<Link
					to="/"
					className="inline-flex items-center gap-2 text-sm font-semibold no-underline [color:var(--text)]"
					aria-label={`${APP_NAME} home`}
				>
					<div className="grid grid-cols-2 gap-0.5 rounded-md border p-1 [background:var(--surface-2)] [border-color:var(--border)]">
						<span className="block h-1.5 w-1.5 rounded-[2px] [background:var(--primary)]" />
						<span className="block h-1.5 w-1.5 rounded-[2px] [background:var(--primary)]" />
						<span className="block h-1.5 w-1.5 rounded-[2px] [background:var(--primary)]" />
						<span className="block h-1.5 w-1.5 rounded-[2px] [background:var(--primary)]" />
					</div>
					<span>{APP_NAME}</span>
				</Link>

				{navLink ? (
					<div className="inline-flex items-center">
						<Link
							to={navLink.to}
							className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						>
							{navLink.label}
						</Link>
					</div>
				) : null}
			</nav>

			<main className="mx-auto w-full max-w-6xl px-4 pb-10 md:px-8">
				<div className="grid gap-6 md:grid-cols-12">
					<section className="hidden rounded-2xl border p-6 shadow-sm md:col-span-5 md:block [background:var(--surface)] [border-color:var(--border)]">
						<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
							<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
							{panelBadge}
						</div>
						<h1 className="text-2xl font-semibold">{panelTitle}</h1>
						<p className="mt-2 text-sm leading-relaxed [color:var(--text-muted)]">
							{panelSubtitle}
						</p>

						<div className="mt-6 grid gap-3">
							{panelItems.map((item) => (
								<div
									key={item.title}
									className="rounded-xl border p-3 [background:var(--surface-2)] [border-color:var(--border)]"
								>
									<div className="text-sm font-semibold">{item.title}</div>
									<div className="mt-1 text-xs [color:var(--text-muted)]">
										{item.description}
									</div>
								</div>
							))}
						</div>

						<div className="mt-6 text-xs [color:var(--text-muted)]">
							{panelFooter}
						</div>
					</section>

					<section
						className={`rounded-2xl border p-6 shadow-sm md:col-span-7 [background:var(--surface)] [border-color:var(--border)]${cardClassName ? ` ${cardClassName}` : ""}`}
						style={cardStyle}
					>
						{children}
					</section>
				</div>
			</main>
		</div>
	);
}

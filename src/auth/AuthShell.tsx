import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

import AuthGradientBackground from "./AuthGradientBackground";

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
		description: "Projects, scheduling, and knowledge modules in one place.",
	},
	{
		title: "Glass-first interface",
		description: "High-contrast UI tuned for long-form, focused work.",
	},
	{
		title: "Theme-aware system",
		description: "Switch palettes without losing hierarchy or readability.",
	},
];

export default function AuthShell({
	children,
	navLink,
	panelBadge = "BlockFlow Workspace",
	panelTitle = "Build with modular blocks",
	panelSubtitle = "Organize engineering work into a coherent operating system for projects, calendar, and reference.",
	panelItems = DEFAULT_PANEL_ITEMS,
	panelFooter = "Secure email-based sign-in with a workspace that scales.",
	cardClassName,
	cardStyle,
}: AuthShellProps) {
	return (
		<div className="auth-page">
			<AuthGradientBackground />

			<nav className="auth-nav">
				<Link to="/" className="nav-logo" aria-label="BlockFlow home">
					<div className="nav-logo-mark">
						<span />
						<span />
						<span />
						<span />
					</div>
					<span className="nav-logo-name">BlockFlow</span>
				</Link>

				{navLink ? (
					<div className="nav-right">
						<Link to={navLink.to} className="btn-ghost">
							{navLink.label}
						</Link>
					</div>
				) : null}
			</nav>

			<main className="auth-main">
				<div className="auth-shell-grid">
					<section className="auth-panel glass">
						<div className="hero-badge auth-panel-badge">
							<span className="badge-dot" />
							{panelBadge}
						</div>
						<h1 className="auth-panel-title">{panelTitle}</h1>
						<p className="auth-panel-sub">{panelSubtitle}</p>

						<div className="auth-panel-grid">
							{panelItems.map((item) => (
								<div key={item.title} className="auth-panel-item">
									<div className="auth-panel-item-title">{item.title}</div>
									<div className="auth-panel-item-sub">{item.description}</div>
								</div>
							))}
						</div>

						<div className="auth-panel-foot">{panelFooter}</div>
					</section>

					<section
						className={`auth-card glass${cardClassName ? ` ${cardClassName}` : ""}`}
						style={cardStyle}
					>
						{children}
					</section>
				</div>
			</main>
		</div>
	);
}

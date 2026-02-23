// src/routes/AppShell.tsx
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/useAuth";

function AppTopbar() {
	const { signOut } = useAuth();

	return (
		<div className="app-topbar glass">
			<div className="app-topbar-inner">
				<NavLink
					to="/app/home"
					className="nav-logo"
					aria-label="Go to dashboard"
				>
					<div className="nav-logo-mark">
						<span />
						<span />
						<span />
						<span />
					</div>
					<span className="nav-logo-name">BlockFlow</span>
				</NavLink>

				<nav className="app-nav" aria-label="App navigation">
					<NavLink
						to="/app/home"
						className={({ isActive }) => (isActive ? "active" : "")}
						end
					>
						Dashboard
					</NavLink>
					<NavLink
						to="/app/settings"
						className={({ isActive }) => (isActive ? "active" : "")}
					>
						Settings
					</NavLink>
				</nav>

				<div className="app-actions">
					<button
						type="button"
						className="btn-ghost"
						onClick={() => void signOut()}
					>
						Sign out
					</button>
				</div>
			</div>
		</div>
	);
}

export default function AppShell() {
	return (
		<div className="app-shell">
			<AppTopbar />
			<div className="app-shell-body">
				<Outlet />
			</div>
		</div>
	);
}
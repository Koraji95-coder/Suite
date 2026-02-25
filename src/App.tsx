// src/App.tsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { NotificationProvider } from "./auth/NotificationContext";
import { ErrorBoundary } from "./components/notification/ErrorBoundary";
import { ToastContainer } from "./components/notification/ToastContainer";
import { ToastProvider } from "./components/notification/ToastProvider";
import { logger } from "./lib/logger";
import Shell from "./routes/AppShell";
import ForgotPasswordPage from "./routes/ForgotPasswordPage";
import LandingPage from "./routes/LandingPage";
import LoginPage from "./routes/LoginPage";
import PrivacyPage from "./routes/PrivacyPage";
import ProtectedRoute from "./routes/ProtectedRoute";
import ResetPasswordPage from "./routes/ResetPasswordPage";
import RouteLoadingFallback from "./routes/RouteLoadingFallback";
import SignupPage from "./routes/SignupPage";

const AppDashboardPage = lazy(() => import("./routes/AppDashboardPage"));
const AppsRoutePage = lazy(() => import("./routes/apps/AppsRoutePage"));
const ArchitectureMapRoutePage = lazy(
	() => import("./routes/architecture/ArchitectureMapRoutePage"),
);
const AgentRoutePage = lazy(() => import("./routes/agent/AgentRoutePage"));
const CalendarRoutePage = lazy(() => import("./routes/CalendarRoutePage"));
const CommandCenterPage = lazy(() => import("./routes/CommandCenterPage"));
const GroundGridRoutePage = lazy(
	() => import("./routes/apps/GroundGridRoutePage"),
);
const TransmittalBuilderRoutePage = lazy(
	() => import("./routes/apps/TransmittalBuilderRoutePage"),
);
const KnowledgeRoutePage = lazy(
	() => import("./routes/knowledge/KnowledgeRoutePage"),
);
const ProjectsRoutePage = lazy(() => import("./routes/ProjectsRoutePage"));
const SettingsPage = lazy(() => import("./routes/settings/SettingsPage"));

function withRouteSuspense(element: React.ReactNode) {
	return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

function EnvDebug() {
	if (!import.meta.env.DEV) return null;

	logger.debug("[App] Env check", "App", {
		supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
		hasAnonKey: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
	});

	return null;
}

export default function App() {
	return (
		<BrowserRouter>
			<ErrorBoundary>
				<AuthProvider>
					<NotificationProvider>
						<ToastProvider>
							<EnvDebug />

							<Routes>
								<Route path="/" element={<LandingPage />} />
								<Route path="/login" element={<LoginPage />} />
								<Route path="/signup" element={<SignupPage />} />
								<Route
									path="/forgot-password"
									element={<ForgotPasswordPage />}
								/>
								<Route path="/reset-password" element={<ResetPasswordPage />} />
								<Route path="/privacy" element={<PrivacyPage />} />

								<Route element={<ProtectedRoute />}>
									<Route path="/app" element={<Shell />}>
										<Route
											index
											element={<Navigate to="/app/dashboard" replace />}
										/>
										<Route
											path="home"
											element={<Navigate to="/app/dashboard" replace />}
										/>
										<Route
											path="dashboard"
											element={withRouteSuspense(<AppDashboardPage />)}
										/>
										<Route
											path="projects"
											element={withRouteSuspense(<ProjectsRoutePage />)}
										/>
										<Route
											path="projects/:projectId"
											element={withRouteSuspense(<ProjectsRoutePage />)}
										/>
										<Route
											path="calendar"
											element={withRouteSuspense(<CalendarRoutePage />)}
										/>
										<Route
											path="apps"
											element={withRouteSuspense(<AppsRoutePage />)}
										/>
										<Route
											path="apps/ground-grid"
											element={withRouteSuspense(<GroundGridRoutePage />)}
										/>
										<Route
											path="apps/transmittal"
											element={withRouteSuspense(
												<TransmittalBuilderRoutePage />,
											)}
										/>
										<Route
											path="knowledge"
											element={withRouteSuspense(<KnowledgeRoutePage />)}
										/>
										<Route
											path="agent"
											element={withRouteSuspense(<AgentRoutePage />)}
										/>
										<Route
											path="architecture-map"
											element={withRouteSuspense(<ArchitectureMapRoutePage />)}
										/>
										<Route
											path="settings"
											element={withRouteSuspense(<SettingsPage />)}
										/>
										<Route
											path="command-center"
											element={withRouteSuspense(<CommandCenterPage />)}
										/>
									</Route>
								</Route>

								<Route path="*" element={<Navigate to="/" replace />} />
							</Routes>

							<ToastContainer />
						</ToastProvider>
					</NotificationProvider>
				</AuthProvider>
			</ErrorBoundary>
		</BrowserRouter>
	);
}

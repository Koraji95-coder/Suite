// src/App.tsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { NotificationProvider } from "./auth/NotificationContext";
import Cursor from "./components/fx/Cursor";
import { ErrorBoundary } from "./components/notification-system/ErrorBoundary";
import { ToastContainer } from "./components/notification-system/ToastContainer";
import { ToastProvider } from "./components/notification-system/ToastProvider";
import { useSuiteCursor, useCursorEnabled } from "./components/fx/useSuiteCursor";
import { logger } from "./lib/logger";
import AppDashboardPage from "./routes/AppDashboardPage";
import Shell from "./routes/AppShell";
import ForgotPasswordPage from "./routes/ForgotPasswordPage";
import LandingPage from "./routes/LandingPage";
import LoginPage from "./routes/LoginPage";
import PrivacyPage from "./routes/PrivacyPage";
import ProtectedRoute from "./routes/ProtectedRoute";
import ResetPasswordPage from "./routes/ResetPasswordPage";
import RouteLoadingFallback from "./routes/RouteLoadingFallback";
import SignupPage from "./routes/SignupPage";

const AppsRoutePage = lazy(() => import("./routes/apps/AppsRoutePage"));
const ArchitectureMapRoutePage = lazy(
	() => import("./routes/architecture/ArchitectureMapRoutePage"),
);
const AgentRoutePage = lazy(() => import("./routes/agent/AgentRoutePage"));
const CalendarRoutePage = lazy(() => import("./routes/CalendarRoutePage"));
const CommandCenterPage = lazy(() => import("./routes/CommandCenterPage"));
const GroundGridRoutePage = lazy(
	() =>
		import(
			"./routes/apps/ground-grid-generation/GroundGridGenerationRoutePage"
		),
);
const TransmittalBuilderRoutePage = lazy(
	() =>
		import(
			"./routes/apps/transmittal-builder/TransmittalBuilderRoutePage"
		),
);
const GraphRoutePage = lazy(
	() => import("./routes/apps/graph/GraphRoutePage"),
);
const StandardsCheckerRoutePage = lazy(
	() => import("./routes/apps/standards-checker/StandardsCheckerRoutePage"),
);
const BatchFindReplaceRoutePage = lazy(
	() => import("./routes/apps/batch-find-replace/BatchFindReplaceRoutePage"),
);
const DrawingListManagerRoutePage = lazy(
	() =>
		import(
			"./routes/apps/drawing-list-manager/DrawingListManagerRoutePage"
		),
);
const KnowledgeRoutePage = lazy(
	() => import("./routes/knowledge/KnowledgeRoutePage"),
);
const MathToolsLibraryPage = lazy(
	() => import("./routes/knowledge/math-tools/MathToolsLibraryPage"),
);
const WhiteboardKnowledgePage = lazy(
	() => import("./routes/knowledge/whiteboard/WhiteboardKnowledgePage"),
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
	const cursorEnabled = useCursorEnabled();
	useSuiteCursor(cursorEnabled);

	return (
		<BrowserRouter>
			<ErrorBoundary>
				<AuthProvider>
					<NotificationProvider>
						<ToastProvider>
							<EnvDebug />
							{cursorEnabled && <Cursor />}

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
											path="apps/ground-grid-generation"
											element={withRouteSuspense(<GroundGridRoutePage />)}
										/>
										<Route
											path="apps/transmittal-builder"
											element={withRouteSuspense(
												<TransmittalBuilderRoutePage />,
											)}
										/>
										<Route
											path="apps/drawing-list-manager"
											element={withRouteSuspense(<DrawingListManagerRoutePage />)}
										/>
										<Route
											path="apps/graph"
											element={withRouteSuspense(<GraphRoutePage />)}
										/>
										<Route
											path="apps/standards-checker"
											element={withRouteSuspense(<StandardsCheckerRoutePage />)}
										/>
										<Route
											path="apps/batch-find-replace"
											element={withRouteSuspense(<BatchFindReplaceRoutePage />)}
										/>
										<Route
											path="knowledge"
											element={withRouteSuspense(<KnowledgeRoutePage />)}
										/>
										<Route
											path="knowledge/whiteboard"
											element={withRouteSuspense(<WhiteboardKnowledgePage />)}
										/>
										<Route
											path="knowledge/math-tools"
											element={withRouteSuspense(<MathToolsLibraryPage />)}
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

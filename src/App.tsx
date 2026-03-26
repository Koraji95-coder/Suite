import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { NotificationProvider } from "./auth/NotificationContext";
import Cursor from "./components/fx/Cursor";
import {
	useCursorEnabled,
	useSuiteCursor,
} from "./components/fx/useSuiteCursor";
import { ErrorBoundary } from "./components/notification-system/ErrorBoundary";
import { ToastContainer } from "./components/notification-system/ToastContainer";
import { logger } from "./lib/logger";
import AgentPairingRedirectGate from "./routes/AgentPairingRedirectGate";
import AppDashboardPage from "./routes/AppDashboardPage";
import Shell from "./routes/AppShell";
import AudienceRoute from "./routes/AudienceRoute";
import AppsRoutePage from "./routes/apps/AppsRoutePage";
import DrawingListManagerRoutePage from "./routes/apps/drawing-list-manager/DrawingListManagerRoutePage";
import StandardsCheckerRoutePage from "./routes/apps/standards-checker/StandardsCheckerRoutePage";
import TransmittalBuilderRoutePage from "./routes/apps/transmittal-builder/TransmittalBuilderRoutePage";
import CalendarRoutePage from "./routes/CalendarRoutePage";
import DeveloperDocsRoutePage from "./routes/knowledge/DeveloperDocsRoutePage";
import KnowledgeRoutePage from "./routes/knowledge/KnowledgeRoutePage";
import MathToolsLibraryPage from "./routes/knowledge/math-tools/MathToolsLibraryPage";
import LandingPage from "./routes/LandingPage";
import LoginPage from "./routes/LoginPage";
import PrivacyPage from "./routes/PrivacyPage";
import ProjectsRoutePage from "./routes/ProjectsRoutePage";
import ProtectedRoute from "./routes/ProtectedRoute";
import RouteLoadingFallback from "./routes/RouteLoadingFallback";
import SignupPage from "./routes/SignupPage";
import SettingsPage from "./routes/settings/SettingsPage";
import WatchdogRoutePage from "./routes/watchdog/WatchdogRoutePage";

const AgentRoutePage = lazy(() => import("./routes/agent/AgentRoutePage"));
const DeveloperPortalRoutePage = lazy(
	() => import("./routes/DeveloperPortalRoutePage"),
);
const ArchitectureMapRoutePage = lazy(
	() => import("./routes/architecture/ArchitectureMapRoutePage"),
);
const AgentPairingCallbackPage = lazy(
	() => import("./routes/agent/AgentPairingCallbackPage"),
);
const ChangelogRoutePage = lazy(() => import("./routes/ChangelogRoutePage"));
const CommandCenterPage = lazy(() => import("./routes/CommandCenterPage"));
const GroundGridRoutePage = lazy(
	() =>
		import(
			"./routes/apps/ground-grid-generation/GroundGridGenerationRoutePage"
		),
);
const AutoDraftStudioRoutePage = lazy(
	() => import("./routes/apps/autodraft-studio/AutoDraftStudioRoutePage"),
);
const GraphRoutePage = lazy(() => import("./routes/apps/graph/GraphRoutePage"));
const BatchFindReplaceRoutePage = lazy(
	() => import("./routes/apps/batch-find-replace/BatchFindReplaceRoutePage"),
);
const BlockLibraryRoutePage = lazy(
	() => import("./routes/apps/block-library/BlockLibraryRoutePage"),
);
const EtapDxfCleanupRoutePage = lazy(
	() => import("./routes/apps/etap-dxf-cleanup/EtapDxfCleanupRoutePage"),
);
const AutoWireRoutePage = lazy(
	() => import("./routes/apps/autowire/AutoWireRoutePage"),
);
const WhiteboardKnowledgePage = lazy(
	() => import("./routes/knowledge/whiteboard/WhiteboardKnowledgePage"),
);

function withRouteSuspense(element: React.ReactNode) {
	return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

function withAudience(element: React.ReactNode, audience: "customer" | "dev") {
	return <AudienceRoute audience={audience}>{element}</AudienceRoute>;
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
						<EnvDebug />
						<AgentPairingRedirectGate />
						{cursorEnabled && <Cursor />}

						<Routes>
							<Route path="/" element={<LandingPage />} />
							<Route path="/login" element={<LoginPage />} />
							<Route path="/signup" element={<SignupPage />} />
							<Route path="/privacy" element={<PrivacyPage />} />
							<Route
								path="/roadmap"
								element={<Navigate to="/" replace />}
							/>
							<Route
								path="/agent/pairing-callback"
								element={withRouteSuspense(<AgentPairingCallbackPage />)}
							/>

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
										path="watchdog"
										element={withRouteSuspense(<WatchdogRoutePage />)}
									/>
									<Route
										path="operations"
										element={<Navigate to="/app/developer" replace />}
									/>
									<Route
										path="developer"
										element={withRouteSuspense(
											withAudience(<DeveloperPortalRoutePage />, "dev"),
										)}
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
										path="changelog"
										element={withRouteSuspense(
											withAudience(<ChangelogRoutePage />, "dev"),
										)}
									/>
									<Route
										path="apps"
										element={withRouteSuspense(<AppsRoutePage />)}
									/>
									<Route
										path="apps/ground-grid-generation"
										element={withRouteSuspense(
											withAudience(<GroundGridRoutePage />, "dev"),
										)}
									/>
									<Route
										path="apps/autodraft-studio"
										element={withRouteSuspense(
											withAudience(<AutoDraftStudioRoutePage />, "dev"),
										)}
									/>
									<Route
										path="apps/transmittal-builder"
										element={withRouteSuspense(<TransmittalBuilderRoutePage />)}
									/>
									<Route
										path="apps/drawing-list-manager"
										element={withRouteSuspense(<DrawingListManagerRoutePage />)}
									/>
									<Route
										path="apps/autowire"
										element={withRouteSuspense(
											withAudience(<AutoWireRoutePage />, "dev"),
										)}
									/>
									<Route
										path="apps/graph"
										element={withRouteSuspense(
											withAudience(<GraphRoutePage />, "dev"),
										)}
									/>
									<Route
										path="apps/standards-checker"
										element={withRouteSuspense(<StandardsCheckerRoutePage />)}
									/>
									<Route
										path="apps/batch-find-replace"
										element={withRouteSuspense(
											withAudience(<BatchFindReplaceRoutePage />, "dev"),
										)}
									/>
									<Route
										path="apps/block-library"
										element={withRouteSuspense(<BlockLibraryRoutePage />)}
									/>
									<Route
										path="apps/etap-dxf-cleanup"
										element={withRouteSuspense(
											withAudience(<EtapDxfCleanupRoutePage />, "dev"),
										)}
									/>
									<Route
										path="architecture"
										element={withRouteSuspense(
											withAudience(<ArchitectureMapRoutePage />, "dev"),
										)}
									/>
									<Route
										path="knowledge"
										element={withRouteSuspense(<KnowledgeRoutePage />)}
									/>
									<Route
										path="developer/docs"
										element={withRouteSuspense(
											withAudience(<DeveloperDocsRoutePage />, "dev"),
										)}
									/>
									<Route
										path="knowledge/whiteboard"
										element={withRouteSuspense(
											withAudience(<WhiteboardKnowledgePage />, "dev"),
										)}
									/>
									<Route
										path="knowledge/math-tools"
										element={withRouteSuspense(<MathToolsLibraryPage />)}
									/>
									<Route
										path="agent"
										element={withRouteSuspense(
											withAudience(<AgentRoutePage />, "dev"),
										)}
									/>
									<Route
										path="agent/pairing-callback"
										element={withRouteSuspense(
											withAudience(<AgentPairingCallbackPage />, "dev"),
										)}
									/>
									<Route
										path="settings"
										element={withRouteSuspense(<SettingsPage />)}
									/>
									<Route
										path="command-center"
										element={withRouteSuspense(
											withAudience(<CommandCenterPage />, "dev"),
										)}
									/>
								</Route>
							</Route>

							<Route path="*" element={<Navigate to="/" replace />} />
						</Routes>

						<ToastContainer />
					</NotificationProvider>
				</AuthProvider>
			</ErrorBoundary>
		</BrowserRouter>
	);
}

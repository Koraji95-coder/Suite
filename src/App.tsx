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
import JamMetadataSync from "./lib/JamMetadataSync";
import { logger } from "./lib/logger";
import AudienceRoute from "./routes/AudienceRoute";
import ProtectedRoute from "./routes/ProtectedRoute";
import RouteLoadingFallback from "./routes/RouteLoadingFallback";
import {
	loadArchitectureMapRoutePage,
	loadAutoDraftStudioRoutePage,
	loadAutomationStudioRoutePage,
	loadAutoWireRoutePage,
	loadBatchFindReplaceRoutePage,
	loadBlockLibraryRoutePage,
	loadChangelogRoutePage,
	loadCommandCenterPage,
	loadDeveloperDocsRoutePage,
	loadDeveloperPortalRoutePage,
	loadDraftRoutePage,
	loadDrawingListManagerRoutePage,
	loadGraphRoutePage,
	loadGroundGridRoutePage,
	loadHomeRoutePage,
	loadLandingPage,
	loadLoginPage,
	loadMathToolsLibraryPage,
	loadPrivacyPage,
	loadProjectsRoutePage,
	loadReviewRoutePage,
	loadSettingsPage,
	loadShell,
	loadSignupPage,
	loadStandardsCheckerRoutePage,
	loadTransmittalBuilderRoutePage,
	loadWatchdogRoutePage,
	loadWhiteboardRoutePage,
} from "./routes/routeModuleLoaders";

const Shell = lazy(loadShell);
const LandingPage = lazy(loadLandingPage);
const HomeRoutePage = lazy(loadHomeRoutePage);
const DraftRoutePage = lazy(loadDraftRoutePage);
const ReviewRoutePage = lazy(loadReviewRoutePage);
const DrawingListManagerRoutePage = lazy(loadDrawingListManagerRoutePage);
const StandardsCheckerRoutePage = lazy(loadStandardsCheckerRoutePage);
const TransmittalBuilderRoutePage = lazy(loadTransmittalBuilderRoutePage);
const DeveloperDocsRoutePage = lazy(loadDeveloperDocsRoutePage);
const LoginPage = lazy(loadLoginPage);
const MathToolsLibraryPage = lazy(loadMathToolsLibraryPage);
const PrivacyPage = lazy(loadPrivacyPage);
const ProjectsRoutePage = lazy(loadProjectsRoutePage);
const SettingsPage = lazy(loadSettingsPage);
const SignupPage = lazy(loadSignupPage);
const WatchdogRoutePage = lazy(loadWatchdogRoutePage);
const DeveloperPortalRoutePage = lazy(loadDeveloperPortalRoutePage);
const AutomationStudioRoutePage = lazy(loadAutomationStudioRoutePage);
const ArchitectureMapRoutePage = lazy(loadArchitectureMapRoutePage);
const ChangelogRoutePage = lazy(loadChangelogRoutePage);
const CommandCenterPage = lazy(loadCommandCenterPage);
const GroundGridRoutePage = lazy(loadGroundGridRoutePage);
const AutoDraftStudioRoutePage = lazy(loadAutoDraftStudioRoutePage);
const GraphRoutePage = lazy(loadGraphRoutePage);
const BatchFindReplaceRoutePage = lazy(loadBatchFindReplaceRoutePage);
const BlockLibraryRoutePage = lazy(loadBlockLibraryRoutePage);
const AutoWireRoutePage = lazy(loadAutoWireRoutePage);
const WhiteboardRoutePage = lazy(loadWhiteboardRoutePage);

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
						<JamMetadataSync />
						<EnvDebug />
						{cursorEnabled && <Cursor />}

						<Routes>
							<Route path="/" element={withRouteSuspense(<LandingPage />)} />
							<Route path="/login" element={withRouteSuspense(<LoginPage />)} />
							<Route
								path="/signup"
								element={withRouteSuspense(<SignupPage />)}
							/>
							<Route
								path="/privacy"
								element={withRouteSuspense(<PrivacyPage />)}
							/>
							<Route path="/roadmap" element={<Navigate to="/" replace />} />

							<Route element={<ProtectedRoute />}>
								<Route path="/app" element={withRouteSuspense(<Shell />)}>
									<Route index element={<Navigate to="/app/home" replace />} />
									<Route
										path="home"
										element={withRouteSuspense(<HomeRoutePage />)}
									/>
									<Route
										path="developer"
										element={withRouteSuspense(
											withAudience(<DeveloperPortalRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/control/watchdog"
										element={withRouteSuspense(
											withAudience(<WatchdogRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/control/changelog"
										element={withRouteSuspense(
											withAudience(<ChangelogRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/control/command-center"
										element={withRouteSuspense(
											withAudience(<CommandCenterPage />, "dev"),
										)}
									/>
									<Route
										path="developer/control/docs"
										element={withRouteSuspense(
											withAudience(<DeveloperDocsRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/architecture/map"
										element={withRouteSuspense(
											withAudience(<ArchitectureMapRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/architecture/graph"
										element={withRouteSuspense(
											withAudience(<GraphRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/labs/automation-studio"
										element={withRouteSuspense(
											withAudience(<AutomationStudioRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/labs/ground-grid-generation"
										element={withRouteSuspense(
											withAudience(<GroundGridRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/labs/autodraft-studio"
										element={withRouteSuspense(
											withAudience(<AutoDraftStudioRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/labs/autowire"
										element={withRouteSuspense(
											withAudience(<AutoWireRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/labs/batch-find-replace"
										element={withRouteSuspense(
											withAudience(<BatchFindReplaceRoutePage />, "dev"),
										)}
									/>
									<Route
										path="developer/labs/whiteboard"
										element={withRouteSuspense(
											withAudience(<WhiteboardRoutePage />, "dev"),
										)}
									/>
									<Route
										path="projects"
										element={withRouteSuspense(<ProjectsRoutePage />)}
									/>
									<Route
										path="projects/transmittal-builder"
										element={withRouteSuspense(<TransmittalBuilderRoutePage />)}
									/>
									<Route
										path="projects/:projectId"
										element={withRouteSuspense(<ProjectsRoutePage />)}
									/>
									<Route
										path="projects/:projectId/:section"
										element={withRouteSuspense(<ProjectsRoutePage />)}
									/>
									<Route
										path="draft"
										element={withRouteSuspense(<DraftRoutePage />)}
									/>
									<Route
										path="draft/drawing-list-manager"
										element={withRouteSuspense(<DrawingListManagerRoutePage />)}
									/>
									<Route
										path="draft/block-library"
										element={withRouteSuspense(<BlockLibraryRoutePage />)}
									/>
									<Route
										path="review"
										element={withRouteSuspense(<ReviewRoutePage />)}
									/>
									<Route
										path="review/standards-checker"
										element={withRouteSuspense(<StandardsCheckerRoutePage />)}
									/>
									<Route
										path="review/math-tools"
										element={withRouteSuspense(<MathToolsLibraryPage />)}
									/>
									<Route
										path="settings"
										element={withRouteSuspense(<SettingsPage />)}
									/>
									<Route
										path="*"
										element={<Navigate to="/app/home" replace />}
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

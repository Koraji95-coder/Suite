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
import AudienceRoute from "./routes/AudienceRoute";
import DraftRoutePage from "./routes/draft/DraftRoutePage";
import HomeRoutePage from "./routes/home/HomeRoutePage";
import LandingPage from "./routes/LandingPage";
import ProtectedRoute from "./routes/ProtectedRoute";
import ReviewRoutePage from "./routes/review/ReviewRoutePage";
import RouteLoadingFallback from "./routes/RouteLoadingFallback";

const Shell = lazy(() => import("./routes/AppShell"));
const DrawingListManagerRoutePage = lazy(
	() =>
		import("./routes/draft/drawing-list-manager/DrawingListManagerRoutePage"),
);
const StandardsCheckerRoutePage = lazy(
	() => import("./routes/review/standards-checker/StandardsCheckerRoutePage"),
);
const TransmittalBuilderRoutePage = lazy(
	() =>
		import("./routes/projects/transmittal-builder/TransmittalBuilderRoutePage"),
);
const DeveloperDocsRoutePage = lazy(
	() => import("./routes/developer/control/docs/DeveloperDocsRoutePage"),
);
const LoginPage = lazy(() => import("./routes/LoginPage"));
const MathToolsLibraryPage = lazy(
	() => import("./routes/review/math-tools/MathToolsLibraryPage"),
);
const PrivacyPage = lazy(() => import("./routes/PrivacyPage"));
const ProjectsRoutePage = lazy(() => import("./routes/projects/ProjectsRoutePage"));
const SettingsPage = lazy(() => import("./routes/settings/SettingsPage"));
const SignupPage = lazy(() => import("./routes/SignupPage"));
const WatchdogRoutePage = lazy(
	() => import("./routes/developer/control/watchdog/WatchdogRoutePage"),
);
const DeveloperPortalRoutePage = lazy(
	() => import("./routes/developer/DeveloperPortalRoutePage"),
);
const AutomationStudioRoutePage = lazy(
	() =>
		import("./routes/developer/labs/automation-studio/AutomationStudioRoutePage"),
);
const ArchitectureMapRoutePage = lazy(
	() => import("./routes/developer/architecture/map/ArchitectureMapRoutePage"),
);
const ChangelogRoutePage = lazy(() => import("./routes/developer/control/changelog/ChangelogRoutePage"));
const CommandCenterPage = lazy(() => import("./routes/developer/control/command-center/CommandCenterPage"));
const GroundGridRoutePage = lazy(
	() =>
		import(
			"./routes/developer/labs/ground-grid-generation/GroundGridGenerationRoutePage"
		),
);
const AutoDraftStudioRoutePage = lazy(
	() =>
		import("./routes/developer/labs/autodraft-studio/AutoDraftStudioRoutePage"),
);
const GraphRoutePage = lazy(
	() => import("./routes/developer/architecture/graph/GraphRoutePage"),
);
const BatchFindReplaceRoutePage = lazy(
	() =>
		import(
			"./routes/developer/labs/batch-find-replace/BatchFindReplaceRoutePage"
		),
);
const BlockLibraryRoutePage = lazy(
	() => import("./routes/draft/block-library/BlockLibraryRoutePage"),
);
const AutoWireRoutePage = lazy(
	() => import("./routes/developer/labs/autowire/AutoWireRoutePage"),
);
const WhiteboardRoutePage = lazy(
	() => import("./routes/developer/labs/whiteboard/WhiteboardKnowledgePage"),
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
						{cursorEnabled && <Cursor />}

						<Routes>
							<Route path="/" element={<LandingPage />} />
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
									<Route path="*" element={<Navigate to="/app/home" replace />} />
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

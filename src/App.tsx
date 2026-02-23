// src/App.tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/notification/ErrorBoundary";
import { ToastContainer } from "./components/notification/ToastContainer";
import { ToastProvider } from "./components/notification/ToastProvider";
import { AuthProvider } from "./auth/AuthContext";
import { NotificationProvider } from "./auth/NotificationContext";
import { logger } from "./lib/logger";
import Shell from "./routes/AppShell";
import ForgotPasswordPage from "./routes/ForgotPasswordPage";
import LandingPage from "./routes/LandingPage";
import LoginPage from "./routes/LoginPage";
import PrivacyPage from "./routes/PrivacyPage";
import ProtectedRoute from "./routes/ProtectedRoute";
import SignupPage from "./routes/SignupPage";

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
								<Route path="/forgot-password" element={<ForgotPasswordPage />} />
								<Route path="/privacy" element={<PrivacyPage />} />

								<Route element={<ProtectedRoute />}>
									<Route path="/app" element={<Shell />}>
										<Route index element={<Navigate to="/app/home" replace />} />
										<Route
											path="home"
											element={<div style={{ padding: 24 }}>App Home (placeholder)</div>}
										/>
										<Route
											path="settings"
											element={<div style={{ padding: 24 }}>Settings (placeholder)</div>}
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

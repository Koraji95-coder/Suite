// src/routes/LoginPage.tsx

import {
	type PublicKeyCredentialRequestOptionsJSON,
	startAuthentication,
} from "@simplewebauthn/browser";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthEnvDebugCard from "../auth/AuthEnvDebugCard";
import AuthShell from "../auth/AuthShell";
import { buildAgentPairingSearchFromLocation } from "../auth/agentPairingParams";
import { resolveAuthRedirect } from "../auth/authRedirect";
import CaptchaChallenge from "../auth/CaptchaChallenge";
import { useNotification } from "../auth/NotificationContext";
import {
	completePasskeyCallback,
	completePasskeySignInVerification,
	startPasskeySignIn,
} from "../auth/passkeyAuthApi";
import {
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
} from "../auth/passkeyCapabilityApi";
import { markPasskeySignInPending } from "../auth/passkeySessionState";
import { useAuth } from "../auth/useAuth";
// Components
import { AgentOrbitLoader } from "../components/agent/AgentOrbitLoader";
import { AgentPixelMark } from "../components/agent/AgentPixelMark";
import { AGENT_PROFILE_IDS } from "../components/agent/agentProfiles";
import { loadDashboardOverviewFromBackend } from "../components/apps/dashboard/dashboardOverviewService";
import { Badge } from "../components/primitives/Badge";
// Primitives
import { Button } from "../components/primitives/Button";
import { Input } from "../components/primitives/Input";
import { Panel } from "../components/primitives/Panel";
import { Progress } from "../components/primitives/Progress";
import { HStack, Stack } from "../components/primitives/Stack";
import { Text } from "../components/primitives/Text";
import { logger } from "../lib/logger";
import { cn } from "../lib/utils";
import { logAuthMethodTelemetry } from "../services/securityEventService";
import styles from "./LoginPage.module.css";

const AGENT_IDS = AGENT_PROFILE_IDS;
const DASHBOARD_REDIRECT_MIN_MS = 10_000;
const DASHBOARD_REDIRECT_MIN_PROGRESS = 4;
const DASHBOARD_REDIRECT_MAX_PROGRESS_BEFORE_READY = 95;

type LocationState = { from?: string };

function isDashboardDestination(path: string): boolean {
	const normalized = path.split("?")[0].replace(/\/+$/, "");
	return normalized === "/app/home" || normalized === "/app/dashboard";
}

export default function LoginPage() {
	const { user, loading, signIn } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const agentPairingSearch = useMemo(() => {
		return buildAgentPairingSearchFromLocation(location.search, location.hash);
	}, [location.hash, location.search]);
	const hasAgentPairingParams = agentPairingSearch.length > 0;
	const from = useMemo(() => {
		if (hasAgentPairingParams) {
			return `/agent/pairing-callback${agentPairingSearch}`;
		}
		return (location.state as LocationState | null)?.from ?? "/app/home";
	}, [agentPairingSearch, hasAgentPairingParams, location.state]);

	const notification = useNotification();
	const [email, setEmail] = useState("");
	const [captchaToken, setCaptchaToken] = useState("");
	const [honeypot, setHoneypot] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [passkeySubmitting, setPasskeySubmitting] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState("");
	const [redirectProgress, setRedirectProgress] = useState(0);
	const [redirectMessage, setRedirectMessage] = useState(
		"Preparing your session...",
	);
	const [mounted, setMounted] = useState(false);
	const passkeyCallbackHandledRef = useRef("");
	const shouldPreloadDashboard = useMemo(
		() => isDashboardDestination(from),
		[from],
	);

	const requiresCaptcha = Boolean(
		(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim(),
	);
	const honeypotFieldName =
		(import.meta.env.VITE_AUTH_HONEYPOT_FIELD || "company").trim() || "company";

	const canSubmit = useMemo(() => {
		if (loading || submitting) return false;
		if (email.trim().length === 0) return false;
		if (requiresCaptcha) return captchaToken.trim().length > 0;
		return true;
	}, [email, loading, submitting, requiresCaptcha, captchaToken]);

	const passkeyAvailable = useMemo(
		() => isFrontendPasskeyEnabled() && isBrowserPasskeySupported(),
		[],
	);

	// Mount animation
	useEffect(() => {
		const id = requestAnimationFrame(() => setMounted(true));
		return () => cancelAnimationFrame(id);
	}, []);

	// ═══════════════════════════════════════════════════════════════════════════
	// REDIRECT PROGRESS EFFECT
	// ═══════════════════════════════════════════════════════════════════════════
	useEffect(() => {
		if (!(user && !loading)) {
			setRedirectProgress(0);
			setRedirectMessage("Preparing your session...");
			return;
		}

		let timeoutId: number | null = null;
		let rafId: number | null = null;
		let minimumDelayTimerId: number | null = null;
		let minimumDelayResolve: (() => void) | null = null;
		let baselineProgressTimerId: number | null = null;
		let cancelled = false;

		const navigateToDestination = () => {
			if (cancelled) return;
			navigate(from, { replace: true });
		};

		if (shouldPreloadDashboard) {
			setRedirectMessage("Preparing dashboard...");
			setRedirectProgress(DASHBOARD_REDIRECT_MIN_PROGRESS);
			const startedAt = performance.now();
			const updateBaselineProgress = () => {
				if (cancelled) return;
				const elapsed = performance.now() - startedAt;
				const ratio = Math.min(1, elapsed / DASHBOARD_REDIRECT_MIN_MS);
				const baseline = Math.round(
					DASHBOARD_REDIRECT_MIN_PROGRESS +
						ratio *
							(DASHBOARD_REDIRECT_MAX_PROGRESS_BEFORE_READY -
								DASHBOARD_REDIRECT_MIN_PROGRESS),
				);
				setRedirectProgress((current) =>
					Math.max(
						current,
						Math.min(
							baseline,
							DASHBOARD_REDIRECT_MAX_PROGRESS_BEFORE_READY,
						),
					),
				);
				if (ratio >= 1 && baselineProgressTimerId !== null) {
					window.clearInterval(baselineProgressTimerId);
					baselineProgressTimerId = null;
				}
			};
			baselineProgressTimerId = window.setInterval(updateBaselineProgress, 120);
			updateBaselineProgress();
			const waitForMinimumRedirectDuration = () => {
				const elapsed = performance.now() - startedAt;
				const remaining = Math.max(0, DASHBOARD_REDIRECT_MIN_MS - elapsed);
				if (remaining <= 0) return Promise.resolve();
				return new Promise<void>((resolve) => {
					minimumDelayResolve = resolve;
					minimumDelayTimerId = window.setTimeout(() => {
						minimumDelayResolve = null;
						resolve();
					}, remaining);
				});
			};
			void loadDashboardOverviewFromBackend((progress) => {
				if (cancelled) return;
				const backendProgress = Math.round(progress.progress);
				const cappedProgress = Math.max(
					DASHBOARD_REDIRECT_MIN_PROGRESS,
					Math.min(
						DASHBOARD_REDIRECT_MAX_PROGRESS_BEFORE_READY,
						backendProgress,
					),
				);
				setRedirectProgress((current) => Math.max(current, cappedProgress));
				setRedirectMessage(
					backendProgress >= 100
						? "Finalizing dashboard session..."
						: progress.message || "Loading dashboard...",
				);
			})
				.then(async () => {
					await waitForMinimumRedirectDuration();
					if (cancelled) return;
					if (baselineProgressTimerId !== null) {
						window.clearInterval(baselineProgressTimerId);
						baselineProgressTimerId = null;
					}
					setRedirectProgress(100);
					setRedirectMessage("Dashboard ready.");
					timeoutId = window.setTimeout(navigateToDestination, 120);
				})
				.catch(async (preloadError) => {
					logger.warn(
						"LoginPage",
						"Dashboard preload failed during sign-in redirect. Continuing navigation.",
						{ error: preloadError },
					);
					await waitForMinimumRedirectDuration();
					if (cancelled) return;
					if (baselineProgressTimerId !== null) {
						window.clearInterval(baselineProgressTimerId);
						baselineProgressTimerId = null;
					}
					setRedirectProgress(100);
					setRedirectMessage("Opening dashboard...");
					timeoutId = window.setTimeout(navigateToDestination, 120);
				});
		} else {
			const durationMs = 1100;
			const start = performance.now();
			const tick = (now: number) => {
				const elapsed = now - start;
				const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
				setRedirectProgress(pct);
				if (elapsed >= durationMs) {
					navigateToDestination();
					return;
				}
				rafId = window.requestAnimationFrame(tick);
			};

			rafId = window.requestAnimationFrame(tick);
		}

		return () => {
			cancelled = true;
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
			if (minimumDelayTimerId !== null) {
				window.clearTimeout(minimumDelayTimerId);
			}
			if (baselineProgressTimerId !== null) {
				window.clearInterval(baselineProgressTimerId);
			}
			if (minimumDelayResolve) {
				minimumDelayResolve();
				minimumDelayResolve = null;
			}
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
			}
		};
	}, [from, loading, navigate, shouldPreloadDashboard, user]);

	// ═══════════════════════════════════════════════════════════════════════════
	// PASSKEY CALLBACK EFFECT
	// ═══════════════════════════════════════════════════════════════════════════
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const passkeyState = (params.get("passkey_state") || "").trim();
		const passkeyStatus = (params.get("passkey_status") || "")
			.trim()
			.toLowerCase();
		const passkeyIntent = (params.get("passkey_intent") || "")
			.trim()
			.toLowerCase();
		const passkeyEmail = (params.get("passkey_email") || "").trim();
		const passkeyError = (params.get("passkey_error") || "").trim();
		const passkeySignature = (
			params.get("passkey_signature") ||
			params.get("passkey_sig") ||
			params.get("provider_signature") ||
			params.get("signature") ||
			""
		).trim();
		const passkeyTimestamp = (
			params.get("passkey_timestamp") ||
			params.get("passkey_ts") ||
			params.get("provider_timestamp") ||
			params.get("timestamp") ||
			""
		).trim();

		if (
			!passkeyState ||
			(passkeyStatus !== "success" && passkeyStatus !== "failed")
		) {
			return;
		}

		const callbackKey = [
			passkeyState,
			passkeyStatus,
			passkeyIntent,
			passkeyEmail,
			passkeyError,
			passkeySignature,
			passkeyTimestamp,
		].join("|");

		if (passkeyCallbackHandledRef.current === callbackKey) {
			return;
		}
		passkeyCallbackHandledRef.current = callbackKey;

		const clearCallbackParams = () => {
			const next = new URLSearchParams(location.search);
			next.delete("passkey_state");
			next.delete("passkey_status");
			next.delete("passkey_intent");
			next.delete("passkey_email");
			next.delete("passkey_error");
			next.delete("passkey_signature");
			next.delete("passkey_sig");
			next.delete("provider_signature");
			next.delete("signature");
			next.delete("passkey_timestamp");
			next.delete("passkey_ts");
			next.delete("provider_timestamp");
			next.delete("timestamp");
			const search = next.toString();
			navigate(
				{
					pathname: location.pathname,
					search: search ? `?${search}` : "",
				},
				{ replace: true },
			);
		};

		let active = true;

		const completeCallback = async () => {
			setPasskeySubmitting(true);
			try {
				const result = await completePasskeyCallback({
					state: passkeyState,
					status: passkeyStatus as "success" | "failed",
					intent: passkeyIntent || undefined,
					email: passkeyEmail || undefined,
					error: passkeyError || undefined,
					signature: passkeySignature || undefined,
					timestamp: passkeyTimestamp || undefined,
				});

				if (result.intent === "sign-in" && result.completed === false) {
					await logAuthMethodTelemetry(
						"passkey",
						"sign_in_failed",
						`Passkey callback failed: ${result.message || "unknown error"}`,
					);
				}
				if (result.intent === "sign-in" && result.completed === true) {
					await logAuthMethodTelemetry(
						"passkey",
						"sign_in_completed",
						`Passkey callback completed (session_mode=${result.session_mode || "unknown"}).`,
					);
					markPasskeySignInPending();
				}

				if (result.resume_url) {
					window.location.assign(result.resume_url);
					return;
				}
				if (result.redirect_to) {
					window.location.assign(result.redirect_to);
					return;
				}

				if (!active) return;
				if (result.completed === false || result.status === "failed") {
					setError(result.message || "Passkey sign-in could not be completed.");
					notification.error(
						"Passkey callback failed",
						result.message || "Passkey sign-in could not be completed.",
					);
				} else if (result.message) {
					notification.success("Passkey callback complete", result.message);
				}
			} catch (err: unknown) {
				if (!active) return;
				const msg =
					err instanceof Error
						? err.message
						: "Unable to complete passkey callback.";
				setError(msg);
				await logAuthMethodTelemetry(
					"passkey",
					"sign_in_failed",
					`Passkey callback completion failed: ${msg}`,
				);
				notification.error("Passkey callback failed", msg);
			} finally {
				if (active) {
					setPasskeySubmitting(false);
					clearCallbackParams();
				}
			}
		};

		void completeCallback();
		return () => {
			active = false;
		};
	}, [location.pathname, location.search, navigate, notification]);

	// ═══════════════════════════════════════════════════════════════════════════
	// FORM HANDLERS
	// ═══════════════════════════════════════════════════════════════════════════
	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			await signIn(email.trim(), { captchaToken, honeypot });
			setSent(true);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Unable to send sign-in email right now.";
			setError(msg);
			setCaptchaToken("");
			logger.error("Login link request failed", "LoginPage", { error: err });
			await logAuthMethodTelemetry(
				"email_link",
				"sign_in_request_failed",
				`Sign-in email-link request failed: ${msg}`,
			);
			notification.error("Sign-in link failed", msg);
		} finally {
			setSubmitting(false);
		}
	};

	const onPasskeySignIn = async () => {
		if (!passkeyAvailable || passkeySubmitting || submitting) return;

		setError("");
		setPasskeySubmitting(true);
		await logAuthMethodTelemetry(
			"passkey",
			"sign_in_started",
			"Passkey sign-in flow started from login page.",
		);

		try {
			const redirectTo = resolveAuthRedirect("/login");
			const result = await startPasskeySignIn(redirectTo);

			if (result.mode === "redirect" && result.redirect_url) {
				await logAuthMethodTelemetry(
					"passkey",
					"sign_in_redirected",
					`Passkey sign-in redirected to provider: ${result.provider_label || result.provider || "unknown"}.`,
				);
				window.location.assign(result.redirect_url);
				return;
			}

			if (result.mode === "webauthn" && result.state && result.public_key) {
				const options =
					result.public_key as PublicKeyCredentialRequestOptionsJSON;
				const credential = await startAuthentication({
					optionsJSON: options,
				});

				const verification = await completePasskeySignInVerification({
					state: result.state,
					credential,
					redirectTo,
				});
				markPasskeySignInPending();

				if (verification.resume_url) {
					await logAuthMethodTelemetry(
						"passkey",
						"sign_in_completed",
						"Passkey sign-in verified and resumed via direct magic link.",
					);
					window.location.assign(verification.resume_url);
					return;
				}
				if (verification.redirect_to) {
					await logAuthMethodTelemetry(
						"passkey",
						"sign_in_completed",
						"Passkey sign-in verified and redirected to continuation URL.",
					);
					window.location.assign(verification.redirect_to);
					return;
				}
				if (
					verification.completed === false ||
					verification.status === "failed"
				) {
					throw new Error(
						verification.message || "Passkey sign-in could not be completed.",
					);
				}
				if (verification.message) {
					notification.success(
						"Passkey sign-in complete",
						verification.message,
					);
				}
				await logAuthMethodTelemetry(
					"passkey",
					"sign_in_completed",
					"Passkey sign-in completed.",
				);
				return;
			}

			throw new Error(
				result.message ||
					result.error ||
					"Passkey sign-in is not available right now.",
			);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Unable to start passkey sign-in right now.";
			setError(msg);
			await logAuthMethodTelemetry(
				"passkey",
				"sign_in_failed",
				`Passkey sign-in failed to start: ${msg}`,
			);
			notification.error("Passkey sign-in failed", msg);
		} finally {
			setPasskeySubmitting(false);
		}
	};

	// ═══════════════════════════════════════════════════════════════════════════
	// AGENT SHOWCASE COMPONENT
	// ═══════════════════════════════════════════════════════════════════════════
	const AgentShowcase = () => (
		<div
			className={cn(
				styles.agentShowcase,
				mounted ? styles.visible : styles.hidden,
			)}
		>
			{/* Main agent with glow */}
			<div className={styles.mainAgentWrap}>
				<div className={styles.agentGlow} />
				<div className={styles.mainAgentInner}>
					<AgentPixelMark
						profileId="koro"
						size={80}
						detailLevel="hero"
						expression="active"
					/>
				</div>
			</div>

			{/* Secondary agents */}
			<HStack gap={2} justify="center">
				{AGENT_IDS.filter((id) => id !== "koro").map((id, i) => (
					<div
						key={id}
						className={styles.secondaryAgent}
						style={{ animationDelay: `${400 + i * 100}ms` }}
					>
						<AgentPixelMark profileId={id} size={20} detailLevel="hero" />
					</div>
				))}
			</HStack>
		</div>
	);

	// ═══════════════════════════════════════════════════════════════════════════
	// SESSION / REDIRECT STATE
	// ═══════════════════════════════════════════════════════════════════════════
	const showSessionCard = loading || Boolean(user);

	if (showSessionCard) {
		const redirecting = Boolean(user && !loading);

		return (
			<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
				<div
					className={cn(
						styles.pageRoot,
						mounted ? styles.visible : styles.hidden,
					)}
				>
					{/* Agents */}
					<AgentShowcase />

					<Stack gap={6}>
						{/* Header */}
						<div className={styles.headerCenter}>
							<Badge
								color="primary"
								variant="soft"
								className={styles.statusBadge}
							>
								<span
									className={cn(
										styles.statusDot,
										styles.dotPrimary,
										styles.dotPulse,
									)}
								/>
								{redirecting ? "Redirecting" : "Preparing your session"}
							</Badge>

							<Text as="h1" size="2xl" weight="semibold" block>
								{redirecting
									? "Opening your dashboard"
									: "Checking your account"}
							</Text>

							<Text color="muted" size="sm" className={styles.headerCopy} block>
								{redirecting
									? redirectMessage
									: "Validating your sign-in status…"}
							</Text>
						</div>

						{/* Progress */}
						<Stack gap={3}>
							{redirecting && shouldPreloadDashboard ? (
								<div className={styles.dashboardLoaderWrap}>
									<AgentOrbitLoader size="sm" />
								</div>
							) : null}
							{redirecting ? (
								<Progress
									value={Math.max(8, redirectProgress)}
									color="primary"
									size="md"
									animated
								/>
							) : (
								<div className={styles.loadingTrack}>
									<div className={styles.loadingFill} />
								</div>
							)}

							<Text
								size="xs"
								color="muted"
								align="center"
								className={styles.progressLabel}
							>
								{redirecting
									? `${Math.max(8, redirectProgress)}%`
									: "Connecting…"}
							</Text>

							<AuthEnvDebugCard />
						</Stack>
					</Stack>
				</div>
			</AuthShell>
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// SENT STATE (email link sent)
	// ═══════════════════════════════════════════════════════════════════════════
	if (sent) {
		return (
			<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
				<div
					className={cn(
						styles.pageRoot,
						mounted ? styles.visible : styles.hidden,
					)}
				>
					{/* Agents */}
					<AgentShowcase />

					<Stack gap={6}>
						{/* Header */}
						<div className={styles.headerCenter}>
							<Badge
								color="success"
								variant="soft"
								className={styles.statusBadge}
							>
								<span
									className={cn(
										styles.statusDot,
										styles.dotSuccess,
										styles.dotPulse,
									)}
								/>
								Link sent
							</Badge>

							<Text as="h1" size="2xl" weight="semibold" block>
								Check your email
							</Text>

							<Text color="muted" size="sm" className={styles.headerCopy} block>
								We sent a sign-in link to your inbox.
							</Text>
						</div>

						{/* Content */}
						<Stack gap={4}>
							<Panel
								variant="default"
								padding="md"
								className={styles.emailPreview}
							>
								<Text size="sm" color="muted">
									If your account exists for{" "}
									<Text weight="semibold" color="default">
										{email.trim()}
									</Text>
									, we sent a sign-in link. Open that email on this device to
									continue.
								</Text>
							</Panel>

							<Button variant="primary" fluid onClick={() => setSent(false)}>
								Send another link
							</Button>

							<div className={styles.footerLinks}>
								<Link to="/signup" className={styles.primaryLink}>
									Need an account? Get started
								</Link>
								<Link to="/privacy" className={styles.mutedLink}>
									Privacy
								</Link>
							</div>

							<AuthEnvDebugCard />
						</Stack>
					</Stack>
				</div>
			</AuthShell>
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// DEFAULT LOGIN FORM
	// ═══════════════════════════════════════════════════════════════════════════
	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
			<div
				className={cn(
					styles.pageRoot,
					mounted ? styles.visible : styles.hidden,
				)}
			>
				{/* Agents */}
				<AgentShowcase />

				<Stack gap={6}>
					{/* Header */}
					<div className={styles.headerCenter}>
						<Badge
							color="primary"
							variant="soft"
							className={styles.statusBadge}
						>
							<span className={cn(styles.statusDot, styles.dotPrimary)} />
							Secure login
						</Badge>

						<Text as="h1" size="2xl" weight="semibold" block>
							Welcome back
						</Text>

						<Text color="muted" size="sm" className={styles.headerCopy} block>
							Sign in to continue to your workspace.
						</Text>
					</div>

					{/* Form */}
					<form className={styles.formContents} onSubmit={onSubmit} noValidate>
						<Stack gap={4}>
							{/* Passkey button */}
							{passkeyAvailable && (
								<>
									<Button
										variant="primary"
										fluid
										type="button"
										disabled={passkeySubmitting || submitting}
										loading={passkeySubmitting}
										onClick={() => void onPasskeySignIn()}
									>
										{passkeySubmitting ? "Starting passkey..." : "Use passkey"}
									</Button>

									<div className={styles.divider}>
										<div className={styles.dividerLineWrap}>
											<div className={styles.dividerLine} />
										</div>
										<div className={styles.dividerLabelWrap}>
											<Text
												size="xs"
												color="muted"
												className={styles.dividerLabel}
											>
												Or continue with email link
											</Text>
										</div>
									</div>
								</>
							)}

							{/* Email input */}
							<Input
								label="Email"
								type="email"
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@company.com"
								required
							/>

							{/* Honeypot (hidden) */}
							<div
								aria-hidden="true"
								style={{
									position: "absolute",
									left: "-10000px",
									top: "auto",
									width: 1,
									height: 1,
									overflow: "hidden",
								}}
							>
								<label htmlFor={`hp-${honeypotFieldName}`}>Company</label>
								<input
									id={`hp-${honeypotFieldName}`}
									name={honeypotFieldName}
									type="text"
									autoComplete="off"
									tabIndex={-1}
									value={honeypot}
									onChange={(event) => setHoneypot(event.target.value)}
								/>
							</div>

							{/* Captcha */}
							<CaptchaChallenge
								token={captchaToken}
								onTokenChange={setCaptchaToken}
								disabled={submitting}
							/>

							{/* Error message */}
							{error && (
								<Panel
									variant="outline"
									padding="sm"
									className={styles.errorPanel}
								>
									<Text size="sm" color="danger">
										{error}
									</Text>
								</Panel>
							)}

							{/* Submit button */}
							<Button
								variant="primary"
								fluid
								type="submit"
								disabled={!canSubmit}
								loading={submitting}
							>
								{submitting ? "Sending link..." : "Send sign-in link"}
							</Button>

							{/* Footer links */}
							<div className={styles.footerLinks}>
								<Text size="sm" color="muted">
									No account yet?{" "}
									<Link to="/signup" className={styles.primaryLink}>
										Get started
									</Link>
								</Text>
								<Link to="/privacy" className={styles.mutedLink}>
									Privacy
								</Link>
							</div>

							<AuthEnvDebugCard />
						</Stack>
					</form>
				</Stack>
			</div>
		</AuthShell>
	);
}

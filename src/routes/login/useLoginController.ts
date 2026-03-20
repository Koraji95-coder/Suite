import {
	type PublicKeyCredentialRequestOptionsJSON,
	startAuthentication,
} from "@simplewebauthn/browser";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildAgentPairingSearchFromLocation } from "../../auth/agentPairingParams";
import { resolveAuthRedirect } from "../../auth/authRedirect";
import { useNotification } from "../../auth/NotificationContext";
import {
	completePasskeyCallback,
	completePasskeySignInVerification,
	startPasskeySignIn,
} from "../../auth/passkeyAuthApi";
import {
	fetchPasskeyCapability,
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
} from "../../auth/passkeyCapabilityApi";
import { markPasskeySignInPending } from "../../auth/passkeySessionState";
import { useAuth } from "../../auth/useAuth";
import { loadDashboardOverviewFromBackend } from "../../components/apps/dashboard/dashboardOverviewService";
import { logger } from "../../lib/logger";
import { logAuthMethodTelemetry } from "../../services/securityEventService";

const DASHBOARD_REDIRECT_MIN_MS = 10_000;
const DASHBOARD_REDIRECT_MIN_PROGRESS = 4;
const DASHBOARD_REDIRECT_MAX_PROGRESS_BEFORE_READY = 95;

type LocationState = { from?: string };

function isDashboardDestination(path: string): boolean {
	const normalized = path.split("?")[0].replace(/\/+$/, "");
	return normalized === "/app/home" || normalized === "/app/dashboard";
}

type LoginController = {
	loading: boolean;
	user: unknown;
	email: string;
	honeypot: string;
	honeypotFieldName: string;
	captchaToken: string;
	submitting: boolean;
	passkeySubmitting: boolean;
	passkeyAvailable: boolean;
	canSubmit: boolean;
	error: string;
	sent: boolean;
	redirectProgress: number;
	redirectMessage: string;
	shouldPreloadDashboard: boolean;
	setEmail: (value: string) => void;
	setCaptchaToken: (value: string) => void;
	setHoneypot: (value: string) => void;
	resetSent: () => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
	onPasskeySignIn: () => Promise<void>;
};

export function useLoginController(): LoginController {
	const { user, loading, signIn } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const notification = useNotification();
	const agentPairingSearch = useMemo(
		() => buildAgentPairingSearchFromLocation(location.search, location.hash),
		[location.hash, location.search],
	);
	const hasAgentPairingParams = agentPairingSearch.length > 0;
	const from = useMemo(() => {
		if (hasAgentPairingParams) {
			return `/agent/pairing-callback${agentPairingSearch}`;
		}
		return (location.state as LocationState | null)?.from ?? "/app/home";
	}, [agentPairingSearch, hasAgentPairingParams, location.state]);

	const [email, setEmail] = useState("");
	const [captchaToken, setCaptchaToken] = useState("");
	const [honeypot, setHoneypot] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [passkeySubmitting, setPasskeySubmitting] = useState(false);
	const [backendPasskeyReady, setBackendPasskeyReady] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState("");
	const [redirectProgress, setRedirectProgress] = useState(0);
	const [redirectMessage, setRedirectMessage] = useState(
		"Preparing your session...",
	);
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
	const frontendPasskeyEnabled = useMemo(() => isFrontendPasskeyEnabled(), []);
	const browserPasskeySupported = useMemo(
		() => isBrowserPasskeySupported(),
		[],
	);
	const passkeyAvailable = useMemo(
		() =>
			frontendPasskeyEnabled && browserPasskeySupported && backendPasskeyReady,
		[frontendPasskeyEnabled, browserPasskeySupported, backendPasskeyReady],
	);
	const canSubmit = useMemo(() => {
		if (loading || submitting) return false;
		if (email.trim().length === 0) return false;
		if (requiresCaptcha) return captchaToken.trim().length > 0;
		return true;
	}, [captchaToken, email, loading, requiresCaptcha, submitting]);

	useEffect(() => {
		if (!frontendPasskeyEnabled || !browserPasskeySupported) {
			setBackendPasskeyReady(false);
			return;
		}

		let active = true;
		void fetchPasskeyCapability()
			.then((payload) => {
				if (!active) return;
				const capability = payload.passkey;
				const ready = Boolean(
					capability.enabled &&
						capability.handlers_ready &&
						capability.config_ready,
				);
				setBackendPasskeyReady(ready);
				if (ready) return;

				logger.info(
					"Passkey capability probe reports passkey unavailable; hiding passkey login action.",
					"LoginPage",
					{
						enabled: capability.enabled,
						provider: capability.provider,
						rollout_state: capability.rollout_state,
						handlers_ready: capability.handlers_ready,
						config_ready: capability.config_ready,
						config_missing: capability.config_missing,
					},
				);
			})
			.catch((capabilityError) => {
				if (!active) return;
				setBackendPasskeyReady(false);
				logger.warn(
					"Passkey capability probe failed; passkey sign-in remains hidden.",
					"LoginPage",
					{ error: capabilityError },
				);
			});

		return () => {
			active = false;
		};
	}, [browserPasskeySupported, frontendPasskeyEnabled]);

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
						Math.min(baseline, DASHBOARD_REDIRECT_MAX_PROGRESS_BEFORE_READY),
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
			if (timeoutId !== null) window.clearTimeout(timeoutId);
			if (minimumDelayTimerId !== null)
				window.clearTimeout(minimumDelayTimerId);
			if (baselineProgressTimerId !== null) {
				window.clearInterval(baselineProgressTimerId);
			}
			if (minimumDelayResolve) {
				minimumDelayResolve();
				minimumDelayResolve = null;
			}
			if (rafId !== null) window.cancelAnimationFrame(rafId);
		};
	}, [from, loading, navigate, shouldPreloadDashboard, user]);

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
		if (passkeyCallbackHandledRef.current === callbackKey) return;
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

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
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
				const credential = await startAuthentication({ optionsJSON: options });
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
		} finally {
			setPasskeySubmitting(false);
		}
	};

	return {
		loading,
		user,
		email,
		honeypot,
		honeypotFieldName,
		captchaToken,
		submitting,
		passkeySubmitting,
		passkeyAvailable,
		canSubmit,
		error,
		sent,
		redirectProgress,
		redirectMessage,
		shouldPreloadDashboard,
		setEmail,
		setCaptchaToken,
		setHoneypot,
		resetSent: () => setSent(false),
		onSubmit,
		onPasskeySignIn,
	};
}

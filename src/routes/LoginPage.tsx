import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthEnvDebugCard from "../auth/AuthEnvDebugCard";
import CaptchaChallenge from "../auth/CaptchaChallenge";
import AuthShell from "../auth/AuthShell";
import { useNotification } from "../auth/NotificationContext";
import {
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
} from "../auth/passkeyCapabilityApi";
import {
	completePasskeySignInVerification,
	completePasskeyCallback,
	startPasskeySignIn,
} from "../auth/passkeyAuthApi";
import { markPasskeySignInPending } from "../auth/passkeySessionState";
import {
	startAuthentication,
	type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { resolveAuthRedirect } from "../auth/authRedirect";
import { useAuth } from "../auth/useAuth";
import { logger } from "../lib/logger";
import { logAuthMethodTelemetry } from "../services/securityEventService";

type LocationState = { from?: string };

export default function LoginPage() {
	const { user, loading, signIn } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const from = (location.state as LocationState | null)?.from ?? "/app/home";

	const notification = useNotification();
	const [email, setEmail] = useState("");
	const [captchaToken, setCaptchaToken] = useState("");
	const [honeypot, setHoneypot] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [passkeySubmitting, setPasskeySubmitting] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState("");
	const [redirectProgress, setRedirectProgress] = useState(0);
	const passkeyCallbackHandledRef = useRef("");
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

	useEffect(() => {
		if (!(user && !loading)) {
			setRedirectProgress(0);
			return;
		}

		const durationMs = 1100;
		const start = performance.now();
		let rafId: number | null = null;

		const tick = (now: number) => {
			const elapsed = now - start;
			const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
			setRedirectProgress(pct);
			if (elapsed >= durationMs) {
				navigate(from, { replace: true });
				return;
			}
			rafId = window.requestAnimationFrame(tick);
		};

		rafId = window.requestAnimationFrame(tick);

		return () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
			}
		};
	}, [from, loading, navigate, user]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const passkeyState = (params.get("passkey_state") || "").trim();
		const passkeyStatus = (params.get("passkey_status") || "").trim().toLowerCase();
		const passkeyIntent = (params.get("passkey_intent") || "").trim().toLowerCase();
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
		if (!passkeyState || (passkeyStatus !== "success" && passkeyStatus !== "failed")) {
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

	const showSessionCard = loading || Boolean(user);

	if (showSessionCard) {
		const redirecting = Boolean(user && !loading);
		return (
			<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
				<div className="mb-6">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
						<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
						{redirecting ? "Redirecting" : "Preparing your session"}
					</div>
					<h1 className="text-2xl font-semibold tracking-tight">
						{redirecting ? "Opening your dashboard" : "Checking your account"}
					</h1>
					<p className="mt-2 text-sm leading-relaxed [color:var(--text-muted)]">
						{redirecting
							? "Email confirmed. We're signing you in now."
							: "Validating your sign-in status\u2026"}
					</p>
				</div>

				<div className="grid gap-3">
					<div
						className="h-2 w-full overflow-hidden rounded-full [background:var(--surface-2)]"
						aria-hidden="true"
					>
						<div
							className={`h-full rounded-full [background:var(--primary)] ${redirecting ? "" : "w-[35%] animate-[loading-slide_1.2s_ease-in-out_infinite]"}`}
							style={
								redirecting
									? { width: `${Math.max(8, redirectProgress)}%` }
									: undefined
							}
						/>
					</div>
					<p className="m-0 text-xs [color:var(--text-muted)]">
						{redirecting ? `${Math.max(8, redirectProgress)}%` : "Connecting\u2026"}
					</p>
					<AuthEnvDebugCard />
				</div>
			</AuthShell>
		);
	}

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
				const options = result.public_key as PublicKeyCredentialRequestOptionsJSON;
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
				if (verification.completed === false || verification.status === "failed") {
					throw new Error(
						verification.message || "Passkey sign-in could not be completed.",
					);
				}
				if (verification.message) {
					notification.success("Passkey sign-in complete", verification.message);
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

	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
			<div className="mb-8">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
					<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
					Secure login
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
				<p className="mt-2 text-sm leading-relaxed [color:var(--text-muted)]">
					Sign in to continue to your workspace.
				</p>
			</div>

			{sent ? (
				<div className="grid gap-4">
					<div className="rounded-lg border px-3 py-2.5 text-sm leading-relaxed [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]">
						If your account exists for{" "}
						<strong className="[color:var(--text)]">{email.trim()}</strong>, we
						sent a sign-in link. Open that email on this device to continue.
					</div>

					<button
						type="button"
						className="auth-submit-btn"
						onClick={() => setSent(false)}
					>
						Send another link
					</button>

					<div className="flex flex-wrap items-center justify-between gap-3 text-sm [color:var(--text-muted)]">
						<Link
							to="/signup"
							className="font-medium underline-offset-2 hover:underline [color:var(--primary)]"
						>
							Need an account? Get started
						</Link>
						<Link
							to="/privacy"
							className="font-medium underline-offset-2 hover:underline [color:var(--text-muted)] hover:[color:var(--text)]"
						>
							Privacy
						</Link>
					</div>

					<AuthEnvDebugCard />
				</div>
			) : (
				<form className="grid gap-4" onSubmit={onSubmit} noValidate>
					{passkeyAvailable ? (
						<button
							className="auth-submit-btn"
							type="button"
							disabled={passkeySubmitting || submitting}
							onClick={() => void onPasskeySignIn()}
						>
							{passkeySubmitting ? (
								<span className="inline-flex items-center gap-2">
									<span className="auth-spinner" />
									Starting passkey...
								</span>
							) : (
								"Use passkey"
							)}
						</button>
					) : null}

					{passkeyAvailable ? (
						<div className="text-center text-xs [color:var(--text-muted)]">
							Or continue with email link
						</div>
					) : null}

					<div className="grid gap-1.5">
						<label className="text-sm font-medium" htmlFor="email">
							Email
						</label>
						<input
							id="email"
							className="auth-input-field"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@company.com"
							required
						/>
					</div>

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

					<CaptchaChallenge
						token={captchaToken}
						onTokenChange={setCaptchaToken}
						disabled={submitting}
					/>

					{error ? (
						<div className="rounded-lg border px-3 py-2 text-sm [border-color:color-mix(in_oklab,var(--danger)_45%,var(--border))] [background:color-mix(in_oklab,var(--danger)_8%,var(--surface))] [color:var(--danger)]">
							{error}
						</div>
					) : null}

					<button
						className="auth-submit-btn mt-1"
						type="submit"
						disabled={!canSubmit}
					>
						{submitting ? (
							<span className="inline-flex items-center gap-2">
								<span className="auth-spinner" />
								Sending link...
							</span>
						) : (
							"Send sign-in link"
						)}
					</button>

					<div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-sm [color:var(--text-muted)]">
						<span>
							No account yet?{" "}
							<Link
								to="/signup"
								className="font-medium underline-offset-2 hover:underline [color:var(--primary)]"
							>
								Get started
							</Link>
						</span>
						<Link
							to="/privacy"
							className="font-medium underline-offset-2 hover:underline [color:var(--text-muted)] hover:[color:var(--text)]"
						>
							Privacy
						</Link>
					</div>

					<AuthEnvDebugCard />
				</form>
			)}
		</AuthShell>
	);
}

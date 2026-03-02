// src/routes/app/settings/AccountSettings.tsx
import { KeyRound, LogOut, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
	fetchPasskeyCapability,
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
	type PasskeyCapability,
} from "../../auth/passkeyCapabilityApi";
import {
	completePasskeyCallback,
	startPasskeyEnrollment,
} from "../../auth/passkeyAuthApi";
import { useAuth } from "../../auth/useAuth";
import { agentService } from "../../services/agentService";
import {
	logAuthMethodTelemetry,
	logSecurityEvent,
} from "../../services/securityEventService";
import { supabase } from "@/supabase/client";

export default function AccountSettings() {
	const { user, signOut } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const [message, setMessage] = useState<string>("");
	const [isSigningOutAll, setIsSigningOutAll] = useState(false);
	const [isResettingAgent, setIsResettingAgent] = useState(false);
	const [isStartingPasskeyEnroll, setIsStartingPasskeyEnroll] = useState(false);
	const [passkeyCapability, setPasskeyCapability] =
		useState<PasskeyCapability | null>(null);
	const [passkeyLoading, setPasskeyLoading] = useState(true);
	const [passkeyError, setPasskeyError] = useState("");
	const passkeyCallbackHandledRef = useRef("");

	const frontendPasskeyEnabled = useMemo(() => isFrontendPasskeyEnabled(), []);
	const browserPasskeySupported = useMemo(() => isBrowserPasskeySupported(), []);
	const canStartPasskeyEnrollment = Boolean(
		frontendPasskeyEnabled &&
			browserPasskeySupported &&
			passkeyCapability?.enabled &&
			passkeyCapability?.handlers_ready &&
			passkeyCapability?.config_ready,
	);

	const loadPasskeyCapability = async () => {
		setPasskeyLoading(true);
		setPasskeyError("");

		try {
			const result = await fetchPasskeyCapability();
			setPasskeyCapability(result.passkey);
		} catch (err: unknown) {
			setPasskeyCapability(null);
			setPasskeyError(
				err instanceof Error
					? err.message
					: "Unable to load passkey capability.",
			);
		} finally {
			setPasskeyLoading(false);
		}
	};

	useEffect(() => {
		void loadPasskeyCapability();
	}, []);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const passkeyState = (params.get("passkey_state") || "").trim();
		const passkeyStatus = (params.get("passkey_status") || "").trim().toLowerCase();
		const passkeyIntent = (params.get("passkey_intent") || "").trim().toLowerCase();
		const passkeyEmail = (params.get("passkey_email") || "").trim();
		const passkeyErrorValue = (params.get("passkey_error") || "").trim();
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
			passkeyErrorValue,
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
			setIsStartingPasskeyEnroll(true);
			try {
				const result = await completePasskeyCallback({
					state: passkeyState,
					status: passkeyStatus as "success" | "failed",
					intent: passkeyIntent || "enroll",
					email: passkeyEmail || undefined,
					error: passkeyErrorValue || undefined,
					signature: passkeySignature || undefined,
					timestamp: passkeyTimestamp || undefined,
				});

				if (result.intent === "enroll" && result.completed === false) {
					await logAuthMethodTelemetry(
						"passkey",
						"enroll_failed",
						`Passkey enrollment callback failed: ${result.message || "unknown error"}`,
					);
				}
				if (result.intent === "enroll" && result.completed === true) {
					await logAuthMethodTelemetry(
						"passkey",
						"enroll_completed",
						"Passkey enrollment callback completed successfully.",
					);
				}

				if (result.redirect_to) {
					window.location.assign(result.redirect_to);
					return;
				}
				if (result.resume_url) {
					window.location.assign(result.resume_url);
					return;
				}

				if (!active) return;
				setMessage(result.message || "Passkey callback processed.");
				void loadPasskeyCapability();
			} catch (err: unknown) {
				if (!active) return;
				const msg =
					err instanceof Error
						? err.message
						: "Unable to complete passkey callback.";
				setMessage(msg);
				await logAuthMethodTelemetry(
					"passkey",
					"enroll_failed",
					`Passkey enrollment callback completion failed: ${msg}`,
				);
			} finally {
				if (active) {
					setIsStartingPasskeyEnroll(false);
					clearCallbackParams();
				}
			}
		};

		void completeCallback();
		return () => {
			active = false;
		};
	}, [location.pathname, location.search, navigate]);

	const startPasskeyEnrollFlow = async () => {
		if (isStartingPasskeyEnroll) return;
		setIsStartingPasskeyEnroll(true);
		setMessage("");

		await logAuthMethodTelemetry(
			"passkey",
			"enroll_started",
			"Passkey enrollment flow started from account settings.",
		);

		try {
			const redirectTo =
				typeof window !== "undefined"
					? `${window.location.origin}/app/settings`
					: undefined;
			const result = await startPasskeyEnrollment(redirectTo);
			if (result.mode === "redirect" && result.redirect_url) {
				await logAuthMethodTelemetry(
					"passkey",
					"enroll_redirected",
					`Passkey enrollment redirected to provider: ${result.provider_label || result.provider || "unknown"}.`,
				);
				window.location.assign(result.redirect_url);
				return;
			}

			throw new Error(
				result.message ||
					result.error ||
					"Passkey enrollment is not available right now.",
			);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Unable to start passkey enrollment right now.";
			setMessage(msg);
			await logAuthMethodTelemetry(
				"passkey",
				"enroll_failed",
				`Passkey enrollment failed to start: ${msg}`,
			);
		} finally {
			setIsStartingPasskeyEnroll(false);
		}
	};

	const signOutAllSessions = async () => {
		if (isSigningOutAll) return;
		setIsSigningOutAll(true);
		setMessage("");

		try {
			await agentService.unpair();
			const { error } = await supabase.auth.signOut({ scope: "global" });
			if (error) throw error;
			await logSecurityEvent(
				"auth_sign_out_global",
				"User signed out all active sessions.",
			);
			setMessage("Signed out all sessions.");
		} catch (err: unknown) {
			setMessage(
				err instanceof Error ? err.message : "Failed to sign out all sessions.",
			);
		} finally {
			setIsSigningOutAll(false);
		}
	};

	const resetTrustedAgentDevice = async () => {
		if (isResettingAgent) return;
		setIsResettingAgent(true);
		setMessage("");

		try {
			await agentService.unpair();
			setMessage("Trusted agent pairing removed for this device.");
		} catch (err: unknown) {
			setMessage(
				err instanceof Error
					? err.message
					: "Failed to reset trusted agent pairing.",
			);
		} finally {
			setIsResettingAgent(false);
		}
	};

	return (
		<div className="grid gap-3">
			<h3 className="text-lg font-semibold tracking-tight [color:var(--text)]">
				Account
				<span className="ml-2 text-sm font-normal [color:var(--text-muted)]">
					Security and account actions.
				</span>
			</h3>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
				<div className="flex items-start gap-2">
					<KeyRound size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Passwordless mode
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							This workspace uses email-link sign-in only. Password resets are
							disabled.
						</div>
					</div>
				</div>

				<div className="grid gap-2 rounded-xl border px-3 py-2.5 text-sm [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]">
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-md border px-2 py-0.5 text-[11px] font-semibold [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]">
							Passkey rollout
						</span>
						<span className="rounded-md border px-2 py-0.5 text-[11px] [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]">
							Browser: {browserPasskeySupported ? "supported" : "unsupported"}
						</span>
						<span className="rounded-md border px-2 py-0.5 text-[11px] [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]">
							Frontend flag: {frontendPasskeyEnabled ? "on" : "off"}
						</span>
						<span className="rounded-md border px-2 py-0.5 text-[11px] [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]">
							Backend:{" "}
							{passkeyLoading
								? "checking"
								: passkeyCapability?.rollout_state || "unknown"}
						</span>
					</div>

					{passkeyLoading ? (
						<div>Checking passkey capability…</div>
					) : passkeyError ? (
						<div className="[color:var(--danger)]">{passkeyError}</div>
					) : !browserPasskeySupported ? (
						<div>
							This browser does not expose passkey APIs. Use a compatible
							browser/device for enrollment.
						</div>
					) : !frontendPasskeyEnabled ? (
						<div>
							Passkey UI is disabled in frontend env
							(<code>VITE_AUTH_PASSKEY_ENABLED=false</code>).
						</div>
					) : !passkeyCapability ? (
						<div>Passkey capability data is unavailable.</div>
					) : !passkeyCapability.enabled ? (
						<div>
							Backend passkey rollout is disabled
							(<code>AUTH_PASSKEY_ENABLED=false</code>).
						</div>
					) : !passkeyCapability.config_ready ? (
						<div>
							Passkey backend config is incomplete. Missing:{" "}
							{passkeyCapability.config_missing.length > 0
								? passkeyCapability.config_missing.join(", ")
								: "unknown"}
						</div>
					) : !passkeyCapability.handlers_ready ? (
						<div>
							Passkey provider is selected, but start handlers are not available
							for this provider in the current build.
						</div>
					) : (
						<div>
							Passkey capability probe is configured for{" "}
							<strong>{passkeyCapability.provider_label}</strong>. Enrollment
							and sign-in start handlers are enabled.
						</div>
					)}

					{passkeyCapability?.warnings?.length ? (
						<div className="text-xs [color:var(--text-muted)]">
							{passkeyCapability.warnings.join(" ")}
						</div>
					) : null}
					{passkeyCapability?.next_step ? (
						<div className="text-xs [color:var(--text-muted)]">
							Next: {passkeyCapability.next_step}
						</div>
					) : null}

					<div className="flex flex-wrap items-center gap-2">
						<button
							className="inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:[background:var(--surface)] [border-color:var(--border)] [background:transparent] [color:var(--text)]"
							type="button"
							onClick={() => void loadPasskeyCapability()}
							disabled={passkeyLoading}
						>
							{passkeyLoading ? "Refreshing…" : "Refresh passkey status"}
						</button>

						<button
							className="inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface)] [border-color:var(--border)] [background:transparent] [color:var(--text)]"
							type="button"
							onClick={() => void startPasskeyEnrollFlow()}
							disabled={
								isStartingPasskeyEnroll ||
								passkeyLoading ||
								!canStartPasskeyEnrollment
							}
							title={
								canStartPasskeyEnrollment
									? "Start passkey enrollment"
									: "Passkey enrollment is unavailable until rollout flags/provider config are ready."
							}
						>
							{isStartingPasskeyEnroll
								? "Starting enrollment…"
								: "Start passkey enrollment"}
						</button>
					</div>
				</div>

				{message ? (
					<div className="text-xs [color:var(--text-muted)]">{message}</div>
				) : null}
			</div>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
				<div className="flex items-start gap-2">
					<LogOut size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Sign out
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							End your current session.
						</div>
					</div>
				</div>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					type="button"
					onClick={() => void signOut()}
				>
					Sign out
				</button>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					type="button"
					disabled={isSigningOutAll}
					onClick={() => void signOutAllSessions()}
				>
					{isSigningOutAll ? "Signing out all…" : "Sign out all devices"}
				</button>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					type="button"
					disabled={isResettingAgent}
					onClick={() => void resetTrustedAgentDevice()}
				>
					{isResettingAgent
						? "Resetting agent trust…"
						: "Reset trusted agent pairing"}
				</button>

				<div className="text-xs [color:var(--text-muted)]">
					Last sign-in: {user?.last_sign_in_at ?? "unknown"}
				</div>
			</div>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_10%,var(--surface))]">
				<div className="flex items-start gap-2">
					<Trash2 size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Delete account
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							This usually requires a server-side action. We’ll wire it when
							your backend policy is ready.
						</div>
					</div>
				</div>

				<button
					className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_18%,transparent)] [color:var(--danger)]"
					type="button"
					disabled
					title="Requires server-side endpoint / admin policy"
				>
					Delete account (coming soon)
				</button>

				<div className="text-xs [color:var(--text-muted)]">
					Signed in as: <strong>{user?.email ?? "unknown"}</strong>
				</div>
			</div>
		</div>
	);
}

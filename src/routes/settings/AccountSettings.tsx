// src/routes/app/settings/AccountSettings.tsx
import {
	Bot,
	Database,
	HardDrive,
	KeyRound,
	LogOut,
	Mail,
	RefreshCw,
	Save,
	Settings2,
	Shield,
	ShieldCheck,
	User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
	fetchPasskeyCapability,
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
	type PasskeyCapability,
} from "../../auth/passkeyCapabilityApi";
import {
	completePasskeyCallback,
} from "../../auth/passkeyAuthApi";
import { useAuth } from "../../auth/useAuth";
import {
	agentService,
	type AgentPairingAction,
} from "../../services/agentService";
import {
	logAuthMethodTelemetry,
	logSecurityEvent,
} from "../../services/securityEventService";
import { supabase } from "@/supabase/client";

type StatusTone = "success" | "danger" | "warning" | "muted";
type PanelTone = "primary" | "accent" | "neutral";

function getPanelToneColor(tone: PanelTone) {
	if (tone === "accent") return "var(--accent)";
	if (tone === "neutral") return "var(--text-muted)";
	return "var(--primary)";
}

function getPanelGradientStyle(tone: PanelTone) {
	const main = getPanelToneColor(tone);
	return {
		borderColor: `color-mix(in_srgb,${main} 26%,var(--border))`,
		background: `linear-gradient(128deg,color-mix(in_srgb,${main} 15%,var(--surface)) 0%,var(--surface) 56%,color-mix(in_srgb,var(--accent) 10%,var(--surface)) 100%)`,
		boxShadow: `inset 0 1px 0 color-mix(in_srgb,#ffffff 7%,transparent), 0 10px 30px color-mix(in_srgb,${main} 12%,transparent)`,
	} as const;
}

function SectionIconBadge({
	icon: Icon,
	tone = "primary",
}: {
	icon: any;
	tone?: "primary" | "accent" | "neutral";
}) {
	const toneColor =
		tone === "accent"
			? "var(--accent)"
			: tone === "neutral"
				? "var(--text-muted)"
				: "var(--primary)";
	return (
		<span
			className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg border"
			style={{
				borderColor: `color-mix(in_srgb,${toneColor} 38%,var(--border))`,
				background: `linear-gradient(145deg,color-mix(in_srgb,${toneColor} 28%,transparent),color-mix(in_srgb,var(--surface-2) 92%,transparent))`,
				color: "var(--text)",
				boxShadow: `0 8px 24px color-mix(in_srgb,${toneColor} 24%,transparent)`,
			}}
		>
			<Icon size={15} />
		</span>
	);
}

function SecurityStatusTile({
	title,
	value,
	tone,
	icon: Icon,
}: {
	title: string;
	value: string;
	tone: StatusTone;
	icon: any;
}) {
	const toneStyles: Record<StatusTone, { main: string }> = {
		success: {
			main: "var(--success)",
		},
		danger: {
			main: "var(--danger)",
		},
		warning: {
			main: "var(--warning)",
		},
		muted: {
			main: "var(--text-muted)",
		},
	};
	const style = toneStyles[tone];

	return (
		<div
			className="relative overflow-hidden rounded-xl border px-3 py-2.5"
			style={{
				borderColor: "var(--border)",
				background: `linear-gradient(125deg,color-mix(in_srgb,${style.main} 16%,var(--surface)) 0%,var(--surface) 52%,color-mix(in_srgb,var(--accent) 12%,var(--surface)) 100%)`,
				boxShadow: `inset 0 1px 0 color-mix(in_srgb,#ffffff 7%,transparent), 0 10px 28px color-mix(in_srgb,${style.main} 12%,transparent)`,
			}}
		>
			<div
				className="pointer-events-none absolute -right-4 -top-6 h-12 w-12 rounded-full blur-xl"
				style={{
					background: `color-mix(in_srgb,${style.main} 34%,transparent)`,
				}}
			/>
			<div className="relative z-[1] flex items-start justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border"
						style={{
							borderColor: `color-mix(in_srgb,${style.main} 46%,var(--border))`,
							background: `color-mix(in_srgb,${style.main} 20%,transparent)`,
							color: "var(--text)",
						}}
					>
						<Icon size={13} />
					</span>
					<div className="text-[11px] font-medium uppercase tracking-wide [color:var(--text-muted)]">
						{title}
					</div>
				</div>
				<div className="flex items-center">
					<span className="relative inline-flex h-2.5 w-2.5">
						<span
							className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
							style={{
								background: `color-mix(in_srgb,${style.main} 62%,transparent)`,
							}}
						/>
						<span
							className="relative inline-flex h-2.5 w-2.5 rounded-full border"
							style={{
								borderColor: `color-mix(in_srgb,${style.main} 58%,var(--border))`,
								background: style.main,
								boxShadow: `0 0 10px color-mix(in_srgb,${style.main} 60%,transparent)`,
							}}
						/>
					</span>
				</div>
			</div>
			<div className="relative z-[1] mt-2">
				<span
					className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
					style={{
						borderColor: `color-mix(in_srgb,${style.main} 50%,var(--border))`,
						background: `color-mix(in_srgb,${style.main} 18%,transparent)`,
						color: "var(--text)",
					}}
				>
					{value}
				</span>
			</div>
		</div>
	);
}

export default function AccountSettings() {
	const { user, profile, signOut, sessionAuthMethod, updateProfile } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const usesBroker = useMemo(() => agentService.usesBroker(), []);
	const passkeyCallbackHandledRef = useRef("");
	const agentChallengeHandledRef = useRef("");

	const [displayName, setDisplayName] = useState("");
	const [accountEmail, setAccountEmail] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [profileSaved, setProfileSaved] = useState(false);
	const [profileError, setProfileError] = useState("");

	const [isSigningOutAll, setIsSigningOutAll] = useState(false);
	const [accountActionMessage, setAccountActionMessage] = useState("");

	const [, setIsStartingPasskeyEnroll] = useState(false);
	const [passkeyCapability, setPasskeyCapability] =
		useState<PasskeyCapability | null>(null);
	const [passkeyLoading, setPasskeyLoading] = useState(true);
	const [, setPasskeyError] = useState("");
	const [, setPasskeyNotice] = useState("");

	const [agentHealthy, setAgentHealthy] = useState<boolean | null>(null);
	const [agentPaired, setAgentPaired] = useState(false);
	const [agentLoading, setAgentLoading] = useState(true);
	const [agentPairingCode, setAgentPairingCode] = useState("");
	const [isAgentActionBusy, setIsAgentActionBusy] = useState(false);
	const [agentError, setAgentError] = useState("");
	const [agentNotice, setAgentNotice] = useState("");

	const frontendPasskeyEnabled = useMemo(() => isFrontendPasskeyEnabled(), []);
	const browserPasskeySupported = useMemo(() => isBrowserPasskeySupported(), []);
	const canSaveProfile = useMemo(() => {
		if (!user || isSavingProfile) return false;
		return displayName.trim().length > 0 && accountEmail.trim().length > 0;
	}, [accountEmail, displayName, isSavingProfile, user]);

	const clearAgentChallengeParams = useCallback(() => {
		const params = new URLSearchParams(location.search);
		if (!params.has("agent_challenge") && !params.has("agent_action")) return;
		params.delete("agent_challenge");
		params.delete("agent_action");
		const search = params.toString();
		navigate(
			{
				pathname: location.pathname,
				search: search ? `?${search}` : "",
			},
			{ replace: true },
		);
	}, [location.pathname, location.search, navigate]);

	const clearAgentPairingCodeParams = useCallback(() => {
		const params = new URLSearchParams(location.search);
		if (!params.has("agent_pairing_code") && !params.has("agent_pairing_notice")) {
			return;
		}
		params.delete("agent_pairing_code");
		params.delete("agent_pairing_notice");
		const search = params.toString();
		navigate(
			{
				pathname: location.pathname,
				search: search ? `?${search}` : "",
			},
			{ replace: true },
		);
	}, [location.pathname, location.search, navigate]);

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

	const refreshAgentStatus = useCallback(async () => {
		setAgentLoading(true);
		try {
			const isHealthy = await agentService.healthCheck();
			setAgentHealthy(isHealthy);

			if (isHealthy && user?.id) {
				await agentService.restorePairingForActiveUser();
			}

			const pairedState = await agentService.refreshPairingStatus();
			setAgentPaired(pairedState);
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error
					? err.message
					: "Unable to refresh agent status.",
			);
		} finally {
			setAgentLoading(false);
		}
	}, [user?.id]);

	useEffect(() => {
		void loadPasskeyCapability();
		void refreshAgentStatus();
	}, [refreshAgentStatus]);

	useEffect(() => {
		if (agentHealthy === true && agentPaired) return;
		const timer = window.setInterval(() => {
			void refreshAgentStatus();
		}, 5000);
		return () => window.clearInterval(timer);
	}, [agentHealthy, agentPaired, refreshAgentStatus]);

	useEffect(() => {
		setDisplayName(profile?.display_name ?? "");
		setAccountEmail(profile?.email ?? user?.email ?? "");
	}, [profile?.display_name, profile?.email, user?.email]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const candidateCode = (params.get("agent_pairing_code") || "")
			.trim()
			.replace(/\D+/g, "")
			.slice(0, 6);
		if (candidateCode.length !== 6) return;

		setAgentPairingCode(candidateCode);
		setAgentNotice("Pairing code loaded from your email link.");
		setAgentError("");
		clearAgentPairingCodeParams();
	}, [clearAgentPairingCodeParams, location.search]);

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
				setPasskeyNotice(result.message || "Passkey callback processed.");
				void loadPasskeyCapability();
			} catch (err: unknown) {
				if (!active) return;
				const msg =
					err instanceof Error
						? err.message
						: "Unable to complete passkey callback.";
				setPasskeyNotice(msg);
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

	useEffect(() => {
		if (!usesBroker || !user?.id) return;
		const params = new URLSearchParams(location.search);
		const challengeId = (params.get("agent_challenge") || "").trim();
		const action = (params.get("agent_action") || "").trim().toLowerCase();
		if (!challengeId || (action !== "pair" && action !== "unpair")) return;

		const handleKey = `${action}:${challengeId}`;
		if (agentChallengeHandledRef.current === handleKey) {
			return;
		}
		agentChallengeHandledRef.current = handleKey;

		let active = true;
		const confirm = async () => {
			setAgentError("");
			setAgentNotice(
				action === "pair"
					? "Verifying pair request..."
					: "Verifying unpair request...",
			);
			setIsAgentActionBusy(true);
			try {
				await agentService.confirmPairingVerification(
					action as AgentPairingAction,
					challengeId,
				);
				if (!active) return;
				setAgentNotice(
					action === "pair"
						? "Pairing verified. Agent access is active."
						: "Unpair verified. Agent access has been removed.",
				);
			} catch (err: unknown) {
				if (!active) return;
				setAgentError(
					err instanceof Error
						? err.message
						: "Unable to verify pairing action.",
				);
				setAgentNotice("");
			} finally {
				await refreshAgentStatus();
				if (active) {
					setIsAgentActionBusy(false);
					clearAgentChallengeParams();
				}
			}
		};

		void confirm();
		return () => {
			active = false;
		};
	}, [
		clearAgentChallengeParams,
		location.search,
		refreshAgentStatus,
		usesBroker,
		user?.id,
	]);

	const saveAccountProfile = async () => {
		if (!canSaveProfile) return;
		setIsSavingProfile(true);
		setProfileSaved(false);
		setProfileError("");

		try {
			await updateProfile({
				display_name: displayName,
				email: accountEmail,
			});
			setProfileSaved(true);
			window.setTimeout(() => setProfileSaved(false), 1500);
		} catch (error) {
			setProfileError(
				error instanceof Error ? error.message : "Failed to save account profile.",
			);
		} finally {
			setIsSavingProfile(false);
		}
	};

	const requestAgentPairingCodeByEmail = async () => {
		if (!usesBroker) {
			setAgentError("Email pairing-code request is only available in broker mode.");
			return;
		}

		setAgentError("");
		setAgentNotice("");
		setIsAgentActionBusy(true);
		try {
			const redirectTo =
				typeof window !== "undefined"
					? `${window.location.origin}/app/settings`
					: undefined;
			await agentService.requestPairingCodeByEmail({
				redirectTo,
				redirectPath: "/app/settings",
			});
			setAgentNotice(
				"Pairing code email sent. Open the link from your inbox to load the code here.",
			);
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error
					? err.message
					: "Unable to request pairing code email.",
			);
		} finally {
			setIsAgentActionBusy(false);
		}
	};

	const pairAgent = async () => {
		const code = agentPairingCode.trim();
		if (!code) {
			setAgentError("Enter a 6-digit pairing code.");
			return;
		}
		setAgentError("");
		setAgentNotice("");
		setIsAgentActionBusy(true);
		try {
			if (usesBroker) {
				const pairedNow = await agentService.pair(code);
				if (!pairedNow) {
					throw new Error("Unable to pair with the gateway using this code.");
				}
				setAgentNotice("Agent paired for this session.");
				await refreshAgentStatus();
			} else {
				const pairedNow = await agentService.pair(code);
				if (!pairedNow) {
					throw new Error("Unable to pair with the gateway using this code.");
				}
				setAgentNotice("Agent paired for this browser session.");
				await refreshAgentStatus();
			}
			setAgentPairingCode("");
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error
					? err.message
					: "Unable to pair with the gateway.",
			);
		} finally {
			setIsAgentActionBusy(false);
		}
	};

	const unpairAgent = async () => {
		setAgentError("");
		setAgentNotice("");
		setIsAgentActionBusy(true);
		try {
			if (usesBroker) {
				const redirectTo =
					typeof window !== "undefined"
						? `${window.location.origin}/app/settings`
						: undefined;
				await agentService.requestPairingVerificationLink("unpair", undefined, {
					redirectTo,
					redirectPath: "/app/settings",
				});
				setAgentNotice(
					"Verification link sent. Open it from your email to finish unpairing.",
				);
			} else {
				await agentService.unpair();
				setAgentNotice("Agent pairing removed for this browser session.");
				await refreshAgentStatus();
			}
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error
					? err.message
					: usesBroker
						? "Unable to send unpair verification link."
						: "Unable to unpair from the gateway.",
			);
		} finally {
			setIsAgentActionBusy(false);
		}
	};

	const signOutAllSessions = async () => {
		if (isSigningOutAll) return;
		setIsSigningOutAll(true);
		setAccountActionMessage("");

		try {
			await agentService.unpair();
			const { error } = await supabase.auth.signOut({ scope: "global" });
			if (error) throw error;
			await logSecurityEvent(
				"auth_sign_out_global",
				"User signed out all active sessions.",
			);
			setAccountActionMessage("Signed out all active sessions.");
		} catch (err: unknown) {
			setAccountActionMessage(
				err instanceof Error ? err.message : "Failed to sign out all sessions.",
			);
		} finally {
			setIsSigningOutAll(false);
		}
	};

	const sessionAuthStatus = useMemo(
		() => ({
			value:
				sessionAuthMethod === "passkey" ? "Passkey session" : "Email link session",
			tone: (sessionAuthMethod === "passkey" ? "success" : "muted") as StatusTone,
		}),
		[sessionAuthMethod],
	);

	const passkeyAuthStatus = useMemo(
		() => ({
			value:
				sessionAuthMethod === "passkey"
					? "Class II WebAuthn verified"
					: "Class II WebAuthn ready",
			tone: (sessionAuthMethod === "passkey" ? "success" : "muted") as StatusTone,
		}),
		[sessionAuthMethod],
	);

	const passkeyBrowserStatus = useMemo(
		() => ({
			value: browserPasskeySupported ? "Supported" : "Unsupported",
			tone: (browserPasskeySupported ? "success" : "danger") as StatusTone,
		}),
		[browserPasskeySupported],
	);

	const passkeyFrontendStatus = useMemo(
		() => ({
			value: frontendPasskeyEnabled ? "Enabled" : "Disabled",
			tone: (frontendPasskeyEnabled ? "success" : "warning") as StatusTone,
		}),
		[frontendPasskeyEnabled],
	);

	const passkeyBackendStatus = useMemo(() => {
		if (passkeyLoading) {
			return { value: "Checking", tone: "muted" as const };
		}
		if (!passkeyCapability?.enabled) {
			return { value: "Rollout off", tone: "warning" as const };
		}
		if (!passkeyCapability.config_ready) {
			return { value: "Needs config", tone: "warning" as const };
		}
		if (!passkeyCapability.handlers_ready) {
			return { value: "Handlers missing", tone: "warning" as const };
		}
		return { value: "Ready", tone: "success" as const };
	}, [passkeyCapability, passkeyLoading]);

	const agentGatewayStatus = useMemo(() => {
		if (agentHealthy === null) {
			return { value: "Checking", tone: "muted" as const };
		}
		return agentHealthy
			? { value: "Online", tone: "success" as const }
			: { value: "Offline", tone: "danger" as const };
	}, [agentHealthy]);

	const agentPairingStatus = useMemo(
		() =>
			agentPaired
				? { value: "Paired", tone: "success" as const }
				: { value: "Not paired", tone: "warning" as const },
		[agentPaired],
	);

	const agentModeStatus = useMemo(
		() => ({
			value: usesBroker ? "Brokered email verification" : "Direct local gateway",
			tone: "muted" as const,
		}),
		[usesBroker],
	);

	return (
		<div className="grid gap-4">
			<h3 className="text-lg font-semibold tracking-tight [color:var(--text)]">
				Account
				<span className="ml-2 text-sm font-normal [color:var(--text-muted)]">
					Authentication, identity, and trusted device controls.
				</span>
			</h3>

			<div
				className="grid gap-3 rounded-2xl border p-4"
				style={getPanelGradientStyle("primary")}
			>
				<div className="flex items-start gap-2">
					<SectionIconBadge icon={ShieldCheck} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Security overview
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							Current session and trust posture for this workspace.
						</div>
					</div>
				</div>

				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					<SecurityStatusTile
						title="Passkey authentication"
						value={passkeyAuthStatus.value}
						tone={passkeyAuthStatus.tone}
						icon={KeyRound}
					/>
					<SecurityStatusTile
						title="Session auth"
						value={sessionAuthStatus.value}
						tone={sessionAuthStatus.tone}
						icon={Shield}
					/>
					<SecurityStatusTile
						title="Passkey browser"
						value={passkeyBrowserStatus.value}
						tone={passkeyBrowserStatus.tone}
						icon={HardDrive}
					/>
					<SecurityStatusTile
						title="Passkey frontend"
						value={passkeyFrontendStatus.value}
						tone={passkeyFrontendStatus.tone}
						icon={Settings2}
					/>
					<SecurityStatusTile
						title="Passkey backend"
						value={passkeyBackendStatus.value}
						tone={passkeyBackendStatus.tone}
						icon={Database}
					/>
					<SecurityStatusTile
						title="Agent gateway"
						value={agentGatewayStatus.value}
						tone={agentGatewayStatus.tone}
						icon={Bot}
					/>
					<SecurityStatusTile
						title="Agent pairing"
						value={agentPairingStatus.value}
						tone={agentPairingStatus.tone}
						icon={KeyRound}
					/>
					<SecurityStatusTile
						title="Agent mode"
						value={agentModeStatus.value}
						tone={agentModeStatus.tone}
						icon={Settings2}
					/>
				</div>
			</div>

			<div
				className="grid gap-2.5 rounded-2xl border p-3.5"
				style={getPanelGradientStyle("accent")}
			>
				<div className="flex items-start gap-2">
					<SectionIconBadge icon={User} tone="accent" />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">Profile</div>
						<div className="text-xs [color:var(--text-muted)]">
							Your display identity and contact email.
						</div>
					</div>
				</div>

				<div className="grid gap-2 md:grid-cols-[minmax(0,16rem)_minmax(0,22rem)_auto] md:items-end">
					<div>
						<label
							className="mb-1 block text-[11px] font-medium uppercase tracking-wide [color:var(--text-muted)]"
							htmlFor="accountDisplayName"
						>
							Display Name
						</label>
						<input
							id="accountDisplayName"
							className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
							value={displayName}
							onChange={(event) => setDisplayName(event.target.value)}
							placeholder="Your name"
						/>
					</div>

					<div>
						<label
							className="mb-1 block text-[11px] font-medium uppercase tracking-wide [color:var(--text-muted)]"
							htmlFor="accountEmail"
						>
							Email
						</label>
						<input
							id="accountEmail"
							className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
							value={accountEmail}
							onChange={(event) => setAccountEmail(event.target.value)}
							placeholder="you@email.com"
							type="email"
						/>
					</div>

					<button
						type="button"
						className="inline-flex w-fit items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 [background:var(--primary)] [color:var(--primary-contrast)]"
						disabled={!canSaveProfile}
						onClick={() => void saveAccountProfile()}
					>
						<Save size={14} />
						{isSavingProfile
							? "Saving..."
							: profileSaved
								? "Saved"
								: "Save profile"}
					</button>
				</div>

				{profileError ? (
					<div className="rounded-xl border px-3 py-2 text-sm [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_18%,transparent)] [color:var(--danger)]">
						{profileError}
					</div>
				) : null}
			</div>

			<div
				className="grid gap-3 rounded-2xl border p-4"
				style={getPanelGradientStyle("primary")}
			>
				<div className="flex items-start gap-2">
					<SectionIconBadge icon={Bot} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">Agent pairing</div>
						<div className="text-xs [color:var(--text-muted)]">
							Trust this browser session with ZeroClaw agent access.
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<input
						type="text"
						value={agentPairingCode}
						onChange={(event) => {
							const digitsOnly = event.target.value.replace(/\D+/g, "");
							setAgentPairingCode(digitsOnly.slice(0, 6));
						}}
						placeholder="Pairing code"
						autoComplete="off"
						inputMode="numeric"
						pattern="[0-9]{6}"
						maxLength={6}
						className="w-40 rounded-lg border px-3 py-1.5 text-xs outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					/>

					{usesBroker ? (
						<button
							type="button"
							onClick={() => void requestAgentPairingCodeByEmail()}
							disabled={isAgentActionBusy}
							className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						>
							<Mail size={12} />
							Email code
						</button>
					) : null}

					<button
						type="button"
						onClick={() => void pairAgent()}
						disabled={
							isAgentActionBusy ||
							agentPairingCode.trim().length !== 6 ||
							(!usesBroker && agentHealthy !== true)
						}
						className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						{isAgentActionBusy ? "Working..." : "Pair"}
					</button>

					<button
						type="button"
						onClick={() => void unpairAgent()}
						disabled={isAgentActionBusy || !agentPaired}
						className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						Unpair
					</button>

					<button
						type="button"
						onClick={() => void refreshAgentStatus()}
						disabled={agentLoading}
						className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						<RefreshCw size={12} />
						{agentLoading ? "Refreshing..." : "Refresh"}
					</button>
				</div>

				{agentError ? (
					<div className="text-xs [color:var(--danger)]">{agentError}</div>
				) : null}
				{agentNotice ? (
					<div className="text-xs [color:var(--text-muted)]">{agentNotice}</div>
				) : null}

				{agentHealthy === false ? (
					<div className="text-xs [color:var(--text-muted)]">
						Gateway is offline. Refresh and try again.
					</div>
				) : null}
				{usesBroker ? (
					<div className="text-xs [color:var(--text-muted)]">
						Request a code by email, open the link, then pair with the 6-digit code.
					</div>
				) : (
					<div className="text-xs [color:var(--text-muted)]">
						Direct mode stores pairing only in this browser session.
					</div>
				)}
			</div>

			<div
				className="grid gap-3 rounded-2xl border p-4"
				style={getPanelGradientStyle("neutral")}
			>
				<div className="flex items-start gap-2">
					<SectionIconBadge icon={LogOut} tone="neutral" />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">Session actions</div>
						<div className="text-xs [color:var(--text-muted)]">
							Sign out this device or revoke all active sessions.
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
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
						{isSigningOutAll ? "Signing out all..." : "Sign out all devices"}
					</button>
				</div>

				{accountActionMessage ? (
					<div className="text-xs [color:var(--text-muted)]">{accountActionMessage}</div>
				) : null}

				<div className="text-xs [color:var(--text-muted)]">
					Last sign-in: {user?.last_sign_in_at ?? "unknown"}
				</div>
				<div className="text-xs [color:var(--text-muted)]">
					Signed in as: <strong>{user?.email ?? "unknown"}</strong>
				</div>
			</div>

		</div>
	);
}

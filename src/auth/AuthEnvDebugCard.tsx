import { type CSSProperties } from "react";
import styles from "./AuthEnvDebugCard.module.css";

export default function AuthEnvDebugCard() {
	if (!import.meta.env.DEV) return null;

	const projectUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
	const redirectEnv = import.meta.env.VITE_AUTH_REDIRECT_URL ?? "";
	const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
	const passkeyEnabled = (import.meta.env.VITE_AUTH_PASSKEY_ENABLED ?? "").trim();
	const agentTransport = (import.meta.env.VITE_AGENT_TRANSPORT ?? "").trim();
	const signOutUnpair = (import.meta.env.VITE_AGENT_SIGNOUT_UNPAIR ?? "").trim();
	const pairingRestoreWindowHours = String(
		import.meta.env.VITE_AGENT_PAIRING_RESTORE_WINDOW_HOURS ?? "",
	).trim();
	const pairingRestoreNoExpiry = String(
		import.meta.env.VITE_AGENT_PAIRING_RESTORE_NO_EXPIRY ?? "",
	).trim();
	const pairingTokenTtlHours = String(
		import.meta.env.VITE_AGENT_TOKEN_TTL_HOURS ?? "",
	).trim();
	const origin = typeof window !== "undefined" ? window.location.origin : "";

	const parseHost = (value: string, fallback: string): string => {
		if (!value) return fallback;
		try {
			return new URL(value).host;
		} catch (_error) {
			return value;
		}
	};

	const projectHost = parseHost(projectUrl, "(missing)");
	const redirectHost = parseHost(redirectEnv, "(using current origin)");
	const originHost = parseHost(origin, "(unavailable)");

	const redirectMismatch =
		Boolean(redirectEnv) &&
		redirectHost !== "(using current origin)" &&
		redirectHost !== originHost;

	const rowStyle: CSSProperties = {
		display: "flex",
		justifyContent: "space-between",
		gap: 12,
		fontSize: 11,
		lineHeight: 1.55,
	};

	const labelStyle: CSSProperties = {
		opacity: 0.75,
		letterSpacing: "0.06em",
		textTransform: "uppercase",
		whiteSpace: "nowrap",
	};

	const valueStyle: CSSProperties = {
		opacity: 0.95,
		textAlign: "right",
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		wordBreak: "break-all",
	};

	return (
		<div
			className={styles.root}
			style={{
				background: "rgba(255,255,255,0.03)",
				border: "1px solid rgba(255,255,255,0.12)",
				padding: "10px 12px",
				marginTop: 10,
			}}
		>
			<div className={styles.title}>Dev Auth Environment</div>
			<div className={styles.rows}>
				<div style={rowStyle}>
					<span style={labelStyle}>Supabase</span>
					<span style={valueStyle}>{projectHost}</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Browser</span>
					<span style={valueStyle}>{originHost}</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Auth Redirect</span>
					<span style={valueStyle}>{redirectHost}</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Captcha</span>
					<span style={valueStyle}>
						{turnstileSiteKey.trim() ? "Turnstile enabled" : "disabled"}
					</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Passkey</span>
					<span style={valueStyle}>
						{passkeyEnabled.toLowerCase() === "true" ? "enabled" : "disabled"}
					</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Agent Transport</span>
					<span style={valueStyle}>{agentTransport || "(default)"}</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Sign-out Unpair</span>
					<span style={valueStyle}>
						{signOutUnpair || "(default true)"}
					</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Pairing Restore</span>
					<span style={valueStyle}>
						{pairingRestoreNoExpiry.toLowerCase() === "true"
							? "no-expiry"
							: pairingRestoreWindowHours
								? `${pairingRestoreWindowHours}h`
								: "(default 24h)"}
					</span>
				</div>
				<div style={rowStyle}>
					<span style={labelStyle}>Pairing Token TTL</span>
					<span style={valueStyle}>
						{pairingTokenTtlHours
							? Number(pairingTokenTtlHours) <= 0
								? "no-expiry"
								: `${pairingTokenTtlHours}h`
							: "(default 24h)"}
					</span>
				</div>
			</div>
			{redirectMismatch ? (
				<div className={styles.errorNote}>
					Redirect host does not match current host. Email auth links may fail.
				</div>
			) : null}
		</div>
	);
}

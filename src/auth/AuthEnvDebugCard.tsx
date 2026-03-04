import { type CSSProperties } from "react";
import styles from "./AuthEnvDebugCard.module.css";

export default function AuthEnvDebugCard() {
	if (!import.meta.env.DEV) return null;

	const projectUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
	const redirectEnv = import.meta.env.VITE_AUTH_REDIRECT_URL ?? "";
	const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
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
			</div>
			{redirectMismatch ? (
				<div className={styles.errorNote}>
					Redirect host does not match current host. Email auth links may fail.
				</div>
			) : null}
		</div>
	);
}

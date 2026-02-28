import { type CSSProperties, useMemo } from "react";

export default function AuthEnvDebugCard() {
	if (!import.meta.env.DEV) return null;

	const projectUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
	const redirectEnv = import.meta.env.VITE_AUTH_REDIRECT_URL ?? "";
	const origin = typeof window !== "undefined" ? window.location.origin : "";

	const projectHost = useMemo(() => {
		if (!projectUrl) return "(missing)";
		try {
			return new URL(projectUrl).host;
		} catch (_error) {
			return projectUrl;
		}
	}, [projectUrl]);

	const redirectHost = useMemo(() => {
		if (!redirectEnv) return "(using current origin)";
		try {
			return new URL(redirectEnv).host;
		} catch (_error) {
			return redirectEnv;
		}
	}, [redirectEnv]);

	const originHost = useMemo(() => {
		if (!origin) return "(unavailable)";
		try {
			return new URL(origin).host;
		} catch (_error) {
			return origin;
		}
	}, [origin]);

	const redirectMismatch =
		Boolean(redirectEnv) && redirectHost !== "(using current origin)" && redirectHost !== originHost;

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
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		wordBreak: "break-all",
	};

	return (
		<div
			className="auth-message"
			style={{
				background: "rgba(255,255,255,0.03)",
				border: "1px solid rgba(255,255,255,0.12)",
				padding: "10px 12px",
				marginTop: 10,
			}}
		>
			<div style={{ fontSize: 11, marginBottom: 8, opacity: 0.8 }}>
				Dev Auth Environment
			</div>
			<div style={{ display: "grid", gap: 4 }}>
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
			</div>
			{redirectMismatch ? (
				<div className="auth-error" style={{ marginTop: 8, marginBottom: 0 }}>
					Redirect host does not match current host. Signup/confirm/reset links may fail.
				</div>
			) : null}
		</div>
	);
}

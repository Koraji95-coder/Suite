import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { logger } from "../lib/logger";
import styles from "./CaptchaChallenge.module.css";

type CaptchaChallengeProps = {
	token: string;
	onTokenChange: (token: string) => void;
	disabled?: boolean;
};

type TurnstileWidgetId = string;

type TurnstileRenderOptions = {
	sitekey: string;
	theme?: "auto" | "light" | "dark";
	size?: "normal" | "compact" | "flexible";
	action?: string;
	callback?: (token: string) => void;
	"expired-callback"?: () => void;
	"error-callback"?: () => void;
};

type TurnstileApi = {
	render: (
		container: HTMLElement,
		options: TurnstileRenderOptions,
	) => TurnstileWidgetId;
	remove: (widgetId: TurnstileWidgetId) => void;
	reset: (widgetId: TurnstileWidgetId) => void;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

const TURNSTILE_SCRIPT_ID = "suite-turnstile-script";
const TURNSTILE_SCRIPT_SRC =
	"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function ensureTurnstileScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof window === "undefined") {
			reject(new Error("Window unavailable"));
			return;
		}

		if (window.turnstile) {
			resolve();
			return;
		}

		const existing = document.getElementById(
			TURNSTILE_SCRIPT_ID,
		) as HTMLScriptElement | null;
		if (existing) {
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener(
				"error",
				() => reject(new Error("Failed to load Turnstile script")),
				{ once: true },
			);
			return;
		}

		const script = document.createElement("script");
		script.id = TURNSTILE_SCRIPT_ID;
		script.src = TURNSTILE_SCRIPT_SRC;
		script.async = true;
		script.defer = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Failed to load Turnstile script"));
		document.head.appendChild(script);
	});
}

export default function CaptchaChallenge({
	token,
	onTokenChange,
	disabled = false,
}: CaptchaChallengeProps) {
	const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
	const onTokenChangeRef = useRef(onTokenChange);
	const [loadError, setLoadError] = useState("");

	onTokenChangeRef.current = onTokenChange;

	useEffect(() => {
		if (!siteKey) return;
		if (!containerRef.current) return;

		let mounted = true;

		void ensureTurnstileScript()
			.then(() => {
				if (!mounted) return;
				if (!containerRef.current) return;
				if (!window.turnstile) {
					setLoadError("CAPTCHA service unavailable.");
					return;
				}

				const widgetId = window.turnstile.render(containerRef.current, {
					sitekey: siteKey,
					theme: "auto",
					size: "flexible",
					action: "auth_email_link",
					callback: (nextToken) => {
						onTokenChangeRef.current(nextToken);
					},
					"expired-callback": () => {
						onTokenChangeRef.current("");
					},
					"error-callback": () => {
						onTokenChangeRef.current("");
						setLoadError("CAPTCHA validation failed. Please retry.");
					},
				});
				widgetIdRef.current = widgetId;
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Failed to load CAPTCHA";
				logger.warn("CaptchaChallenge", "Turnstile load failed", {
					error: message,
				});
				if (mounted) {
					setLoadError("CAPTCHA could not load. Please refresh and retry.");
				}
			});

		return () => {
			mounted = false;
			if (widgetIdRef.current && window.turnstile) {
				try {
					window.turnstile.remove(widgetIdRef.current);
				} catch (error) {
					logger.warn("CaptchaChallenge", "Failed to remove Turnstile widget", {
						error,
					});
				}
			}
			widgetIdRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!siteKey) return;
		if (!widgetIdRef.current || !window.turnstile) return;
		if (!disabled) return;
		window.turnstile.reset(widgetIdRef.current);
		onTokenChangeRef.current("");
	}, [disabled]);

	if (!siteKey) return null;

	return (
		<div className={styles.root}>
			<div
				ref={containerRef}
				className={cn(disabled && styles.disabledWidget)}
			/>
			{loadError ? (
				<div className={styles.error}>{loadError}</div>
			) : token.trim().length === 0 ? (
				<p className={styles.hint}>
					Complete the CAPTCHA challenge before continuing.
				</p>
			) : null}
		</div>
	);
}

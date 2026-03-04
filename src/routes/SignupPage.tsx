// src/routes/SignupPage.tsx
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import AuthEnvDebugCard from "../auth/AuthEnvDebugCard";
import AuthShell from "../auth/AuthShell";
import CaptchaChallenge from "../auth/CaptchaChallenge";
import { useNotification } from "../auth/NotificationContext";
import { useAuth } from "../auth/useAuth";
import { Badge } from "../components/primitives/Badge";
// Primitives
import { Button } from "../components/primitives/Button";
import { Input } from "../components/primitives/Input";
import { Panel } from "../components/primitives/Panel";
import { Stack } from "../components/primitives/Stack";
import { Text } from "../components/primitives/Text";
import { logger } from "../lib/logger";
import { logAuthMethodTelemetry } from "../services/securityEventService";
import styles from "./SignupPage.module.css";

export default function SignupPage() {
	const { user, loading, signUp } = useAuth();
	const notification = useNotification();

	const [email, setEmail] = useState("");
	const [captchaToken, setCaptchaToken] = useState("");
	const [honeypot, setHoneypot] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

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

	// Redirect if already logged in
	if (user && !loading) return <Navigate to="/app/home" replace />;

	const onSubmit = async (e: { preventDefault: () => void }) => {
		e.preventDefault();
		if (!canSubmit) return;

		setError("");
		setSubmitting(true);
		try {
			await signUp(email.trim(), { captchaToken, honeypot });
			setSent(true);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "We couldn't send your signup link right now.";
			setError(msg);
			setCaptchaToken("");
			logger.error("Signup link request failed", "SignupPage", { error: err });
			await logAuthMethodTelemetry(
				"email_link",
				"sign_up_request_failed",
				`Sign-up email-link request failed: ${msg}`,
			);
			notification.error("Signup failed", msg);
		} finally {
			setSubmitting(false);
		}
	};

	// ═══════════════════════════════════════════════════════════════════════════
	// SENT STATE
	// ═══════════════════════════════════════════════════════════════════════════
	if (sent) {
		return (
			<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
				<Stack gap={6}>
					{/* Header */}
					<div>
						<Badge color="success" variant="soft" className={styles.badge}>
							<span className={cn(styles.badgeDot, styles.badgeDotSuccess)} />
							Check your email
						</Badge>

						<Text as="h1" size="2xl" weight="semibold" block>
							Almost there
						</Text>
					</div>

					{/* Content */}
					<Stack gap={4}>
						<Panel variant="default" padding="md">
							<Text size="sm" color="muted">
								If this email can be used, we sent a secure link to finish
								setup. Open the email link on this device and you'll be
								redirected into your workspace.
							</Text>
						</Panel>

						<Link to="/login" className={styles.blockLink}>
							<Button variant="primary" fluid>
								Go to sign in
							</Button>
						</Link>

						<Button variant="secondary" fluid onClick={() => setSent(false)}>
							Send another link
						</Button>

						<AuthEnvDebugCard />
					</Stack>
				</Stack>
			</AuthShell>
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// DEFAULT FORM
	// ═══════════════════════════════════════════════════════════════════════════
	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
			<Stack gap={6}>
				{/* Header */}
				<div>
					<Badge color="primary" variant="soft" className={styles.badge}>
						<span className={cn(styles.badgeDot, styles.badgeDotPrimary)} />
						Create account
					</Badge>

					<Text as="h1" size="2xl" weight="semibold" block>
						Get started
					</Text>

					<Text color="muted" size="sm" className={styles.headerCopy} block>
						Create your account to access the workspace.
					</Text>
				</div>

				{/* Form */}
				<form className={styles.formContents} onSubmit={onSubmit} noValidate>
					<Stack gap={4}>
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
							{submitting ? "Sending link..." : "Send get-started link"}
						</Button>

						{/* Footer links */}
						<div className={styles.footerLinks}>
							<Text size="sm" color="muted">
								Already have an account?{" "}
								<Link to="/login" className={styles.primaryLink}>
									Sign in
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
		</AuthShell>
	);
}

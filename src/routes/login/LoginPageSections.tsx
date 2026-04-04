import { type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import AuthEnvDebugCard from "../../auth/AuthEnvDebugCard";
import AuthShell from "../../auth/AuthShell";
import CaptchaChallenge from "../../auth/CaptchaChallenge";
import { Badge } from "../../components/system/base/Badge";
import { Button } from "../../components/system/base/Button";
import { Input } from "../../components/system/base/Input";
import { Panel } from "../../components/system/base/Panel";
import { Progress } from "../../components/system/base/Progress";
import { HStack, Stack } from "../../components/system/base/Stack";
import { Text } from "../../components/system/base/Text";
import { cn } from "../../lib/utils";
import styles from "../LoginPage.module.css";

const SHOWCASE_LABELS = ["Projects", "Draft", "Review"];
type LoginPageFrameProps = { children: ReactNode };

type LoginSessionStateProps = {
	redirecting: boolean;
	redirectMessage: string;
	redirectProgress: number;
	shouldPreloadDashboard: boolean;
};

type LoginSentStateProps = {
	email: string;
	onSendAnother: () => void;
};

type LoginFormProps = {
	email: string;
	onEmailChange: (value: string) => void;
	captchaToken: string;
	onCaptchaTokenChange: (value: string) => void;
	honeypot: string;
	honeypotFieldName: string;
	onHoneypotChange: (value: string) => void;
	submitting: boolean;
	passkeySubmitting: boolean;
	passkeyAvailable: boolean;
	canSubmit: boolean;
	error: string;
	onPasskeySignIn: () => Promise<void>;
	onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function LoginPageFrame({ children }: LoginPageFrameProps) {
	return (
		<AuthShell navLink={{ to: "/", label: "Back to landing" }}>
			<div className={styles.pageRoot}>
				<LoginPageShowcase />
				<Stack gap={6}>{children}</Stack>
			</div>
		</AuthShell>
	);
}

export function LoginSessionState({
	redirecting,
	redirectMessage,
	redirectProgress,
}: LoginSessionStateProps) {
	return (
		<>
			<div className={styles.headerCenter}>
				<Badge color="primary" variant="soft" className={styles.statusBadge}>
					<span
						className={cn(styles.statusDot, styles.dotPrimary, styles.dotPulse)}
					/>
					{redirecting ? "Redirecting" : "Preparing your session"}
				</Badge>

				<Text as="h1" size="2xl" weight="semibold" block>
					{redirecting ? "Opening your workspace" : "Checking your account"}
				</Text>

				<Text color="muted" size="sm" className={styles.headerCopy} block>
					{redirecting ? redirectMessage : "Validating your sign-in status..."}
				</Text>
			</div>

			<Stack gap={3}>
				<Progress
					value={Math.max(8, redirectProgress)}
					color="primary"
					size="md"
					animated
				/>

				<Text
					size="xs"
					color="muted"
					align="center"
					className={styles.progressLabel}
				>
					{redirecting ? `${Math.max(8, redirectProgress)}%` : "Connecting..."}
				</Text>

				<AuthEnvDebugCard />
			</Stack>
		</>
	);
}

export function LoginSentState({ email, onSendAnother }: LoginSentStateProps) {
	return (
		<>
			<div className={styles.headerCenter}>
				<Badge color="success" variant="soft" className={styles.statusBadge}>
					<span
						className={cn(styles.statusDot, styles.dotSuccess, styles.dotPulse)}
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

			<Stack gap={4}>
				<Panel variant="default" padding="md" className={styles.emailPreview}>
					<Text size="sm" color="muted">
						If your account exists for{" "}
						<Text weight="semibold" color="default">
							{email.trim()}
						</Text>
						, we sent a sign-in link. Open that email on this device to
						continue.
					</Text>
				</Panel>

				<Button variant="primary" fluid onClick={onSendAnother}>
					Send another link
				</Button>

				<div className={styles.footerLinks}>
					<Link to="/signup" className={styles.primaryLink}>
						Create an account
					</Link>
					<Link to="/privacy" className={styles.mutedLink}>
						Privacy
					</Link>
				</div>

				<AuthEnvDebugCard />
			</Stack>
		</>
	);
}

export function LoginForm({
	email,
	onEmailChange,
	captchaToken,
	onCaptchaTokenChange,
	honeypot,
	honeypotFieldName,
	onHoneypotChange,
	submitting,
	passkeySubmitting,
	passkeyAvailable,
	canSubmit,
	error,
	onPasskeySignIn,
	onSubmit,
}: LoginFormProps) {
	return (
		<>
			<div className={styles.headerCenter}>
				<Badge color="primary" variant="soft" className={styles.statusBadge}>
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

			<form className={styles.formContents} onSubmit={onSubmit} noValidate>
				<Stack gap={4}>
					{passkeyAvailable ? (
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
									<Text size="xs" color="muted" className={styles.dividerLabel}>
										Or continue with email link
									</Text>
								</div>
							</div>
						</>
					) : null}

					<Input
						label="Email"
						type="email"
						autoComplete="email"
						value={email}
						onChange={(event) => onEmailChange(event.target.value)}
						placeholder="you@company.com"
						required
					/>

					<div aria-hidden="true" className={styles.honeypotField}>
						<label htmlFor={`hp-${honeypotFieldName}`}>Company</label>
						<input
							id={`hp-${honeypotFieldName}`}
							name={honeypotFieldName}
							type="text"
							autoComplete="off"
							tabIndex={-1}
							value={honeypot}
							onChange={(event) => onHoneypotChange(event.target.value)}
						/>
					</div>

					<CaptchaChallenge
						token={captchaToken}
						onTokenChange={onCaptchaTokenChange}
						disabled={submitting}
					/>

					{error ? (
						<Panel variant="outline" padding="sm" className={styles.errorPanel}>
							<Text size="sm" color="danger">
								{error}
							</Text>
						</Panel>
					) : null}

					<Button
						variant="primary"
						fluid
						type="submit"
						disabled={!canSubmit}
						loading={submitting}
					>
						{submitting ? "Sending link..." : "Send sign-in link"}
					</Button>

					<div className={styles.footerLinks}>
						<Text size="sm" color="muted">
							No account yet?{" "}
							<Link to="/signup" className={styles.primaryLink}>
								Create one
							</Link>
						</Text>
						<Link to="/privacy" className={styles.mutedLink}>
							Privacy
						</Link>
					</div>

					<AuthEnvDebugCard />
				</Stack>
			</form>
		</>
	);
}

function LoginPageShowcase() {
	return (
		<div className={styles.showcase}>
			<div className={styles.showcasePanelWrap}>
				<div className={styles.showcaseGlow} />
				<div className={styles.showcasePanelInner}>
					<Panel variant="elevated" padding="lg">
						<Stack gap={2} align="center">
							<Badge color="primary" variant="soft">
								Suite
							</Badge>
							<Text size="lg" weight="semibold">
								Workspace access
							</Text>
							<Text size="xs" color="muted" align="center">
								Open your project notebook, released tools, and review surfaces
								from one secure sign-in.
							</Text>
						</Stack>
					</Panel>
				</div>
			</div>

			<HStack gap={2} justify="center">
				{SHOWCASE_LABELS.map((label) => (
					<div key={label} className={styles.secondaryPill}>
						<Text size="xs" weight="semibold">
							{label}
						</Text>
					</div>
				))}
			</HStack>
		</div>
	);
}

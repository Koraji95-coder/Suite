import {
	AlertCircle,
	Bot,
	CheckCircle2,
	Database,
	HardDrive,
	KeyRound,
	LogOut,
	Save,
	Settings2,
	Shield,
	ShieldCheck,
	User,
} from "lucide-react";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import type { AgentPairingAction } from "@/services/agent/types";
import styles from "./AccountSettings.module.css";
import { SectionHeader, StatusTile } from "./accountSettingsShared";
import type { StatusDescriptor } from "./accountSettingsUtils";

interface AccountSecurityOverviewSectionProps {
	passkeyAuthStatus: StatusDescriptor;
	sessionAuthStatus: StatusDescriptor;
	passkeyBrowserStatus: StatusDescriptor;
	passkeyFrontendStatus: StatusDescriptor;
	passkeyBackendStatus: StatusDescriptor;
	agentGatewayStatus: StatusDescriptor;
	agentPairingStatus: StatusDescriptor;
	agentModeStatus: StatusDescriptor;
}

interface AccountProfileSectionProps {
	displayName: string;
	accountEmail: string;
	canSaveProfile: boolean;
	isSavingProfile: boolean;
	profileSaved: boolean;
	profileError: string;
	onDisplayNameChange: (value: string) => void;
	onAccountEmailChange: (value: string) => void;
	onSaveProfile: () => Promise<void>;
}

interface AccountAgentPairingSectionProps {
	usesBroker: boolean;
	agentHealthy: boolean | null;
	agentPaired: boolean;
	agentLoading: boolean;
	agentPairingCode: string;
	isAgentActionBusy: boolean;
	effectiveAgentError: string;
	agentNotice: string;
	agentVerificationCooldownSeconds: number;
	lastAgentVerificationAction: AgentPairingAction | null;
	onAgentPairingCodeChange: (value: string) => void;
	onPairAgent: () => Promise<void>;
	onUnpairAgent: () => Promise<void>;
	onResendVerification: (action: AgentPairingAction) => Promise<void>;
	onRefreshAgentStatus: () => Promise<void>;
}

interface AccountSessionActionsSectionProps {
	signOut: () => Promise<void>;
	onSignOutAllSessions: () => Promise<void>;
	isSigningOutAll: boolean;
	accountActionMessage: string;
	lastSignInAt?: string | null;
	userEmail?: string | null;
}

export function AccountSecurityOverviewSection({
	passkeyAuthStatus,
	sessionAuthStatus,
	passkeyBrowserStatus,
	passkeyFrontendStatus,
	passkeyBackendStatus,
	agentGatewayStatus,
	agentPairingStatus,
	agentModeStatus,
}: AccountSecurityOverviewSectionProps) {
	return (
		<Panel variant="support" padding="lg">
			<Stack gap={4}>
				<SectionHeader
					icon={ShieldCheck}
					title="Security"
					description="A compact read on how this workspace is trusted before you inspect the deeper technical detail."
					tone="primary"
				/>

				<div className={styles.securityGrid}>
					<StatusTile
						title="Access method"
						value={sessionAuthStatus.value}
						tone={sessionAuthStatus.tone}
						icon={KeyRound}
					/>
					<StatusTile
						title="Passkeys"
						value={passkeyBackendStatus.value}
						tone={passkeyBackendStatus.tone}
						icon={Database}
					/>
					<StatusTile
						title="Agent access"
						value={agentGatewayStatus.value}
						tone={agentGatewayStatus.tone}
						icon={Bot}
					/>
					<StatusTile
						title="Verification path"
						value={agentModeStatus.value}
						tone={agentModeStatus.tone}
						icon={Settings2}
					/>
				</div>

				<HStack gap={2} wrap className={styles.securityDetailRow}>
					<Badge variant="soft" color={passkeyBrowserStatus.tone} size="sm">
						Browser {passkeyBrowserStatus.value.toLowerCase()}
					</Badge>
					<Badge variant="soft" color={passkeyFrontendStatus.tone} size="sm">
						Frontend {passkeyFrontendStatus.value.toLowerCase()}
					</Badge>
					<Badge variant="soft" color={passkeyAuthStatus.tone} size="sm">
						{passkeyAuthStatus.value}
					</Badge>
					<Badge variant="soft" color={agentModeStatus.tone} size="sm">
						{agentModeStatus.value}
					</Badge>
				</HStack>
			</Stack>
		</Panel>
	);
}

export function AccountProfileSection({
	displayName,
	accountEmail,
	canSaveProfile,
	isSavingProfile,
	profileSaved,
	profileError,
	onDisplayNameChange,
	onAccountEmailChange,
	onSaveProfile,
}: AccountProfileSectionProps) {
	return (
		<Panel variant="support" padding="lg">
			<Stack gap={4}>
				<SectionHeader
					icon={User}
					title="Identity"
					description="How your name and contact details appear across the workspace."
					tone="accent"
				/>

				<div className={styles.profileGrid}>
					<Input
						label="Display Name"
						name="display_name"
						value={displayName}
						onChange={(event) => onDisplayNameChange(event.target.value)}
						placeholder="Your name"
					/>
					<Input
						label="Email"
						name="account_email"
						type="email"
						value={accountEmail}
						onChange={(event) => onAccountEmailChange(event.target.value)}
						placeholder="you@email.com"
					/>
					<Button
						variant="primary"
						disabled={!canSaveProfile}
						loading={isSavingProfile}
						onClick={() => void onSaveProfile()}
						iconLeft={
							profileSaved ? <CheckCircle2 size={14} /> : <Save size={14} />
						}
					>
						{isSavingProfile
							? "Saving..."
							: profileSaved
								? "Saved"
								: "Save profile"}
					</Button>
				</div>

				{profileError && (
					<Panel
						variant="outline"
						padding="sm"
						className={styles.profileErrorPanel}
					>
						<HStack gap={2} align="center">
							<AlertCircle size={14} className={styles.dangerIcon} />
							<Text size="sm" color="danger">
								{profileError}
							</Text>
						</HStack>
					</Panel>
				)}
			</Stack>
		</Panel>
	);
}

export function AccountAgentPairingSection({
	usesBroker,
	agentHealthy,
	agentPaired,
	agentLoading,
	agentPairingCode,
	isAgentActionBusy,
	effectiveAgentError,
	agentNotice,
	agentVerificationCooldownSeconds,
	lastAgentVerificationAction,
	onAgentPairingCodeChange,
	onPairAgent,
	onUnpairAgent,
	onResendVerification,
	onRefreshAgentStatus,
}: AccountAgentPairingSectionProps) {
	const gatewayState =
		agentHealthy === true
			? "ready"
			: agentHealthy === false
				? "unavailable"
				: "background";
	const pairingState =
		agentHealthy === false
			? "unavailable"
			: agentPaired
				? "ready"
				: agentHealthy === null
					? "background"
					: "needs-attention";
	const pairingHeadline =
		pairingState === "ready"
			? "Trusted agent access is attached to this device."
			: pairingState === "unavailable"
				? "Agent access is unavailable until the local gateway responds."
				: pairingState === "background"
					? "Trust state is settling in the background."
					: "Pair this device to unlock direct chat and orchestration.";
	const pairingSummary = usesBroker
		? "Managed verification sends a confirmation link to the signed-in account before the pairing state changes."
		: "Local verification keeps pairing scoped to this browser for troubleshooting and direct gateway work.";
	const primaryActionLabel =
		agentHealthy !== true
			? agentLoading
				? "Refreshing trust state..."
				: "Refresh trust state"
			: usesBroker && agentVerificationCooldownSeconds > 0
				? `Pair this device (${agentVerificationCooldownSeconds}s)`
				: agentPaired
					? "Refresh trust state"
					: "Pair this device";

	return (
		<Panel variant="feature" padding="lg" className={styles.agentPairingPanel}>
			<Stack gap={4}>
				<SectionHeader
					icon={Bot}
					title="Pairing"
					description="Attach a trusted device to managed agent access without turning this page into a gateway dashboard."
					tone="primary"
				/>

				<div className={styles.agentPairingSummary}>
					<div className={styles.agentPairingStatusRow}>
						<TrustStateBadge state={pairingState} label={pairingHeadline} />
					</div>
					<Text size="xs" color="muted">
						{pairingSummary}
					</Text>
					<Text size="xs" color="muted">
						{gatewayState === "ready"
							? "Gateway is available for trusted device checks."
							: gatewayState === "unavailable"
								? "Gateway must reconnect before pairing can continue."
								: "Gateway trust is settling in the background."}
					</Text>
				</div>

				<div className={styles.agentActionRow}>
					{!usesBroker && (
						<div className={styles.agentCodeWrap}>
							<Input
								value={agentPairingCode}
								onChange={(event) => {
									const digitsOnly = event.target.value.replace(/\D+/g, "");
									onAgentPairingCodeChange(digitsOnly.slice(0, 6));
								}}
								placeholder="000000"
								maxLength={6}
								className={styles.agentCodeInput}
							/>
						</div>
					)}

					<Button
						variant="primary"
						size="sm"
						disabled={
							isAgentActionBusy ||
							(agentHealthy !== true && agentLoading) ||
							(agentHealthy === true &&
								usesBroker &&
								!agentPaired &&
								agentVerificationCooldownSeconds > 0) ||
							(agentHealthy === true &&
								!usesBroker &&
								!agentPaired &&
								agentPairingCode.trim().length !== 6)
						}
						loading={isAgentActionBusy}
						onClick={() =>
							void (agentHealthy === true && !agentPaired
								? onPairAgent()
								: onRefreshAgentStatus())
						}
						className={styles.agentActionButton}
					>
						{primaryActionLabel}
					</Button>

					{agentPaired ? (
						<Button
							variant="secondary"
							size="sm"
							disabled={
								isAgentActionBusy ||
								(usesBroker && agentVerificationCooldownSeconds > 0)
							}
							onClick={() => void onUnpairAgent()}
							className={styles.agentActionButton}
						>
							{usesBroker ? "Unpair this device" : "Unpair"}
						</Button>
					) : null}

					{usesBroker && !agentPaired && (
						<Button
							variant="secondary"
							size="sm"
							disabled={
								isAgentActionBusy ||
								agentVerificationCooldownSeconds > 0 ||
								!lastAgentVerificationAction
							}
							onClick={() => {
								if (!lastAgentVerificationAction) return;
								void onResendVerification(lastAgentVerificationAction);
							}}
							className={styles.agentActionButton}
						>
							{agentVerificationCooldownSeconds > 0
								? `Resend link (${agentVerificationCooldownSeconds}s)`
								: "Resend link"}
						</Button>
					)}
				</div>

				<details className={styles.agentTechnicalDetails}>
					<summary className={styles.agentTechnicalSummary}>
						View technical details
					</summary>
					<div className={styles.agentTechnicalBody}>
						<div className={styles.agentTechnicalGrid}>
							<div className={styles.agentTechnicalCard}>
								<span className={styles.agentTechnicalLabel}>Gateway</span>
								<TrustStateBadge
									state={gatewayState}
									label={
										gatewayState === "ready"
											? "Available"
											: gatewayState === "unavailable"
												? "Unavailable"
												: "Background"
									}
								/>
							</div>
							<div className={styles.agentTechnicalCard}>
								<span className={styles.agentTechnicalLabel}>Pairing</span>
								<TrustStateBadge
									state={pairingState}
									label={agentPaired ? "Attached" : "Pairing required"}
								/>
							</div>
							<div className={styles.agentTechnicalCard}>
								<span className={styles.agentTechnicalLabel}>
									Verification path
								</span>
								<Badge size="sm" variant="soft" color="accent">
									{usesBroker ? "Managed verification" : "Local verification"}
								</Badge>
							</div>
						</div>
						{effectiveAgentError ? (
							<Text
								size="xs"
								color="danger"
								className={styles.agentNoticeError}
							>
								{effectiveAgentError}
							</Text>
						) : null}
						{agentNotice ? (
							<Text size="xs" color="muted" className={styles.agentNotice}>
								{agentNotice}
							</Text>
						) : null}
						{usesBroker && agentVerificationCooldownSeconds > 0 ? (
							<Text size="xs" color="muted" className={styles.agentCooldown}>
								Verification email cooldown: {agentVerificationCooldownSeconds}s
								remaining.
							</Text>
						) : null}
					</div>
				</details>
			</Stack>
		</Panel>
	);
}

export function AccountSessionActionsSection({
	signOut,
	onSignOutAllSessions,
	isSigningOutAll,
	accountActionMessage,
	lastSignInAt,
	userEmail,
}: AccountSessionActionsSectionProps) {
	return (
		<Panel variant="support" padding="lg">
			<Stack gap={4}>
				<SectionHeader
					icon={LogOut}
					title="Workspace"
					description="Session controls, account context, and sign-out actions for this device."
					tone="neutral"
				/>

				<HStack gap={2} wrap>
					<Button variant="secondary" onClick={() => void signOut()}>
						Sign out
					</Button>

					<Button
						variant="outline"
						disabled={isSigningOutAll}
						loading={isSigningOutAll}
						onClick={() => void onSignOutAllSessions()}
					>
						{isSigningOutAll ? "Signing out all..." : "Sign out all devices"}
					</Button>
				</HStack>

				{accountActionMessage && (
					<Text size="xs" color="muted">
						{accountActionMessage}
					</Text>
				)}

				<Stack gap={1}>
					<Text size="xs" color="muted">
						Last sign-in: {lastSignInAt ?? "unknown"}
					</Text>
					<Text size="xs" color="muted">
						Signed in as:{" "}
						<Text weight="semibold">{userEmail ?? "unknown"}</Text>
					</Text>
				</Stack>
			</Stack>
		</Panel>
	);
}

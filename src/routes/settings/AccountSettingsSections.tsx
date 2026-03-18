import {
	AlertCircle,
	Bot,
	CheckCircle2,
	Database,
	HardDrive,
	KeyRound,
	Loader2,
	LogOut,
	RefreshCw,
	Save,
	Settings2,
	Shield,
	ShieldCheck,
	User,
} from "lucide-react";
import type { AgentPairingAction } from "@/services/agentService";
import { Badge } from "@/components/primitives/Badge";
import { Button, IconButton } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { SectionHeader, StatusTile } from "./accountSettingsShared";
import type { StatusDescriptor } from "./accountSettingsUtils";
import styles from "./AccountSettings.module.css";

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
		<Panel variant="default" padding="lg">
			<Stack gap={4}>
				<SectionHeader
					icon={ShieldCheck}
					title="Security overview"
					description="Current session and trust posture for this workspace."
					tone="primary"
				/>

				<div className={styles.securityGrid}>
					<StatusTile
						title="Passkey auth"
						value={passkeyAuthStatus.value}
						tone={passkeyAuthStatus.tone}
						icon={KeyRound}
					/>
					<StatusTile
						title="Session auth"
						value={sessionAuthStatus.value}
						tone={sessionAuthStatus.tone}
						icon={Shield}
					/>
					<StatusTile
						title="Browser support"
						value={passkeyBrowserStatus.value}
						tone={passkeyBrowserStatus.tone}
						icon={HardDrive}
					/>
					<StatusTile
						title="Frontend"
						value={passkeyFrontendStatus.value}
						tone={passkeyFrontendStatus.tone}
						icon={Settings2}
					/>
					<StatusTile
						title="Backend"
						value={passkeyBackendStatus.value}
						tone={passkeyBackendStatus.tone}
						icon={Database}
					/>
					<StatusTile
						title="Agent gateway"
						value={agentGatewayStatus.value}
						tone={agentGatewayStatus.tone}
						icon={Bot}
					/>
					<StatusTile
						title="Agent pairing"
						value={agentPairingStatus.value}
						tone={agentPairingStatus.tone}
						icon={KeyRound}
					/>
					<StatusTile
						title="Agent mode"
						value={agentModeStatus.value}
						tone={agentModeStatus.tone}
						icon={Settings2}
					/>
				</div>
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
		<Panel variant="default" padding="lg">
			<Stack gap={4}>
				<SectionHeader
					icon={User}
					title="Profile"
					description="Your display identity and contact email."
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
	return (
		<Panel variant="default" padding="lg" className={styles.agentPairingPanel}>
			<Stack gap={4}>
				<SectionHeader
					icon={Bot}
					title="Agent pairing"
					description="Trust this browser session with ZeroClaw agent access."
					tone="primary"
				/>

				<div className={styles.agentPairingSummary}>
					<HStack gap={2} wrap>
						<Badge
							size="sm"
							variant="soft"
							color={
								agentHealthy === true
									? "success"
									: agentHealthy === false
										? "danger"
										: "default"
							}
						>
							Agent gateway:{" "}
							{agentHealthy === null
								? "Checking"
								: agentHealthy
									? "Online"
									: "Offline"}
						</Badge>
						<Badge
							size="sm"
							variant="soft"
							color={agentPaired ? "success" : "warning"}
						>
							Pairing status: {agentPaired ? "Paired" : "Not paired"}
						</Badge>
						<Badge size="sm" variant="outline" color="default">
							Mode: {usesBroker ? "Brokered verification" : "Direct gateway"}
						</Badge>
					</HStack>
					<Text size="xs" color="muted">
						{usesBroker
							? "Pairing and unpairing are completed through email verification links for this signed-in account."
							: "Direct mode is for local troubleshooting and stores pairing only in this browser session."}
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
							(usesBroker && agentVerificationCooldownSeconds > 0) ||
							(!usesBroker &&
								(agentPairingCode.trim().length !== 6 || agentHealthy !== true))
						}
						loading={isAgentActionBusy}
						onClick={() => void onPairAgent()}
						className={styles.agentActionButton}
					>
						{usesBroker && agentVerificationCooldownSeconds > 0
							? `Pair this device (${agentVerificationCooldownSeconds}s)`
							: usesBroker
								? "Pair this device"
								: "Pair"}
					</Button>

					<Button
						variant="secondary"
						size="sm"
						disabled={
							isAgentActionBusy ||
							(usesBroker && agentVerificationCooldownSeconds > 0) ||
							!agentPaired
						}
						onClick={() => void onUnpairAgent()}
						className={styles.agentActionButton}
					>
						{usesBroker ? "Unpair this device" : "Unpair"}
					</Button>

					{usesBroker && (
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
								? `Resend verification (${agentVerificationCooldownSeconds}s)`
								: "Resend verification"}
						</Button>
					)}

					<IconButton
						icon={
							agentLoading ? (
								<Loader2 size={14} className={styles.spin} />
							) : (
								<RefreshCw size={14} />
							)
						}
						aria-label="Refresh status"
						variant="ghost"
						size="sm"
						disabled={agentLoading}
						onClick={() => void onRefreshAgentStatus()}
					/>
				</div>

				{effectiveAgentError && (
					<Text size="xs" color="danger" className={styles.agentNoticeError}>
						{effectiveAgentError}
					</Text>
				)}
				{agentNotice && (
					<Text size="xs" color="muted" className={styles.agentNotice}>
						{agentNotice}
					</Text>
				)}
				{usesBroker && agentVerificationCooldownSeconds > 0 && (
					<Text size="xs" color="muted" className={styles.agentCooldown}>
						Verification requests are temporarily cooling down. Try again in{" "}
						{agentVerificationCooldownSeconds}s.
					</Text>
				)}
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
		<Panel variant="default" padding="lg">
			<Stack gap={4}>
				<SectionHeader
					icon={LogOut}
					title="Session actions"
					description="Sign out this device or revoke all active sessions."
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
						Signed in as: <Text weight="semibold">{userEmail ?? "unknown"}</Text>
					</Text>
				</Stack>
			</Stack>
		</Panel>
	);
}

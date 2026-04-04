import {
	AlertCircle,
	CheckCircle2,
	Database,
	KeyRound,
	LogOut,
	Save,
	Settings2,
	ShieldCheck,
	User,
} from "lucide-react";
import { Badge } from "@/components/system/base/Badge";
import { Button } from "@/components/system/base/Button";
import { Input } from "@/components/system/base/Input";
import { Panel } from "@/components/system/base/Panel";
import { HStack, Stack } from "@/components/system/base/Stack";
import { Text } from "@/components/system/base/Text";
import styles from "./AccountSettings.module.css";
import { SectionHeader, StatusTile } from "./accountSettingsShared";
import type { StatusDescriptor } from "./accountSettingsUtils";

function toBadgeColor(
	tone: StatusDescriptor["tone"],
): "success" | "danger" | "warning" | "accent" | "default" {
	switch (tone) {
		case "success":
			return "success";
		case "danger":
			return "danger";
		case "warning":
			return "warning";
		case "accent":
			return "accent";
		case "primary":
		case "muted":
		default:
			return "default";
	}
}

interface AccountSecurityOverviewSectionProps {
	passkeyAuthStatus: StatusDescriptor;
	sessionAuthStatus: StatusDescriptor;
	passkeyBrowserStatus: StatusDescriptor;
	passkeyFrontendStatus: StatusDescriptor;
	passkeyBackendStatus: StatusDescriptor;
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
						title="Browser support"
						value={passkeyBrowserStatus.value}
						tone={passkeyBrowserStatus.tone}
						icon={Settings2}
					/>
				</div>

				<HStack gap={2} wrap className={styles.securityDetailRow}>
					<Badge
						variant="soft"
						color={toBadgeColor(passkeyBrowserStatus.tone)}
						size="sm"
					>
						Browser {passkeyBrowserStatus.value.toLowerCase()}
					</Badge>
					<Badge
						variant="soft"
						color={toBadgeColor(passkeyFrontendStatus.tone)}
						size="sm"
					>
						Frontend {passkeyFrontendStatus.value.toLowerCase()}
					</Badge>
					<Badge
						variant="soft"
						color={toBadgeColor(passkeyAuthStatus.tone)}
						size="sm"
					>
						{passkeyAuthStatus.value}
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

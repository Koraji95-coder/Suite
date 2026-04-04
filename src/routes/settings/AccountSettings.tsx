import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { PageContextBand } from "@/components/system/PageContextBand";
import { TrustStateBadge } from "@/components/system/TrustStateBadge";
import { Stack } from "@/components/system/base/Stack";
import { Text } from "@/components/system/base/Text";
import styles from "./AccountSettings.module.css";
import {
	AccountProfileSection,
	AccountSecurityOverviewSection,
	AccountSessionActionsSection,
} from "./AccountSettingsSections";
import {
	useAccountPasskeyState,
	useAccountProfileState,
	useAccountSessionActions,
} from "./accountSettingsHooks";
import {
	buildPasskeyAuthStatus,
	buildPasskeyBackendStatus,
	buildPasskeyBrowserStatus,
	buildPasskeyFrontendStatus,
	buildSessionAuthStatus,
} from "./accountSettingsUtils";

export default function AccountSettings() {
	const { user, profile, signOut, sessionAuthMethod, updateProfile } =
		useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const profileState = useAccountProfileState({
		profile,
		user,
		updateProfile,
	});
	const sessionActions = useAccountSessionActions();
	const passkeyState = useAccountPasskeyState({ location, navigate });

	const sessionAuthStatus = buildSessionAuthStatus(sessionAuthMethod);
	const passkeyAuthStatus = buildPasskeyAuthStatus(sessionAuthMethod);
	const passkeyBrowserStatus = buildPasskeyBrowserStatus(
		passkeyState.browserPasskeySupported,
	);
	const passkeyFrontendStatus = buildPasskeyFrontendStatus(
		passkeyState.frontendPasskeyEnabled,
	);
	const passkeyBackendStatus = buildPasskeyBackendStatus(
		passkeyState.passkeyCapability,
		passkeyState.passkeyLoading,
	);

	return (
		<Stack gap={4}>
			<PageContextBand
				eyebrow="Trust controls"
				summary={
					<Text size="sm" color="muted" block>
						Manage how this workspace recognizes you, how passkeys are staged,
						and how this device stays connected to your account.
					</Text>
				}
				meta={
					<div className={styles.trustBandFacts}>
						<div className={styles.trustBandFact}>
							<span className={styles.trustBandLabel}>Session</span>
							<TrustStateBadge
								state={sessionAuthMethod === "passkey" ? "ready" : "background"}
								label={sessionAuthStatus.value}
							/>
						</div>
						<div className={styles.trustBandFact}>
							<span className={styles.trustBandLabel}>Passkeys</span>
							<TrustStateBadge
								state={
									passkeyBackendStatus.tone === "success"
										? "ready"
										: passkeyBackendStatus.tone === "muted"
											? "background"
											: "needs-attention"
								}
								label={passkeyBackendStatus.value}
							/>
						</div>
						<div className={styles.trustBandFact}>
							<span className={styles.trustBandLabel}>Workspace</span>
							<TrustStateBadge
								state={user?.email ? "ready" : "background"}
								label={user?.email ? "Connected" : "Background"}
							/>
						</div>
					</div>
				}
			/>

			<AccountProfileSection
				displayName={profileState.displayName}
				accountEmail={profileState.accountEmail}
				canSaveProfile={profileState.canSaveProfile}
				isSavingProfile={profileState.isSavingProfile}
				profileSaved={profileState.profileSaved}
				profileError={profileState.profileError}
				onDisplayNameChange={profileState.setDisplayName}
				onAccountEmailChange={profileState.setAccountEmail}
				onSaveProfile={profileState.saveAccountProfile}
			/>

			<AccountSecurityOverviewSection
				passkeyAuthStatus={passkeyAuthStatus}
				sessionAuthStatus={sessionAuthStatus}
				passkeyBrowserStatus={passkeyBrowserStatus}
				passkeyFrontendStatus={passkeyFrontendStatus}
				passkeyBackendStatus={passkeyBackendStatus}
			/>

			<AccountSessionActionsSection
				signOut={signOut}
				onSignOutAllSessions={sessionActions.signOutAllSessions}
				isSigningOutAll={sessionActions.isSigningOutAll}
				accountActionMessage={sessionActions.accountActionMessage}
				lastSignInAt={user?.last_sign_in_at}
				userEmail={user?.email}
			/>
		</Stack>
	);
}
